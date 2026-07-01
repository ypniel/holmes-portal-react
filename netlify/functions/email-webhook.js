// HubSpot native webhook — subscribed to Email "created" events.
// HubSpot POSTs an array: [{ objectId, subscriptionType, ... }, ...]
// objectId = the email engagement ID.
//
// For each new email:
//   - Find its associated deal
//   - If body has "Comment by Agent" marker → portal/agent → Holmes_Received
//   - Otherwise → Holmes staff reply → Waiting_on_Agent

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

    for (const evt of events) {
      // Only handle email creation events
      if (evt.subscriptionType && !evt.subscriptionType.toLowerCase().includes("email")) continue

      const emailId = evt.objectId
      if (!emailId) continue

      // Fetch the email engagement (legacy engagements API gives associations + body)
      const eng = await hs(`/engagements/v1/engagements/${emailId}`)
      if (eng?.engagement?.type !== "EMAIL") continue

      // Find associated deal
      const dealId = eng.associations?.dealIds?.[0]
      if (!dealId) continue

      // Confirm it's an Australia pipeline deal
      const dealRes = await hs(`/crm/v3/objects/deals/${dealId}?properties=pipeline`)
      if (dealRes.body?.properties?.pipeline !== PIPELINE_ID) continue

      // Detect portal message via the "Comment by Agent" marker in the body
      const bodyText = (eng.engagement?.bodyPreview || "") +
                       (eng.metadata?.html || "") +
                       (eng.metadata?.body || "")
      const isPortal = bodyText.includes("Comment by Agent")
      const newStatus = isPortal ? "Holmes_Received" : "Waiting_on_Agent"

      await hs(`/crm/v3/objects/deals/${dealId}`, "PATCH", {
        properties: { response_status: newStatus },
      })
    }

    return { statusCode: 200, body: "ok" }
  } catch (err) {
    return { statusCode: 200, body: "ok" }  // 200 so HubSpot doesn't retry-storm
  }
}
