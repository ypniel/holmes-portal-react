const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const https = require("https")

const JWT_SECRET = process.env.JWT_SECRET
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN
// Standard password for all Holmes staff (@holmes.edu.au contacts in HubSpot)
const HOLMES_STAFF_PASSWORD = process.env.HOLMES_STAFF_PASSWORD || "Holmes2026!"

const HOLMES_DOMAINS = ["holmes.edu.au", "holmeseducation.group"]

function hubspotRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : ""
    const req = https.request({
      hostname: "api.hubapi.com",
      path,
      method,
      headers: {
        "Authorization": `Bearer ${HUBSPOT_TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    }, (res) => {
      let chunks = ""
      res.on("data", c => chunks += c)
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(chunks || "{}") }) }
        catch { resolve({ status: res.statusCode, body: {} }) }
      })
    })
    req.on("error", reject)
    if (data) req.write(data)
    req.end()
  })
}

function isHolmesStaff(email) {
  const domain = email.split("@")[1]?.toLowerCase() || ""
  return HOLMES_DOMAINS.some(d => domain === d)
}

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) }

  if (!JWT_SECRET) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server not configured" }) }
  }

  const genericFail = { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Incorrect email or password." }) }

  try {
    const { email, password } = JSON.parse(event.body || "{}")
    if (!email || !password) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Email and password required." }) }
    }

    const cleanEmail = String(email).trim().toLowerCase()
    const staff = isHolmesStaff(cleanEmail)

    // ── Look up contact in HubSpot (required for both staff and agents) ──────
    const contactRes = await hubspotRequest(
      "/crm/v3/objects/contacts/search",
      "POST",
      {
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: cleanEmail }] }],
        properties: ["email", "firstname", "lastname", "portal_password_hash"],
        limit: 1,
      }
    )
    const contact = contactRes.body.results?.[0]

    // Contact MUST exist in HubSpot — both for staff and agents
    if (!contact) return genericFail

    let valid = false

    if (staff) {
      // ── Holmes staff: check against the shared standard password ───────────
      // The contact must exist in HubSpot AND know the staff password.
      valid = (password === HOLMES_STAFF_PASSWORD)
    } else {
      // ── External agents: check their individual bcrypt hash ─────────────────
      const hash = contact.properties?.portal_password_hash
      if (!hash) {
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ error: "No password has been set for this account. Please contact Holmes admissions." }),
        }
      }
      valid = await bcrypt.compare(password, hash)
    }

    if (!valid) return genericFail

    // ── Build session ────────────────────────────────────────────────────────
    let companyId = null
    let companyName = staff ? "Holmes Institute Australia" : ""
    let fullName = `${contact.properties?.firstname || ""} ${contact.properties?.lastname || ""}`.trim()

    if (!staff) {
      // Agents: scope to their company
      const companyAssoc = await hubspotRequest(
        `/crm/v4/objects/contacts/${contact.id}/associations/companies`,
        "GET"
      )
      companyId = companyAssoc.body.results?.[0]?.toObjectId
      if (!companyId) {
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ error: "No agency is linked to this account. Please contact Holmes admissions." }),
        }
      }
      const companyRes = await hubspotRequest(
        `/crm/v3/objects/companies/${companyId}?properties=name,contact_person_name`,
        "GET"
      )
      companyName = companyRes.body.properties?.name || ""
      const contactPerson = companyRes.body.properties?.contact_person_name || ""
      if (contactPerson) fullName = contactPerson
    }

    if (!fullName) fullName = cleanEmail.split("@")[0]

    // Staff get companyId: null → frontend/hubspot.ts shows ALL pipeline deals
    const sessionToken = jwt.sign(
      {
        email: cleanEmail,
        contactId: String(contact.id),
        companyId: companyId ? String(companyId) : null,
        role: staff ? "staff" : "agent",
        purpose: "session",
      },
      JWT_SECRET,
      { expiresIn: "12h" }
    )

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        sessionToken,
        user: {
          email: cleanEmail,
          fullName,
          companyName,
          companyId: companyId ? String(companyId) : null,
          isStaff: staff,
        },
      }),
    }
  } catch (err) {
    console.error("agent-login error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Login failed. Please try again." }) }
  }
}
