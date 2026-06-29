const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const https = require("https")

const JWT_SECRET = process.env.JWT_SECRET
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN

const HOLMES_DOMAINS = ["holmes.edu.au", "holmeseducation.group"]

const EMAIL_NOT_FOUND_MESSAGE =
  "This email address is not registered for access to the Holmes Admissions Portal. Please check that you are using the correct agent email address. If you believe you should have access, contact admissions@holmes.edu.au."

const WRONG_PASSWORD_MESSAGE =
  "The password entered is incorrect. Please check your email for the login instructions. If you continue to experience difficulties, contact admissions@holmes.edu.au."

function hubspotRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : ""

    const req = https.request(
      {
        hostname: "api.hubapi.com",
        path,
        method,
        headers: {
          Authorization: `Bearer ${HUBSPOT_TOKEN}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let chunks = ""

        res.on("data", (c) => {
          chunks += c
        })

        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode,
              body: JSON.parse(chunks || "{}"),
            })
          } catch {
            resolve({
              status: res.statusCode,
              body: {},
            })
          }
        })
      }
    )

    req.on("error", reject)

    if (data) req.write(data)

    req.end()
  })
}

function isHolmesStaff(email) {
  const domain = email.split("@")[1]?.toLowerCase() || ""
  return HOLMES_DOMAINS.some((d) => domain === d)
}

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  }

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    }
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Method not allowed",
      }),
    }
  }

  if (!JWT_SECRET) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Server not configured",
      }),
    }
  }

  try {
    const { email, password } = JSON.parse(event.body || "{}")

    if (!email || !password) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Email and password required.",
        }),
      }
    }

    const cleanEmail = String(email).trim().toLowerCase()
    const staff = isHolmesStaff(cleanEmail)

    // Look up contact in HubSpot.
    // Both staff and agents must exist as contacts.
    const contactRes = await hubspotRequest(
      "/crm/v3/objects/contacts/search",
      "POST",
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "email",
                operator: "EQ",
                value: cleanEmail,
              },
            ],
          },
        ],
        properties: ["email", "firstname", "lastname", "portal_password_hash"],
        limit: 1,
      }
    )

    const contact = contactRes.body.results?.[0]

    // Email does not exist in HubSpot.
    if (!contact) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          error: EMAIL_NOT_FOUND_MESSAGE,
          reason: "email_not_found",
        }),
      }
    }

    // Holmes staff should not use the agent password login.
    if (staff) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({
          error:
            "Holmes staff sign in using the 6-digit email code. Please use the 'Holmes Staff' option on the login page.",
          reason: "staff_login_required",
        }),
      }
    }

    // External agents: check their individual bcrypt hash.
    const hash = contact.properties?.portal_password_hash

    // Email exists, but password has not been set.
    // From the agent's perspective, this should point them back to the login instructions.
    if (!hash) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          error: WRONG_PASSWORD_MESSAGE,
          reason: "password_not_set",
        }),
      }
    }

    const valid = await bcrypt.compare(password, hash)

    // Email exists, but password is incorrect.
    if (!valid) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          error: WRONG_PASSWORD_MESSAGE,
          reason: "wrong_password",
        }),
      }
    }

    // Build session.
    let companyId = null
    let companyName = ""
    let fullName = `${contact.properties?.firstname || ""} ${
      contact.properties?.lastname || ""
    }`.trim()

    // Agents: scope to their company.
    const companyAssoc = await hubspotRequest(
      `/crm/v4/objects/contacts/${contact.id}/associations/companies`,
      "GET"
    )

    companyId = companyAssoc.body.results?.[0]?.toObjectId

    if (!companyId) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "No agency is linked to this account. Please contact admissions@holmes.edu.au.",
          reason: "no_agency_linked",
        }),
      }
    }

    const companyRes = await hubspotRequest(
      `/crm/v3/objects/companies/${companyId}?properties=name,contact_person_name`,
      "GET"
    )

    companyName = companyRes.body.properties?.name || ""

    const contactPerson =
      companyRes.body.properties?.contact_person_name || ""

    if (contactPerson) fullName = contactPerson

    if (!fullName) fullName = cleanEmail.split("@")[0]

    const sessionToken = jwt.sign(
      {
        email: cleanEmail,
        contactId: String(contact.id),
        companyId: companyId ? String(companyId) : null,
        role: "agent",
        purpose: "session",
      },
      JWT_SECRET,
      {
        expiresIn: "12h",
      }
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
          isStaff: false,
        },
      }),
    }
  } catch (err) {
    console.error("agent-login error:", err.message)

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Login failed. Please try again.",
      }),
    }
  }
}
