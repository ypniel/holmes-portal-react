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
    const { token } = JSON.parse(event.body || "{}")
    if (!token) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Token required" }) }

    // 1. Verify the token signature + expiry
    let payload
    try {
      payload = jwt.verify(token, JWT_SECRET)
    } catch {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "This link is invalid or has expired. Please request a new one." }) }
    }

    if (payload.purpose !== "magic-login") {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Invalid link." }) }
    }

    const email = payload.email

    // 2. Re-confirm contact + find their deal (server-side, authoritative)
    const contactRes = await hubspotRequest(
      "/crm/v3/objects/contacts/search",
      "POST",
      {
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
        properties: ["email", "firstname", "lastname"],
        limit: 1,
      }
    )
    const contact = contactRes.body.results?.[0]
    if (!contact) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: "Account not found." }) }
    }

    // 3. Get their associated deal
    const dealAssoc = await hubspotRequest(
      `/crm/v4/objects/contacts/${contact.id}/associations/deals`,
      "GET"
    )
    const dealId = dealAssoc.body.results?.[0]?.toObjectId
    if (!dealId) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: "No application found for this account." }) }
    }

    // 4. Issue a SESSION token (longer-lived, scoped to this dealId).
    //    This is what the app uses for subsequent requests. Because the
    //    dealId is baked into a signed token, the student cannot tamper
    //    with it client-side to view other applications.
    const sessionToken = jwt.sign(
      {
        email,
        dealId: String(dealId),
        contactId: String(contact.id),
        role: "student",
        purpose: "session",
      },
      JWT_SECRET,
      { expiresIn: "12h" }
    )

    const fn = contact.properties?.firstname || ""
    const ln = contact.properties?.lastname || ""
    const fullName = `${fn} ${ln}`.trim() || email.split("@")[0]

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        sessionToken,
        student: { email, fullName, dealId: String(dealId) },
      }),
    }
  } catch (err) {
    console.error("verify-magic-link error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Verification failed." }) }
  }
}
