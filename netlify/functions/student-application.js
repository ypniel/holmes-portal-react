const jwt = require("jsonwebtoken")
const https = require("https")

const JWT_SECRET = process.env.JWT_SECRET
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || process.env.VITE_HUBSPOT_TOKEN

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

  try {
    const { sessionToken } = JSON.parse(event.body || "{}")
    if (!sessionToken) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "No session" }) }

    // Verify the session token
    let payload
    try {
      payload = jwt.verify(sessionToken, JWT_SECRET)
    } catch {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Session expired. Please sign in again." }) }
    }

    if (payload.purpose !== "session" || payload.role !== "student") {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Invalid session." }) }
    }

    // Re-check for an associated deal using the contactId from the token
    // (authoritative — we never trust a dealId sent by the browser)
    const dealAssoc = await hubspotRequest(
      `/crm/v4/objects/contacts/${payload.contactId}/associations/deals`,
      "GET"
    )
    const dealId = dealAssoc.body.results?.[0]?.toObjectId || null

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, dealId: dealId ? String(dealId) : null }),
    }
  } catch (err) {
    console.error("student-application error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Lookup failed." }) }
  }
}
