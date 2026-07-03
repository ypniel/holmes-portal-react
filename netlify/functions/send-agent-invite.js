const jwt = require("jsonwebtoken")
const https = require("https")

const JWT_SECRET = process.env.JWT_SECRET
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN
const ADMIN_SECRET = process.env.ADMIN_SECRET
const BASE_URL = process.env.MAGIC_LINK_BASE_URL || "https://holmes-admissions-portal-v2.netlify.app"
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "Holmes Admissions <noreply@holmeseducation.group>"


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


async function sendEmail({ to, from: fromEmail, subject, html }) {
  const https = require("https")
  const body = JSON.stringify({
    personalizations: [{ to: [{ email: to }] }],
    from: { email: fromEmail.match(/<(.+)>/) ? fromEmail.match(/<(.+)>/)[1] : fromEmail,
            name: fromEmail.match(/^(.+)</) ? fromEmail.match(/^(.+)</)[1].trim() : "Holmes Admissions" },
    subject,
    content: [{ type: "text/html", value: html }],
  })
  return new Promise((resolve, reject) => {
    const req = require("https").request({
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
      res.on("end", () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString() }))
    })
    req.on("error", reject)
    req.write(body)
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
  if (!JWT_SECRET || !ADMIN_SECRET) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server not configured" }) }
  }

  try {
    const { email, adminSecret } = JSON.parse(event.body || "{}")

    if (!adminSecret || adminSecret !== ADMIN_SECRET) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Invalid admin secret." }) }
    }
    if (!email) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Email required." }) }

    const cleanEmail = String(email).trim().toLowerCase()

    // Look up contact in HubSpot — must exist
    const contactRes = await hubspotRequest(
      "/crm/v3/objects/contacts/search", "POST",
      {
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: cleanEmail }] }],
        properties: ["email", "firstname", "lastname"],
        limit: 1,
      }
    )
    const contact = contactRes.body.results?.[0]
    if (!contact) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: `No contact found for ${cleanEmail}` }) }
    }

    // Confirm they're an agent (has company association)
    const companyAssoc = await hubspotRequest(
      `/crm/v4/objects/contacts/${contact.id}/associations/companies`, "GET"
    )
    const hasCompany = companyAssoc.body.results?.length > 0
    if (!hasCompany) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "This contact is not associated with an agency." }) }
    }

    // Mint a 24hr setup token (longer than reset — gives them time to action it)
    const token = jwt.sign(
      { email: cleanEmail, contactId: String(contact.id), purpose: "password-reset" },
      JWT_SECRET,
      { expiresIn: "24h" }
    )

    const setupUrl = `${BASE_URL}/agent/set-password?token=${encodeURIComponent(token)}`
    const firstName = contact.properties?.firstname || ""
    const lastName = contact.properties?.lastname || ""
    const fullName = `${firstName} ${lastName}`.trim() || cleanEmail

    await sendEmail({
      from: FROM_EMAIL,
      to: cleanEmail,
      subject: "Set up your Holmes Agent Portal access",
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
                      <p style="margin:0 0 24px 0;">Dear ${firstName ? firstName : "Agent"},</p>
                      <p style="margin:0 0 16px 0;">
                        You have been granted access to the <strong>Holmes Institute Agent Portal</strong>.
                        The portal allows you to submit and track student applications directly with our admissions team.
                      </p>
                      <p style="margin:0 0 32px 0;">
                        Click the button below to set up your password and activate your account.
                        This link expires in <strong>24 hours</strong>.
                      </p>
                      <p style="margin:0 0 32px 0; text-align:center;">
                        <a href="${setupUrl}"
                           style="background:#991b1b; color:#ffffff; padding:14px 32px; border-radius:6px; text-decoration:none; font-weight:bold; font-family:Arial, sans-serif; font-size:15px; display:inline-block;">
                          Set Up My Password
                        </a>
                      </p>
                      <p style="margin:0 0 8px 0; color:#555555; font-size:14px;">
                        Once your password is set, you can sign in at:
                      </p>
                      <p style="margin:0 0 24px 0;">
                        <a href="${BASE_URL}/agent-login" style="color:#991b1b; font-size:14px;">${BASE_URL}/agent-login</a>
                      </p>
                      <p style="margin:0; color:#777777; font-size:14px;">
                        If you weren't expecting this email, you can safely ignore it.
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
                      <p style="margin:0; color:#ffffff; font-size:14px; font-weight:bold; font-family:Arial, sans-serif;">Holmes Institute Australia</p>
                      <p style="margin:8px 0 0 0; color:#f0c0c0; font-size:12px; font-family:Arial, sans-serif;">Admissions Agent Portal</p>
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

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, fullName, email: cleanEmail }),
    }
  } catch (err) {
    console.error("send-agent-invite error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Failed to send invite. Please try again." }) }
  }
}
