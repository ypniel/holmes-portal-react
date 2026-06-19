const https = require("https")
const jwt = require("jsonwebtoken")

const JWT_SECRET = process.env.JWT_SECRET
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "Holmes Admissions <noreply@holmeseducation.group>"
const BASE_URL = process.env.MAGIC_LINK_BASE_URL || "https://holmes-admissions-portal-v2.netlify.app"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
        "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`,
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

function hubspotPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = https.request({
      hostname: "api.hubapi.com", path, method: "POST",
      headers: { "Authorization": `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
    }, res => {
      const chunks = []
      res.on("data", c => chunks.push(c))
      res.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())) } catch { resolve({}) } })
    })
    req.on("error", reject)
    req.write(data)
    req.end()
  })
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" }

  if (!JWT_SECRET) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server configuration error" }) }

  let email
  try {
    const body = JSON.parse(event.body || "{}")
    email = body.email?.trim().toLowerCase()
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid request" }) }
  }

  if (!email) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Email required" }) }

  // Look up contact in HubSpot
  const contactRes = await hubspotPost("/crm/v3/objects/contacts/search", {
    filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
    properties: ["email", "firstname", "lastname"],
    limit: 1,
  })

  const contact = contactRes.results?.[0]
  // Always return success — don't reveal if email exists
  if (!contact) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }

  const firstName = contact.properties?.firstname || ""
  const token = jwt.sign({ email, contactId: contact.id, type: "student_magic_link" }, JWT_SECRET, { expiresIn: "15m" })
  const link = `${BASE_URL}/student/verify?token=${token}`

  const html = `
<!DOCTYPE html><html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
      <tr><td style="background:#8B1A1A;padding:28px 40px;text-align:center">
        <img src="https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/EDM%20Headers%20(1).png" alt="Holmes Institute" style="max-width:180px;height:auto">
      </td></tr>
      <tr><td style="padding:40px;text-align:center">
        <p style="color:#666;margin:0 0 8px;font-size:15px">Hi${firstName ? " " + firstName : ""},</p>
        <p style="color:#444;margin:0 0 28px;font-size:15px">Click the button below to log in to the Holmes Student Portal. This link expires in <strong>15 minutes</strong>.</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${link}" style="background:#8B1A1A;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;display:inline-block">
            Log In to Portal →
          </a>
        </div>
        <p style="color:#999;font-size:13px;margin:24px 0 0">If you didn't request this, you can safely ignore this email.</p>
      </td></tr>
      <tr><td style="background:#f9f9f9;padding:16px 40px;text-align:center;border-top:1px solid #eee">
        <p style="color:#aaa;font-size:12px;margin:0">Holmes Institute Australia · admissions@holmes.edu.au</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`

  try {
    await sendEmail({ to: email, subject: "Your Holmes Portal Login Link", html })
  } catch {}

  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }
}
