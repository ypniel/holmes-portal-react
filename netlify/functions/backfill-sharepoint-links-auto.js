// backfill-sharepoint-links-auto.js
//
// Self-driving version of backfill-sharepoint-links.js. Instead of requiring
// a manually-supplied list of deal IDs, this queries HubSpot directly for
// deals that have portal_application_reference set but sharepoint_folder_url
// EMPTY, and backfills them — up to a batch size per call, using an offset
// to page through the whole pipeline across multiple calls.
//
// SAFETY: identical guarantees to backfill-sharepoint-links.js — only ever
// sets sharepoint_folder_url, dry-run by default, never overwrites an
// existing value.
//
// USAGE (POST body, JSON):
//   {
//     "after": null,        // HubSpot search "after" cursor for pagination; omit/null for first page
//     "limit": 25,          // how many deals to process this call (max 100)
//     "dryRun": true        // default true
//   }
//
// Returns a "nextAfter" cursor when there are more pages — pass that back
// in as "after" on the next call to continue where you left off.

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

  const after = payload.after || undefined
  const limit = Math.min(Number.isFinite(payload.limit) ? payload.limit : 25, 100)
  const dryRun = payload.dryRun !== false

  try {
    // Search for ANY deal missing the URL — regardless of whether it has a
    // real Application Reference. Deals without one fall back to
    // DEAL-{dealId}, matching the same convention used by the migration
    // script and every other SharePoint tool in this project. Earlier
    // versions of this search required portal_application_reference to be
    // set, which silently skipped the majority of migrated deals (most of
    // which have no real reference) — this fixes that gap.
    const searchBody = {
      filterGroups: [{
        filters: [
          { propertyName: "sharepoint_folder_url", operator: "NOT_HAS_PROPERTY" },
        ],
      }],
      properties: ["portal_application_reference", "sharepoint_folder_url"],
      limit,
      ...(after ? { after } : {}),
    }

    const searchRes = await hs("/crm/v3/objects/deals/search", "POST", searchBody)
    if (searchRes.status !== 200) {
      return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: "HubSpot search failed", detail: searchRes.body }) }
    }

    const deals = searchRes.body.results || []
    const nextAfter = searchRes.body.paging?.next?.after || null
    const results = []

    for (const deal of deals) {
      const dealId = deal.id
      const rawRef = deal.properties?.portal_application_reference
      const ref = (rawRef && rawRef.trim()) ? rawRef.trim() : `DEAL-${dealId}`

      const newUrl = buildSharePointUrl(ref)

      if (dryRun) {
        results.push({ dealId, applicationReference: ref, status: "would-update", newUrl })
        continue
      }

      const updateRes = await hs(`/crm/v3/objects/deals/${dealId}`, "PATCH", {
        properties: { sharepoint_folder_url: newUrl },
      })

      if (updateRes.status !== 200) {
        results.push({ dealId, applicationReference: ref, status: "failed", reason: `Update failed (status ${updateRes.status})` })
        continue
      }

      results.push({ dealId, applicationReference: ref, status: "updated", newUrl })
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        dryRun,
        dealsFoundThisPage: deals.length,
        results,
        nextAfter,
        hasMore: !!nextAfter,
      }, null, 2),
    }
  } catch (err) {
    console.error("backfill-sharepoint-links-auto error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server error", detail: err.message }) }
  }
}
