const bcrypt = require("bcryptjs")
const https = require("https")

const ADMIN_SECRET = process.env.ADMIN_SECRET
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const SENDGRID_TEMPLATE_ID = process.env.SENDGRID_TEMPLATE_ID
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@holmeseducation.group"
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || "Holmes Admissions"
const PORTAL_URL = "https://aportal.holmes.edu.au"
const SALT_ROUNDS = 12

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

function sendgridRequest(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = https.request({
      hostname: "api.sendgrid.com",
      path: "/v3/mail/send",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    }, (res) => {
      let chunks = ""
      res.on("data", c => chunks += c)
      res.on("end", () => resolve({ status: res.statusCode, body: chunks }))
    })
    req.on("error", reject)
    req.write(data)
    req.end()
  })
}

function generatePassword(contactId) {
  const last4 = String(contactId).slice(-4)
  return `HI@${last4}`
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
    const { email, adminSecret, sendEmail = true } = JSON.parse(event.body || "{}")

    if (!adminSecret || adminSecret !== ADMIN_SECRET) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Invalid admin secret." }) }
    }
    if (!email) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Email required." }) }

    const cleanEmail = String(email).trim().toLowerCase()

    // ── 1. Look up contact in HubSpot ─────────────────────────────────────
    const contactRes = await hubspotRequest("/crm/v3/objects/contacts/search", "POST", {
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: cleanEmail }] }],
      properties: ["email", "firstname", "lastname"],
      limit: 1,
    })
    const contact = contactRes.body.results?.[0]
    if (!contact) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: `No contact found for ${cleanEmail}` }) }
    }

    // ── 2. Generate + hash password ───────────────────────────────────────
    const password = generatePassword(contact.id)
    const hash = await bcrypt.hash(password, SALT_ROUNDS)

    // ── 3. Save hash to HubSpot ───────────────────────────────────────────
    const patchRes = await hubspotRequest(`/crm/v3/objects/contacts/${contact.id}`, "PATCH", {
      properties: { portal_password_hash: hash }
    })
    if (patchRes.status !== 200) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Failed to update HubSpot." }) }
    }

    const firstName = contact.properties?.firstname || ""
    const lastName = contact.properties?.lastname || ""
    const fullName = `${firstName} ${lastName}`.trim() || cleanEmail

    // ── 4. Send email via SendGrid ────────────────────────────────────────
    let emailSent = false
    let emailError = null

    if (sendEmail && SENDGRID_API_KEY && SENDGRID_TEMPLATE_ID) {
      const sgRes = await sendgridRequest({
        from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
        personalizations: [{
          to: [{ email: cleanEmail, name: fullName }],
          dynamic_template_data: {
            firstName: firstName || fullName,
            portalUrl: PORTAL_URL,
            email: cleanEmail,
            password: password,
          },
        }],
        template_id: SENDGRID_TEMPLATE_ID,
      })
      if (sgRes.status >= 200 && sgRes.status < 300) {
        emailSent = true
      } else {
        emailError = `SendGrid error ${sgRes.status}: ${sgRes.body}`
        console.error("SendGrid send failed:", emailError)
      }
    } else if (sendEmail) {
      emailError = "SendGrid not configured — password set but email not sent."
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, email: cleanEmail, fullName, password, contactId: contact.id, emailSent, emailError: emailError || undefined }),
    }
  } catch (err) {
    console.error("set-agent-password error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}
