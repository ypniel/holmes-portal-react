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
    console.log("email-webhook received:", JSON.stringify(events).substring(0, 500))

    for (const evt of events) {
      const emailId = evt.objectId
      if (!emailId) continue

      // Get email body properties
      const emailRes = await hs(`/crm/v3/objects/emails/${emailId}?properties=hs_email_text,hs_email_html,hs_email_subject`)
      const props = emailRes.body?.properties || {}

      // Get deal association via dedicated v4 endpoint
      let dealId = null
      const dealAssoc = await hs(`/crm/v4/objects/emails/${emailId}/associations/deals`)
      console.log(`email ${emailId} deal assoc:`, JSON.stringify(dealAssoc.body).substring(0, 300))
      dealId = dealAssoc.body?.results?.[0]?.toObjectId

      // Fallback: via associated contact
      if (!dealId) {
        const contactAssoc = await hs(`/crm/v4/objects/emails/${emailId}/associations/contacts`)
        console.log(`email ${emailId} contact assoc:`, JSON.stringify(contactAssoc.body).substring(0, 300))
        const contactId = contactAssoc.body?.results?.[0]?.toObjectId
        if (contactId) {
          const cAssoc = await hs(`/crm/v4/objects/contacts/${contactId}/associations/deals`)
          dealId = cAssoc.body?.results?.[0]?.toObjectId
          console.log(`email ${emailId}: dealId via contact=${dealId}`)
        }
      }
      if (!dealId) { console.log(`email ${emailId}: no associated deal`); continue }

      // Confirm it's an Australia pipeline deal
      const dealRes = await hs(`/crm/v3/objects/deals/${dealId}?properties=pipeline`)
      console.log(`deal ${dealId}: pipeline=${dealRes.body?.properties?.pipeline}`)
      if (dealRes.body?.properties?.pipeline !== PIPELINE_ID) continue

      // Detect portal message via the "Comment by Agent" marker in the body
      const bodyText = (props.hs_email_text || "") + (props.hs_email_html || "") + (props.hs_email_subject || "")
      const isPortal = bodyText.includes("Comment by Agent")
      const newStatus = isPortal ? "Holmes_Received" : "Waiting_on_Agent"

      await hs(`/crm/v3/objects/deals/${dealId}`, "PATCH", {
        properties: { response_status: newStatus },
      })
      console.log(`email-webhook: deal ${dealId} → ${newStatus} (isPortal=${isPortal})`)
    }

    return { statusCode: 200, body: "ok" }
  } catch (err) {
    return { statusCode: 200, body: "ok" }  // 200 so HubSpot doesn't retry-storm
  }
}
