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
    }

    return { statusCode: 200, body: "ok" }
  } catch (err) {
    console.error("email-webhook error:", err.message)
    return { statusCode: 200, body: "ok" }
  }
}
