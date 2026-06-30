// Called by a HubSpot Workflow "Send a webhook" action.
// Workflow trigger: notes_last_contacted is known (re-enrollable), Australia pipeline.
// Payload from HubSpot workflow includes the deal's objectId.
//
// Logic: look at the latest email on the deal.
//   From portal     → Holmes_Received
//   From anyone else → Waiting_on_Agent

const https = require("https")

const TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN
const PORTAL_EMAIL = "portal@holmes.edu.au"

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

function extractDealId(payload) {
  // HubSpot workflow webhook sends different shapes; cover the common ones.
  return (
    payload?.objectId ||
    payload?.hs_object_id ||
    payload?.properties?.hs_object_id?.value ||
    payload?.dealId ||
    null
  )
}

exports.handler = async (event) => {
  try {
    const payload = JSON.parse(event.body || "{}")
    const dealId = extractDealId(payload)
    if (!dealId) return { statusCode: 200, body: "no deal id" }

    // Get latest EMAIL engagement on the deal
    const engRes = await hs(`/engagements/v1/engagements/associated/deal/${dealId}/paged?limit=50`)
    const emails = (engRes.results || [])
      .filter(e => e.engagement?.type === "EMAIL")
      .sort((a, b) => (b.engagement.timestamp || 0) - (a.engagement.timestamp || 0))

    if (emails.length === 0) return { statusCode: 200, body: "no email" }

    const from = (emails[0].metadata?.from?.email || "").toLowerCase()
    const newStatus = from === PORTAL_EMAIL ? "Holmes_Received" : "Waiting_on_Agent"

    await hs(`/crm/v3/objects/deals/${dealId}`, "PATCH", {
      properties: { response_status: newStatus },
    })

    return { statusCode: 200, body: JSON.stringify({ ok: true, dealId, newStatus }) }
  } catch (err) {
    return { statusCode: 200, body: "ok" }
  }
}
