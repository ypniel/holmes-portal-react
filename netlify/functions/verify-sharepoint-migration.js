// verify-sharepoint-migration.js
//
// READ-ONLY verification tool. Given a batch of deal IDs, checks whether
// each one already has a SharePoint folder (Holmes-Deals/{ref}/ or
// Holmes-Deals/DEAL-{dealId}/) — giving an exact, ground-truth answer to
// "has this deal's CloudFiles content already been migrated?" rather than
// relying on manually tracked batch history.
//
// Does NOT check whether the folder's contents are complete/correct, only
// whether it exists at all — a reasonable proxy for "has been migrated"
// given the migration script always creates the folder as part of copying
// files into it.
//
// USAGE (POST body, JSON):
//   { "dealIds": [...] }   // up to 50 per call

const https = require("https")

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN
const SHAREPOINT_TENANT_ID = process.env.SHAREPOINT_TENANT_ID
const SHAREPOINT_CLIENT_ID = process.env.SHAREPOINT_CLIENT_ID
const SHAREPOINT_CLIENT_SECRET = process.env.SHAREPOINT_CLIENT_SECRET
const SITE_ID = "holmesedug.sharepoint.com,461a99da-664c-41d3-b2cb-d83784fbbfb1,9c112f1c-e736-4ff3-a906-f78f7cb25873"

function hs(path, method) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.hubapi.com", path, method,
      headers: { "Authorization": `Bearer ${HUBSPOT_TOKEN}` },
    }, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(c))
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString() || "{}") }) }
        catch { resolve({ status: res.statusCode, body: {} }) }
      })
    })
    req.on("error", reject)
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

function graphGet(accessToken, path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "graph.microsoft.com", path, method: "GET",
      headers: { "Authorization": `Bearer ${accessToken}` },
    }, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(c))
      res.on("end", () => resolve({ status: res.statusCode }))
    })
    req.on("error", reject)
    req.end()
  })
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

  const dealIds = Array.isArray(payload.dealIds) ? payload.dealIds.map(String) : []
  if (dealIds.length === 0) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "dealIds must be a non-empty array" }) }
  }
  if (dealIds.length > 50) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Max 50 deal IDs per call" }) }
  }

  const migrated = []
  const notMigrated = []

  try {
    const spToken = await getSharePointToken()

    for (const dealId of dealIds) {
      const dealRes = await hs(`/crm/v3/objects/deals/${dealId}?properties=portal_application_reference`, "GET")
      const rawRef = dealRes.status === 200 ? dealRes.body?.properties?.portal_application_reference : null
      const ref = (rawRef && rawRef.trim()) ? rawRef.trim() : `DEAL-${dealId}`
      const safeRef = ref.replace(/[^a-zA-Z0-9_-]/g, "")

      const folderCheck = await graphGet(spToken, `/v1.0/sites/${SITE_ID}/drive/root:/Holmes-Deals/${safeRef}`)

      if (folderCheck.status === 200) {
        migrated.push(dealId)
      } else {
        notMigrated.push(dealId)
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        checked: dealIds.length,
        migratedCount: migrated.length,
        notMigratedCount: notMigrated.length,
        notMigrated,
      }, null, 2),
    }
  } catch (err) {
    console.error("verify-sharepoint-migration error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server error", detail: err.message }) }
  }
}
