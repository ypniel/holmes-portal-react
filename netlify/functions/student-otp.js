const https = require("https")
const jwt = require("jsonwebtoken")

const JWT_SECRET = process.env.JWT_SECRET
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "Holmes Admissions <noreply@holmeseducation.group>"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
      hostname: "api.sendgrid.com", path: "/v3/mail/send", method: "POST",
      headers: { "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
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

  let action, email, code, otpToken
  try {
    const body = JSON.parse(event.body || "{}")
    action = body.action
    email = body.email?.trim().toLowerCase()
    code = body.code?.trim()
    otpToken = body.otpToken
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid request" }) }
  }

  // ── SEND OTP ──────────────────────────────────────────────────────────────
  if (action === "send") {
    if (!email) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Email required" }) }

    // Look up contact by student email only
    const contactRes = await hubspotPost("/crm/v3/objects/contacts/search", {
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
      properties: ["email", "firstname", "lastname"],
      limit: 1,
    })
    const contact = contactRes.results?.[0]

    // No contact found — don't reveal this, return ok but no token
    if (!contact) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }

    const firstName = contact.properties?.firstname || ""
    const otp = String(Math.floor(100000 + Math.random() * 900000))

    // Student token — no company association needed
    const token = jwt.sign(
      { email, otp, contactId: contact.id, type: "student_otp" },
      JWT_SECRET,
      { expiresIn: "10m" }
    )

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
        <p style="color:#444;margin:0 0 28px;font-size:15px">Your Holmes Student Portal login code is:</p>
        <div style="background:#f5f0f0;border:2px solid #8B1A1A;border-radius:12px;padding:20px 40px;display:inline-block;margin:0 auto 28px">
          <span style="font-size:42px;font-weight:bold;color:#8B1A1A;letter-spacing:12px">${otp}</span>
        </div>
        <p style="color:#888;font-size:13px;margin:0">This code expires in <strong>10 minutes</strong>.<br>If you didn't request this, you can safely ignore this email.</p>
      </td></tr>
      <tr><td style="background:#f9f9f9;padding:16px 40px;text-align:center;border-top:1px solid #eee">
        <p style="color:#aaa;font-size:12px;margin:0">Holmes Institute Australia · admissions@holmes.edu.au</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`

    await sendEmail({ to: email, subject: `${otp} — Your Holmes Student Portal Login Code`, html })

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, otpToken: token }) }
  }

  // ── VERIFY OTP ────────────────────────────────────────────────────────────
  if (action === "verify") {
    if (!code || !email || !otpToken) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Code and email required" }) }
    }

    let payload
    try {
      payload = jwt.verify(otpToken, JWT_SECRET)
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Code expired. Please request a new one." }) }
      }
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Invalid session." }) }
    }

    if (payload.type !== "student_otp") {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Invalid token type." }) }
    }
    if (payload.email !== email) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Email mismatch." }) }
    }
    if (payload.otp !== code) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Incorrect code. Please try again." }) }
    }

    // Get student's full name
    const contactRes = await hubspotPost("/crm/v3/objects/contacts/search", {
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
      properties: ["email", "firstname", "lastname"],
      limit: 1,
    })
    const contact = contactRes.results?.[0]
    const firstName = contact?.properties?.firstname || ""
    const lastName = contact?.properties?.lastname || ""
    const fullName = `${firstName} ${lastName}`.trim() || email.split("@")[0]

    // Generate session token — student only, no company
    const sessionToken = jwt.sign(
      { email, contactId: payload.contactId, companyName: "Direct Student", type: "student", fullName },
      JWT_SECRET,
      { expiresIn: "8h" }
    )

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        sessionToken,
        user: { email, fullName, companyName: "Direct Student", companyId: null, contactId: payload.contactId },
      }),
    }
  }

  return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid action" }) }
}
