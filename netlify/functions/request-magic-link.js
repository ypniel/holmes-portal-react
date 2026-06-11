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
    const firstName = contact.properties?.firstname || ""
    const greeting = firstName ? `Dear ${firstName},` : "Dear Applicant,"

    await resend.emails.send({
      from: FROM_EMAIL,
      to: cleanEmail,
      subject: "Your Holmes Institute login link",
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0; padding:0; background:#f4f4f4; font-family: Georgia, 'Times New Roman', serif;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4; padding:24px 0;">
            <tr>
              <td align="center">
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; max-width:600px; width:100%; border:1px solid #e5e5e5;">

                  <!-- Logo -->
                  <tr>
                    <td style="padding:32px 40px 0 40px;" align="right">
                      <img src="https://holmes.edu.au/templates/images/Logo-base-banner.png"
                           alt="Holmes Institute" height="56" style="height:56px; width:auto;" />
                    </td>
                  </tr>

                  <!-- Top divider -->
                  <tr>
                    <td style="padding:24px 40px 0 40px;">
                      <hr style="border:none; border-top:1px solid #d4d4d4; margin:0;" />
                    </td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="padding:32px 40px; color:#333333; font-size:16px; line-height:1.6;">
                      <p style="margin:0 0 24px 0;">${greeting}</p>
                      <p style="margin:0 0 24px 0;">
                        Holmes Institute uses an online portal for all student applications.
                        Click the button below to securely access your application.
                      </p>
                      <p style="margin:0 0 32px 0; text-align:center;">
                        <a href="${magicUrl}"
                           style="background:#991b1b; color:#ffffff; padding:14px 32px; border-radius:6px; text-decoration:none; font-weight:bold; font-family:Arial, sans-serif; font-size:15px; display:inline-block;">
                          View My Application
                        </a>
                      </p>
                      <p style="margin:0 0 24px 0; color:#777777; font-size:14px;">
                        This secure link will expire in 15 minutes. If the button doesn't work, you can request a new link from the portal.
                      </p>
                      <p style="margin:0; color:#777777; font-size:14px;">
                        All communication is now handled through the portal. Once your application is received,
                        our admissions team will respond within 24&ndash;48 hours.
                      </p>
                    </td>
                  </tr>

                  <!-- Bottom divider -->
                  <tr>
                    <td style="padding:0 40px;">
                      <hr style="border:none; border-top:1px solid #d4d4d4; margin:0;" />
                    </td>
                  </tr>

                  <!-- Maroon footer -->
                  <tr>
                    <td style="background:#991b1b; padding:28px 40px; text-align:center; margin-top:24px;">
                      <p style="margin:0; color:#ffffff; font-size:14px; font-weight:bold; font-family:Arial, sans-serif;">
                        Holmes Institute
                      </p>
                      <p style="margin:8px 0 0 0; color:#f0c0c0; font-size:12px; font-family:Arial, sans-serif;">
                        If you didn't request this email, you can safely ignore it.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    })

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    console.error("request-magic-link error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Could not send link" }) }
  }
}
