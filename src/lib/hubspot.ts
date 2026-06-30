// Called by HubSpot Workflow (0CodeTools API Webhook Connector).
// Payload: { "objectId": "<dealId>" }
//
// Looks at the latest email on the deal:
//   Contains [PORTAL_MSG] marker → portal/agent message → Holmes_Received
//   No marker                    → Holmes staff reply    → Waiting_on_Agent

const https = require("https")

const TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN

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
        try { resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}")) }
        catch { resolve({}) }
      })
    })
    req.on("error", reject)
    if (data) req.write(data)
    req.end()
  })
}

exports.handler = async (event) => {
  try {
    const payload = JSON.parse(event.body || "{}")
    const dealId = payload.objectId || payload.dealId
    if (!dealId) return { statusCode: 200, body: "no deal id" }

    // Latest EMAIL engagement on the deal
    const engRes = await hs(`/engagements/v1/engagements/associated/deal/${dealId}/paged?limit=50`)
    const emails = (engRes.results || [])
      .filter(e => e.engagement?.type === "EMAIL")
      .sort((a, b) => (b.engagement.timestamp || 0) - (a.engagement.timestamp || 0))

    if (emails.length === 0) return { statusCode: 200, body: "no email" }

    const latest = emails[0]
    const bodyText = (latest.engagement?.bodyPreview || "") +
                     (latest.engagement?.bodyPreviewHtml || "") +
                     (latest.metadata?.html || "") +
                     (latest.metadata?.body || "")

    const isPortal = bodyText.includes("PORTAL_MSG")
    const newStatus = isPortal ? "Holmes_Received" : "Waiting_on_Agent"

    await hs(`/crm/v3/objects/deals/${dealId}`, "PATCH", {
      properties: { response_status: newStatus },
    })

    return { statusCode: 200, body: JSON.stringify({ ok: true, dealId, newStatus }) }
  } catch (err) {
    return { statusCode: 200, body: "ok" }
  }
}
