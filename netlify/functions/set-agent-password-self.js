const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const https = require("https")

const JWT_SECRET = process.env.JWT_SECRET
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN || process.env.VITE_HUBSPOT_TOKEN
const SALT_ROUNDS = 10

function hubspotRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : ""
    const req = https.request({
      hostname: "api.hubapi.com",
      path, method,
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
  if (!JWT_SECRET) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server not configured" }) }

  try {
    const { token, password } = JSON.parse(event.body || "{}")

    if (!token) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Reset token required" }) }
    if (!password) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Password required" }) }

    // Password rules: minimum 8 characters
    if (password.length < 8) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Password must be at least 8 characters." }) }
    }

    // Verify the reset token
    let payload
    try {
      payload = jwt.verify(token, JWT_SECRET)
    } catch {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "This reset link has expired or is invalid. Please request a new one." }) }
    }

    if (payload.purpose !== "password-reset") {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Invalid reset link." }) }
    }

    // Hash the new password and save to HubSpot
    const hash = await bcrypt.hash(password, SALT_ROUNDS)

    const patchRes = await hubspotRequest(
      `/crm/v3/objects/contacts/${payload.contactId}`, "PATCH",
      { properties: { portal_password_hash: hash } }
    )

    if (patchRes.status !== 200) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Failed to save password. Please try again." }) }
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    console.error("set-agent-password-self error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Something went wrong. Please try again." }) }
  }
}
