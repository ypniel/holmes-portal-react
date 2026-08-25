// backfill-sharepoint-links.js
//
// ONE-TIME BACKFILL TOOL. Adds sharepoint_folder_url to existing deals that
// already have an Application Reference but don't have the link yet (deals
// created before this feature existed).
//
// SAFETY DESIGN:
//   - Only ever SETS sharepoint_folder_url — never touches any other property
//   - Skips deals that already have sharepoint_folder_url set (won't overwrite)
//   - Skips deals with no portal_application_reference (nothing to link to)
//   - Processes a small, explicit batch of deal IDs per call — you control
//     exactly which deals run each time, same pattern as the CloudFiles
//     migration tool
//   - Returns a detailed per-deal result list
//
// USAGE (POST body, JSON):
//   {
//     "dealIds": ["63746524051", "61120234792"],   // explicit list, required, max 25
//     "dryRun": true                                 // default true if omitted
//   }

const https = require("https")

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN

function hs(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : ""
    const req = https.request({
      hostname: "api.hubapi.com", path, method,
      headers: {
        "Authorization": `Bearer ${HUBSPOT_TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    }, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(c))
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

function buildSharePointUrl(applicationReference) {
  const safeRef = String(applicationReference).replace(/[^a-zA-Z0-9_-]/g, "")
  return (
    `https://holmesedug.sharepoint.com/sites/AgentPortal/Shared%20Documents/Forms/AllItems.aspx` +
    `?id=%2Fsites%2FAgentPortal%2FShared%20Documents%2FHolmes%2DDeals%2F${encodeURIComponent(safeRef)}`
  )
}

exports.handler = async (event) => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" }
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }

  if (!HUBSPOT_TOKEN) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "HubSpot token not configured" }) }
  }

  let payload
  try {
    payload = JSON.parse(event.body || "{}")
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid JSON body" }) }
  }

  const dealIds = Array.isArray(payload.dealIds) ? payload.dealIds.map(String) : []
  const dryRun = payload.dryRun !== false

  if (dealIds.length === 0) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "dealIds must be a non-empty array" }) }
  }
  if (dealIds.length > 25) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Max 25 deal IDs per call — run in batches" }) }
  }

  const results = []

  try {
    for (const dealId of dealIds) {
      // Fetch current state of both relevant properties
      const dealRes = await hs(
        `/crm/v3/objects/deals/${dealId}?properties=portal_application_reference,sharepoint_folder_url`,
        "GET"
      )

      if (dealRes.status !== 200) {
        results.push({ dealId, status: "failed", reason: `Could not fetch deal (status ${dealRes.status})` })
        continue
      }

      const ref = dealRes.body?.properties?.portal_application_reference
      const existingUrl = dealRes.body?.properties?.sharepoint_folder_url

      if (!ref) {
        results.push({ dealId, status: "skipped", reason: "No Application Reference on this deal" })
        continue
      }
      if (existingUrl) {
        results.push({ dealId, status: "skipped", reason: "sharepoint_folder_url already set", existingUrl })
        continue
      }

      const newUrl = buildSharePointUrl(ref)

      if (dryRun) {
        results.push({ dealId, applicationReference: ref, status: "would-update", newUrl })
        continue
      }

      const updateRes = await hs(`/crm/v3/objects/deals/${dealId}`, "PATCH", {
        properties: { sharepoint_folder_url: newUrl },
      })

      if (updateRes.status !== 200) {
        results.push({ dealId, applicationReference: ref, status: "failed", reason: `Update failed (status ${updateRes.status})`, detail: updateRes.body })
        continue
      }

      results.push({ dealId, applicationReference: ref, status: "updated", newUrl })
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ dryRun, dealsProcessed: dealIds.length, results }, null, 2),
    }
  } catch (err) {
    console.error("backfill-sharepoint-links error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server error", detail: err.message }) }
  }
}
