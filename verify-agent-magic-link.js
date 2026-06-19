const jwt = require("jsonwebtoken")
const https = require("https")

const JWT_SECRET = process.env.JWT_SECRET
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function hubspotPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = https.request({
      hostname: "api.hubapi.com",
      path,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HUBSPOT_TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    }, res => {
      const chunks = []
      res.on("data", c => chunks.push(c))
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }) }
        catch { resolve({ status: res.statusCode, data: {} }) }
      })
    })
    req.on("error", reject)
    req.write(data)
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

  if (!token) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Token required" }) }
  }

  try {
    // Verify and decode the JWT
    const payload = jwt.verify(token, JWT_SECRET)

    if (payload.type !== "agent_magic_link") {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid token type" }) }
    }

    const { email, contactId, companyId, companyName } = payload

    // Look up agent's full name from HubSpot
    const contactRes = await hubspotPost("/crm/v3/objects/contacts/search", {
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
      properties: ["email", "firstname", "lastname"],
      limit: 1,
    })

    const contact = contactRes.data?.results?.[0]
    const firstName = contact?.properties?.firstname || ""
    const lastName = contact?.properties?.lastname || ""
    const fullName = `${firstName} ${lastName}`.trim() || email.split("@")[0]

    // Generate a session JWT (same format as password login)
    const sessionToken = jwt.sign(
      { email, contactId, companyId, companyName, fullName },
      JWT_SECRET,
      { expiresIn: "8h" }
    )

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        sessionToken,
        user: {
          email,
          fullName,
          companyName: companyName || "",
          companyId: companyId || null,
          contactId,
        },
      }),
    }
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Link has expired. Please request a new one." }) }
    }
    if (err.name === "JsonWebTokenError") {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Invalid link." }) }
    }
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}
