// discover-cloudfiles-deals.js
//
// READ-ONLY discovery tool. Given a batch of deal IDs, checks each one against
// CloudFiles' API to see if it has any files attached, and returns just the
// list of deals that do (with file counts). Never touches CloudFiles or
// SharePoint — purely for building a worklist to feed into
// migrate-cloudfiles-to-sharepoint.js afterward.
//
// USAGE (POST body, JSON):
//   { "dealIds": ["123", "456", ...] }   // up to 50 per call
//
// Typical flow:
//   1. Pull a page of deal IDs from HubSpot (e.g. 50 at a time)
//   2. POST them here to find out which ones actually have CloudFiles files
//   3. Feed just those deal IDs into migrate-cloudfiles-to-sharepoint.js,
//      in batches of up to 10

const https = require("https")

const CLOUDFILES_API_KEY = process.env.CLOUDFILES_API_KEY

function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
      res.on("end", () => {
        const raw = Buffer.concat(chunks)
        try { resolve({ status: res.statusCode, body: JSON.parse(raw.toString() || "[]") }) }
        catch { resolve({ status: res.statusCode, body: [] }) }
      })
    })
    req.on("error", reject)
    req.end()
  })
}

async function checkDeal(dealId) {
  try {
    const result = await makeRequest({
      hostname: "api.cloudfiles.io",
      path: `/v1/attachments?objectId=${encodeURIComponent(dealId)}&objectType=DEAL`,
      method: "GET",
      headers: { "authorization": `Bearer ${CLOUDFILES_API_KEY}` },
    })
    if (result.status < 200 || result.status >= 300) {
      return { dealId, error: `CloudFiles returned ${result.status}`, fileCount: 0 }
    }
    const attachments = Array.isArray(result.body) ? result.body : []
    const fileCount = attachments.filter(a => a.resourceType === "file").length
    return { dealId, fileCount }
  } catch (err) {
    return { dealId, error: err.message, fileCount: 0 }
  }
}

exports.handler = async (event) => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" }
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }

  if (!CLOUDFILES_API_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "CLOUDFILES_API_KEY not configured" }) }
  }

  let payload
  try {
    payload = JSON.parse(event.body || "{}")
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid JSON body" }) }
  }

  const dealIds = Array.isArray(payload.dealIds) ? payload.dealIds.map(String) : []
  if (dealIds.length === 0) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "dealIds must be a non-empty array" }) }
  }
  if (dealIds.length > 50) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Max 50 deal IDs per call" }) }
  }

  try {
    // Check all deals in parallel — read-only, safe to do concurrently
    const allResults = await Promise.all(dealIds.map(checkDeal))

    const dealsWithFiles = allResults.filter(r => r.fileCount > 0)
    const errors = allResults.filter(r => r.error)

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        checked: dealIds.length,
        dealsWithFiles: dealsWithFiles.map(d => ({ dealId: d.dealId, fileCount: d.fileCount })),
        totalFilesFound: dealsWithFiles.reduce((sum, d) => sum + d.fileCount, 0),
        errors: errors.length > 0 ? errors : undefined,
      }, null, 2),
    }
  } catch (err) {
    console.error("discover-cloudfiles-deals error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server error", detail: err.message }) }
  }
}
