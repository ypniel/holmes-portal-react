const jwt = require("jsonwebtoken")
const { Resend } = require("resend")
const https = require("https")

const JWT_SECRET = process.env.JWT_SECRET
const RESEND_API_KEY = process.env.RESEND_API_KEY
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || process.env.VITE_HUBSPOT_TOKEN

// Where the magic link should point. Defaults to the deployed site.
// Set MAGIC_LINK_BASE_URL in Netlify env to override (e.g. for previews).
const BASE_URL = process.env.MAGIC_LINK_BASE_URL || "https://holmes-admissions-portal-v2.netlify.app"

// While using Resend's test sender, emails can ONLY be delivered to the
// address that owns the Resend account. Swap to your verified domain before go-live.
const FROM_EMAIL = process.env.MAGIC_LINK_FROM || "Holmes Admissions <onboarding@resend.dev>"

const resend = new Resend(RESEND_API_KEY)

// ── Helper: look up a contact by email in HubSpot ──────────────────────────────
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

  if (!JWT_SECRET || !RESEND_API_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server not configured" }) }
  }

  try {
    const { email } = JSON.parse(event.body || "{}")
    if (!email) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Email required" }) }

    const cleanEmail = String(email).trim().toLowerCase()

    // 1. Confirm the contact exists in HubSpot
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

    // 2. SECURITY: always respond with success, even if no contact found.
    //    This prevents attackers from using this endpoint to discover which
    //    emails are registered. We simply don't send an email if there's no match.
    if (!contact) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }
    }

    // 3. Mint a short-lived signed token (15 minutes)
    const token = jwt.sign(
      { email: cleanEmail, purpose: "magic-login" },
      JWT_SECRET,
      { expiresIn: "15m" }
    )

    const magicUrl = `${BASE_URL}/student/verify?token=${encodeURIComponent(token)}`

    // 4. Email the link via Resend
    await resend.emails.send({
      from: FROM_EMAIL,
      to: cleanEmail,
      subject: "Your Holmes Admissions login link",
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #991b1b;">Holmes Institute Australia</h2>
          <p>Hello,</p>
          <p>Click the button below to securely access your application. This link expires in 15 minutes.</p>
          <p style="margin: 28px 0;">
            <a href="${magicUrl}"
               style="background: #991b1b; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              View My Application
            </a>
          </p>
          <p style="color: #666; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">Holmes Institute Australia · Admissions</p>
        </div>
      `,
    })

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    console.error("request-magic-link error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Could not send link" }) }
  }
}
