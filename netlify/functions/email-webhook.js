// HubSpot native webhook — subscribed to Deal "Association Changed" events.
// When an email (or other activity) is associated to a deal, HubSpot POSTs:
//   [{ objectId: <dealId>, subscriptionType: "object.associationChange", ... }]
//
// We start from the deal, look at its latest email, and set response_status:
//   Latest email has "Comment by Agent" marker → portal/agent → Holmes_Received
//   Otherwise → Holmes staff reply → Waiting_on_Agent

const https = require("https")

const TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN
const PIPELINE_ID = "789344406"
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@holmeseducation.group"
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || "Holmes Admissions"
const PORTAL_URL = "https://aportal.holmes.edu.au"

function hs(path, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : ""
    const req = https.request({
      hostname: "api.hubapi.com",
      path, method,
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      const chunks = []
      res.on("data", c => chunks.push(c))
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString() || "{}") }) }
        catch { resolve({ status: res.statusCode, body: {} }) }
      })
    })
    req.on("error", reject)
    if (data) req.write(data)
    req.end()
  })
}

function sendgrid(body) {
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

// Notify the agent that Holmes has replied, via a no-reply email (no message content)
async function notifyAgent(dealId) {
  try {
    if (!SENDGRID_API_KEY) { console.log("notifyAgent: no SendGrid key"); return }

    // Find the agent contact on the deal
    const assoc = await hs(`/crm/v4/objects/deals/${dealId}/associations/contacts`)
    const contactId = assoc.body?.results?.[0]?.toObjectId
    if (!contactId) { console.log(`notifyAgent: no contact on deal ${dealId}`); return }

    const contactRes = await hs(`/crm/v3/objects/contacts/${contactId}?properties=email,firstname`)
    const agentEmail = contactRes.body?.properties?.email
    const agentName = contactRes.body?.properties?.firstname || "there"
    if (!agentEmail) { console.log(`notifyAgent: no email for contact ${contactId}`); return }

    const link = `${PORTAL_URL}/applications/${dealId}`
    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #333; max-width: 480px;">
        <p>Hi ${agentName},</p>
        <p>You have a new message from Holmes Admissions regarding one of your applications.</p>
        <p style="margin: 20px 0;">
          <a href="${link}" style="display: inline-block; padding: 10px 24px; background: #991b1b; color: #ffffff; font-weight: 700; text-decoration: none; border-radius: 4px;">View message in the portal →</a>
        </p>
        <p style="font-size: 12px; color: #888;">Please do not reply to this email. All correspondence must be made via the Admissions Portal.</p>
      </div>`

    const res = await sendgrid({
      personalizations: [{ to: [{ email: agentEmail }] }],
      from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
      reply_to: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
      subject: "You have a new message in the Holmes Admissions Portal",
      content: [{ type: "text/html", value: html }],
    })
    console.log(`notifyAgent: emailed ${agentEmail} for deal ${dealId}, status ${res.status}`)
  } catch (err) {
    console.error(`notifyAgent error for deal ${dealId}:`, err.message)
  }
}

exports.handler = async (event) => {
  try {
    const events = JSON.parse(event.body || "[]")
    console.log("email-webhook received:", JSON.stringify(events).substring(0, 400))

    // De-dupe deal IDs. For EMAIL_TO_DEAL association events, the deal is toObjectId.
    // Fall back to objectId for other event shapes.
    const dealIds = [...new Set(
      events
        .filter(e => !e.associationType || e.associationType === "EMAIL_TO_DEAL")
        .map(e => e.toObjectId || e.objectId)
        .filter(Boolean)
        .map(String)
    )]

    for (const dealId of dealIds) {
      // Confirm Australia pipeline
      const dealRes = await hs(`/crm/v3/objects/deals/${dealId}?properties=pipeline,response_status`)
      const pipeline = dealRes.body?.properties?.pipeline
      if (pipeline !== PIPELINE_ID) { console.log(`deal ${dealId}: pipeline=${pipeline}, skip`); continue }

      // Get latest EMAIL engagement on this deal (legacy engagements works for deal→emails)
      const engRes = await hs(`/engagements/v1/engagements/associated/deal/${dealId}/paged?limit=50`)
      const emails = (engRes.body.results || [])
        .filter(e => e.engagement?.type === "EMAIL")
        .sort((a, b) => (b.engagement.timestamp || 0) - (a.engagement.timestamp || 0))

      if (emails.length === 0) { console.log(`deal ${dealId}: no emails`); continue }

      const latest = emails[0]
      const bodyText = (latest.engagement?.bodyPreview || "") +
                       (latest.engagement?.bodyPreviewHtml || "") +
                       (latest.metadata?.html || "") +
                       (latest.metadata?.body || "")
      const isPortal = bodyText.includes("Comment by Agent")
      const newStatus = isPortal ? "Holmes_Received" : "Waiting_on_Agent"

      if (dealRes.body.properties.response_status !== newStatus) {
        await hs(`/crm/v3/objects/deals/${dealId}`, "PATCH", {
          properties: { response_status: newStatus },
        })
        console.log(`deal ${dealId} → ${newStatus} (isPortal=${isPortal})`)
      } else {
        console.log(`deal ${dealId}: already ${newStatus}`)
      }

      // Notify the agent on every Holmes staff reply (email without the portal marker)
      if (!isPortal) {
        await notifyAgent(dealId)
      }
    }

    return { statusCode: 200, body: "ok" }
  } catch (err) {
    console.error("email-webhook error:", err.message)
    return { statusCode: 200, body: "ok" }
  }
}
