// Called by HubSpot Workflow (0CodeTools API Webhook Connector).
// Payload: { "objectId": "<dealId>" }
//
// Checks if this deal's passport number matches any OTHER deal (across all agencies).
// If duplicates found → sets is_duplicate = true on ALL deals sharing that passport.
// If none → sets is_duplicate = false on this deal.

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
    const payload = JSON.parse(event.body || "{}")
    const dealId = payload.objectId || payload.dealId
    if (!dealId) return { statusCode: 200, body: "no deal id" }

    // 1. Get this deal's passport number
    const dealRes = await hs(`/crm/v3/objects/deals/${dealId}?properties=passport_number`)
    const passport = (dealRes.body?.properties?.passport_number || "").trim()
    if (!passport) return { statusCode: 200, body: "no passport" }

    // 2. Find all deals with the same passport number
    const search = await hs("/crm/v3/objects/deals/search", "POST", {
      filterGroups: [{ filters: [{ propertyName: "passport_number", operator: "EQ", value: passport }] }],
      properties: ["passport_number", "is_duplicate"],
      limit: 100,
    })

    const matches = search.body?.results || []

    // 3. If more than one deal shares this passport → all are duplicates
    if (matches.length > 1) {
      for (const d of matches) {
        if (d.properties?.is_duplicate !== "true") {
          await hs(`/crm/v3/objects/deals/${d.id}`, "PATCH", {
            properties: { is_duplicate: "true" },
          })
        }
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true, passport, duplicates: matches.length }) }
    }

    // 4. Only this deal → not a duplicate
    await hs(`/crm/v3/objects/deals/${dealId}`, "PATCH", {
      properties: { is_duplicate: "false" },
    })
    return { statusCode: 200, body: JSON.stringify({ ok: true, passport, duplicates: 1 }) }
  } catch (err) {
    return { statusCode: 200, body: "ok" }
  }
}
