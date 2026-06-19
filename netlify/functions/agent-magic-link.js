const https = require("https")
const jwt = require("jsonwebtoken")

const JWT_SECRET = process.env.JWT_SECRET
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "Holmes Admissions <noreply@holmeseducation.group>"
const BASE_URL = process.env.MAGIC_LINK_BASE_URL || "https://holmes-admissions-portal-v2.netlify.app"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function hubspotGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.hubapi.com",
      path,
      method: "GET",
      headers: { "Authorization": `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" },
    }, res => {
      const chunks = []
      res.on("data", c => chunks.push(c))
      res.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch { resolve({}) }
      })
    })
    req.on("error", reject)
    req.end()
  })
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
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch { resolve({}) }
      })
    })
    req.on("error", reject)
    req.write(data)
    req.end()
  })
}

async function sendEmail({ to, subject, html }) {
  const fromEmail = FROM_EMAIL.includes("<") ? FROM_EMAIL.match(/<(.+)>/)[1] : FROM_EMAIL
  const fromName = FROM_EMAIL.includes("<") ? FROM_EMAIL.split("<")[0].trim() : "Holmes Admissions"
  const body = JSON.stringify({
    personalizations: [{ to: [{ email: to }] }],
    from: { email: fromEmail, name: fromName },
    subject,
    content: [{ type: "text/html", value: html }],
  })
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.sendgrid.com",
      path: "/v3/mail/send",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      }
    }, res => {
      const chunks = []
      res.on("data", c => chunks.push(c))
      res.on("end", () => resolve({ statusCode: res.statusCode }))
    })
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" }

  if (!JWT_SECRET || !SENDGRID_API_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server configuration error" }) }
  }

  let email
  try {
    const body = JSON.parse(event.body || "{}")
    email = body.email?.trim().toLowerCase()
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid request" }) }
  }

  if (!email) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Email required" }) }
  }

  // Look up contact in HubSpot to verify they exist as an agent
  try {
    const contactRes = await hubspotPost("/crm/v3/objects/contacts/search", {
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
      properties: ["email", "firstname", "lastname"],
      limit: 1,
    })

    const contact = contactRes.results?.[0]
    if (!contact) {
      // Don't reveal whether email exists — return success anyway
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }
    }

    const contactId = contact.id
    const firstName = contact.properties?.firstname || ""

    // Get company
    const assocRes = await hubspotGet(`/crm/v4/objects/contacts/${contactId}/associations/companies`)
    const companyId = assocRes.results?.[0]?.toObjectId
    let companyName = ""
    if (companyId) {
      const companyData = await hubspotGet(`/crm/v3/objects/companies/${companyId}?properties=name`)
      companyName = companyData.properties?.name || ""
    }

    // Generate a 15-minute token
    const token = jwt.sign(
      { email, contactId, companyId: companyId ? String(companyId) : null, companyName, type: "agent_magic_link" },
      JWT_SECRET,
      { expiresIn: "15m" }
    )

    const link = `${BASE_URL}/agent/magic-link?token=${token}`

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
      <tr><td style="background:#8B1A1A;padding:32px 40px;text-align:center">
        <img src="https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/EDM%20Headers%20(1).png" alt="Holmes Institute" style="max-width:200px;height:auto">
      </td></tr>
      <tr><td style="padding:40px">
        <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px">Your Login Link</h2>
        <p style="color:#666;margin:0 0 24px;font-size:15px">Hi${firstName ? " " + firstName : ""},</p>
        <p style="color:#444;margin:0 0 28px;font-size:15px;line-height:1.6">
          Click the button below to log in to the Holmes Admissions Portal. This link expires in <strong>15 minutes</strong>.
        </p>
        <div style="text-align:center;margin:32px 0">
          <a href="${link}" style="background:#8B1A1A;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;display:inline-block">
            Log In to Portal →
          </a>
        </div>
        <p style="color:#999;font-size:13px;margin:24px 0 0;line-height:1.6">
          If you didn't request this, you can safely ignore this email.<br>
          This link can only be used once and expires in 15 minutes.
        </p>
      </td></tr>
      <tr><td style="background:#f9f9f9;padding:20px 40px;text-align:center;border-top:1px solid #eee">
        <p style="color:#aaa;font-size:12px;margin:0">Holmes Institute Australia · admissions@holmes.edu.au</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`

    await sendEmail({
      to: email,
      subject: "Your Holmes Portal Login Link",
      html,
    })

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}
