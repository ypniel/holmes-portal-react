// backfill-sharepoint-folders-auto.js
//
// Self-driving version of backfill-sharepoint-folders.js. Queries HubSpot
// directly for deals that have sharepoint_folder_url set (so a link exists)
// and, for each one, checks whether the actual SharePoint folder exists —
// creating it if not. No manual deal ID lists needed.
//
// Unlike the links-auto tool, this can't filter "missing folder" via a
// HubSpot property search (folder existence lives in SharePoint, not
// HubSpot), so it pages through deals THAT HAVE THE LINK SET and checks
// each one's actual folder — skipping ones that already exist.
//
// SAFETY: only ever CREATES folders (never touches files), skips existing
// folders, dry-run by default.
//
// USAGE (POST body, JSON):
//   {
//     "after": null,     // HubSpot search "after" cursor; omit/null for first page
//     "limit": 15,        // deals to check this call (kept modest — each one is a SharePoint round trip)
//     "dryRun": true
//   }
//
// Returns "nextAfter" — pass back in as "after" to continue. Unlike the
// links-auto tool, deals here are NOT removed from the search results once
// fixed (the search matches on "has a link", not "has a folder"), so you
// MUST pass nextAfter forward each time rather than re-running the same
// call — otherwise you'll recheck the same first page forever.

const https = require("https")

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN
const SHAREPOINT_TENANT_ID = process.env.SHAREPOINT_TENANT_ID
const SHAREPOINT_CLIENT_ID = process.env.SHAREPOINT_CLIENT_ID
const SHAREPOINT_CLIENT_SECRET = process.env.SHAREPOINT_CLIENT_SECRET
const SHAREPOINT_SITE_ID = "holmesedug.sharepoint.com,461a99da-664c-41d3-b2cb-d83784fbbfb1,9c112f1c-e736-4ff3-a906-f78f7cb25873"

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

function getSharePointToken() {
  const body =
    `client_id=${encodeURIComponent(SHAREPOINT_CLIENT_ID)}` +
    `&client_secret=${encodeURIComponent(SHAREPOINT_CLIENT_SECRET)}` +
    `&scope=${encodeURIComponent("https://graph.microsoft.com/.default")}` +
    `&grant_type=client_credentials`

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "login.microsoftonline.com",
      path: `/${SHAREPOINT_TENANT_ID}/oauth2/v2.0/token`,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(c))
      res.on("end", () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString())
          if (res.statusCode === 200 && parsed.access_token) resolve(parsed.access_token)
          else reject(new Error(`SharePoint auth failed: ${res.statusCode}`))
        } catch (e) { reject(e) }
      })
    })
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

function hsGraph(accessToken, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : ""
    const req = https.request({
      hostname: "graph.microsoft.com", path, method,
      headers: {
        "Authorization": `Bearer ${accessToken}`,
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

async function folderExists(accessToken, ref) {
  const safeRef = String(ref).replace(/[^a-zA-Z0-9_-]/g, "")
  const result = await hsGraph(accessToken, "GET", `/v1.0/sites/${SHAREPOINT_SITE_ID}/drive/root:/Holmes-Deals/${safeRef}`)
  return result.status === 200
}

async function createFolder(accessToken, ref) {
  const safeRef = String(ref).replace(/[^a-zA-Z0-9_-]/g, "")
  return hsGraph(
    accessToken, "POST",
    `/v1.0/sites/${SHAREPOINT_SITE_ID}/drive/root:/Holmes-Deals:/children`,
    { name: safeRef, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }
  )
}

exports.handler = async (event) => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" }
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }

  if (!HUBSPOT_TOKEN || !SHAREPOINT_TENANT_ID || !SHAREPOINT_CLIENT_ID || !SHAREPOINT_CLIENT_SECRET) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Missing required environment variables" }) }
  }

  let payload
  try {
    payload = JSON.parse(event.body || "{}")
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid JSON body" }) }
  }

  const after = payload.after || undefined
  const limit = Math.min(Number.isFinite(payload.limit) ? payload.limit : 15, 25)
  const dryRun = payload.dryRun !== false

  try {
    const searchBody = {
      filterGroups: [{
        filters: [
          { propertyName: "sharepoint_folder_url", operator: "HAS_PROPERTY" },
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
    const spToken = await getSharePointToken()

    for (const deal of deals) {
      const dealId = deal.id
      const rawRef = deal.properties?.portal_application_reference
      const ref = (rawRef && rawRef.trim()) ? rawRef.trim() : `DEAL-${dealId}`

      const exists = await folderExists(spToken, ref)
      if (exists) {
        results.push({ dealId, applicationReference: ref, status: "skipped", reason: "Folder already exists" })
        continue
      }

      if (dryRun) {
        results.push({ dealId, applicationReference: ref, status: "would-create" })
        continue
      }

      const createResult = await createFolder(spToken, ref)
      if (createResult.status !== 201 && createResult.status !== 409) {
        results.push({ dealId, applicationReference: ref, status: "failed", reason: `Folder creation failed (status ${createResult.status})` })
        continue
      }

      results.push({ dealId, applicationReference: ref, status: "created" })
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        dryRun,
        dealsCheckedThisPage: deals.length,
        results,
        nextAfter,
        hasMore: !!nextAfter,
      }, null, 2),
    }
  } catch (err) {
    console.error("backfill-sharepoint-folders-auto error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server error", detail: err.message }) }
  }
}
