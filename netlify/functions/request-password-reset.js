const jwt = require("jsonwebtoken")
const { Resend } = require("resend")
const https = require("https")

const JWT_SECRET = process.env.JWT_SECRET
const RESEND_API_KEY = process.env.RESEND_API_KEY
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || process.env.VITE_HUBSPOT_TOKEN
const BASE_URL = process.env.MAGIC_LINK_BASE_URL || "https://holmes-admissions-portal-v2.netlify.app"
const FROM_EMAIL = process.env.MAGIC_LINK_FROM || "Holmes Admissions <onboarding@resend.dev>"

const resend = new Resend(RESEND_API_KEY)

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
  if (!JWT_SECRET || !RESEND_API_KEY) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server not configured" }) }

  try {
    const { email } = JSON.parse(event.body || "{}")
    if (!email) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Email required" }) }

    const cleanEmail = String(email).trim().toLowerCase()

    // Look up contact in HubSpot — must exist AND be associated with a company (agent)
    const contactRes = await hubspotRequest(
      "/crm/v3/objects/contacts/search", "POST",
      {
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: cleanEmail }] }],
        properties: ["email", "firstname", "lastname"],
        limit: 1,
      }
    )
    const contact = contactRes.body.results?.[0]

    // Always return ok:true — don't reveal if email exists
    if (!contact) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }

    // Confirm it's an agent (has company association)
    const companyAssoc = await hubspotRequest(
      `/crm/v4/objects/contacts/${contact.id}/associations/companies`, "GET"
    )
    const hasCompany = companyAssoc.body.results?.length > 0
    if (!hasCompany) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) }

    // Mint a short-lived reset token (15 minutes)
    const token = jwt.sign(
      { email: cleanEmail, contactId: String(contact.id), purpose: "password-reset" },
      JWT_SECRET,
      { expiresIn: "15m" }
    )

    const resetUrl = `${BASE_URL}/agent/set-password?token=${encodeURIComponent(token)}`
    const firstName = contact.properties?.firstname || ""

    await resend.emails.send({
      from: FROM_EMAIL,
      to: cleanEmail,
      subject: "Reset your Holmes Agent Portal password",
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0; padding:0; background:#f4f4f4; font-family: Georgia, 'Times New Roman', serif;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4; padding:24px 0;">
            <tr>
              <td align="center">
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; max-width:600px; width:100%; border:1px solid #e5e5e5;">
                  <tr>
                    <td style="padding:32px 40px 0 40px;" align="right">
                      <img src="https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/EDM%20Headers%20(1).png"
                           alt="Holmes Institute" height="56" style="height:56px; width:auto;" />
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:24px 40px 0 40px;">
                      <hr style="border:none; border-top:1px solid #d4d4d4; margin:0;" />
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px 40px; color:#333333; font-size:16px; line-height:1.6;">
                      <p style="margin:0 0 24px 0;">${firstName ? `Dear ${firstName},` : "Dear Agent,"}</p>
                      <p style="margin:0 0 24px 0;">
                        We received a request to reset your Holmes Agent Portal password.
                        Click the button below to choose a new password. This link expires in 15 minutes.
                      </p>
                      <p style="margin:0 0 32px 0; text-align:center;">
                        <a href="${resetUrl}"
                           style="background:#991b1b; color:#ffffff; padding:14px 32px; border-radius:6px; text-decoration:none; font-weight:bold; font-family:Arial, sans-serif; font-size:15px; display:inline-block;">
                          Reset My Password
                        </a>
                      </p>
                      <p style="margin:0; color:#777777; font-size:14px;">
                        If you didn't request this, you can safely ignore this email. Your password won't change.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 40px;">
                      <hr style="border:none; border-top:1px solid #d4d4d4; margin:0;" />
                    </td>
                  </tr>
                  <tr>
                    <td style="background:#991b1b; padding:28px 40px; text-align:center;">
                      <p style="margin:0; color:#ffffff; font-size:14px; font-weight:bold; font-family:Arial, sans-serif;">Holmes Institute</p>
                      <p style="margin:8px 0 0 0; color:#f0c0c0; font-size:12px; font-family:Arial, sans-serif;">Agent Portal</p>
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
    console.error("request-password-reset error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Could not send reset link" }) }
  }
}
