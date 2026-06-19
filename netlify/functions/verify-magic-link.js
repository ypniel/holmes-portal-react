const jwt = require("jsonwebtoken")
const https = require("https")

const JWT_SECRET = process.env.JWT_SECRET
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function hubspotGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.hubapi.com", path, method: "GET",
      headers: { "Authorization": `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" },
    }, res => {
      const chunks = []
      res.on("data", c => chunks.push(c))
      res.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())) } catch { resolve({}) } })
    })
    req.on("error", reject)
    req.end()
  })
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" }

  let token
  try {
    const body = JSON.parse(event.body || "{}")
    token = body.token
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid request" }) }
  }

  if (!token) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Token required" }) }

  try {
    const payload = jwt.verify(token, JWT_SECRET)

    if (payload.type !== "student_magic_link") {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid token type" }) }
    }

    const { email, contactId } = payload

    // Get contact details from HubSpot
    const contact = await hubspotGet(`/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,email`)
    const firstName = contact.properties?.firstname || ""
    const lastName = contact.properties?.lastname || ""
    const fullName = `${firstName} ${lastName}`.trim() || email.split("@")[0]

    // Generate session token
    const sessionToken = jwt.sign(
      { email, contactId, fullName, companyName: "Direct Student", type: "student" },
      JWT_SECRET,
      { expiresIn: "8h" }
    )

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        sessionToken,
        user: { email, fullName, companyName: "Direct Student", contactId },
      }),
    }
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Link has expired. Please request a new one." }) }
    }
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Invalid or expired link." }) }
  }
}
