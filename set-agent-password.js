const bcrypt = require("bcryptjs")
const https = require("https")

const ADMIN_SECRET = process.env.ADMIN_SECRET
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN
const SALT_ROUNDS = 10

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

// Deterministic password formula: H0lmesv2_ + last 4 of contact ID + HI
function generatePassword(contactId) {
  const last4 = String(contactId).slice(-4)
  return `H0lmesv2_${last4}HI`
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

  if (!ADMIN_SECRET) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server not configured" }) }

  try {
    const { email, adminSecret } = JSON.parse(event.body || "{}")

    if (!adminSecret || adminSecret !== ADMIN_SECRET) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Invalid admin secret." }) }
    }

    if (!email) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Email required." }) }

    const cleanEmail = String(email).trim().toLowerCase()

    // Look up contact
    const contactRes = await hubspotRequest(
      "/crm/v3/objects/contacts/search",
      "POST",
      {
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: cleanEmail }] }],
        properties: ["email", "firstname", "lastname"],
        limit: 1,
      }
    )
    const contact = contactRes.body.results?.[0]
    if (!contact) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: `No contact found for ${cleanEmail}` }) }
    }

    const password = generatePassword(contact.id)
    const hash = await bcrypt.hash(password, SALT_ROUNDS)

    // Write hash to HubSpot
    const patchRes = await hubspotRequest(
      `/crm/v3/objects/contacts/${contact.id}`,
      "PATCH",
      { properties: { portal_password_hash: hash } }
    )

    if (patchRes.status !== 200) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Failed to update HubSpot." }) }
    }

    const fn = contact.properties?.firstname || ""
    const ln = contact.properties?.lastname || ""
    const fullName = `${fn} ${ln}`.trim() || cleanEmail

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, email: cleanEmail, fullName, password, contactId: contact.id }),
    }
  } catch (err) {
    console.error("set-agent-password error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}
