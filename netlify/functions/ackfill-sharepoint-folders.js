// backfill-sharepoint-folders.js
//
// ONE-TIME BACKFILL TOOL. Creates the actual Holmes-Deals/{ApplicationReference}/
// folder in SharePoint for deals that already have sharepoint_folder_url set
// (via backfill-sharepoint-links.js or submit-application.js) but whose folder
// doesn't exist yet — e.g. deals created before the proactive-folder-creation
// fix, where clicking the link hits "This item isn't available."
//
// SAFETY DESIGN:
//   - Only CREATES folders — never uploads, modifies, or deletes any file
//   - Uses conflictBehavior: "replace" is NOT used here on purpose — if a
//     folder already exists, Graph API's default behavior for this call is
//     safe (won't destroy existing contents); we treat "already exists" as
//     success, not an error
//   - Skips deals with no portal_application_reference (nothing to create)
//   - Processes a small, explicit batch of deal IDs per call — max 25
//   - Returns a detailed per-deal result list
//
// USAGE (POST body, JSON):
//   {
//     "dealIds": ["63880816407", "63434042189"],   // explicit list, required, max 25
//     "dryRun": true                                 // default true if omitted
//   }

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

async function folderExists(accessToken, applicationReference) {
  const safeRef = String(applicationReference).replace(/[^a-zA-Z0-9_-]/g, "")
  const result = await hsGraph(
    accessToken, "GET",
    `/v1.0/sites/${SHAREPOINT_SITE_ID}/drive/root:/Holmes-Deals/${safeRef}`
  )
  return result.status === 200
}

async function createFolder(accessToken, applicationReference) {
  const safeRef = String(applicationReference).replace(/[^a-zA-Z0-9_-]/g, "")
  // "fail" conflictBehavior: if it already exists, Graph returns a 409 rather
  // than touching/replacing anything — safest option for a folder that might
  // already have real files in it.
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
    const spToken = await getSharePointToken()

    for (const dealId of dealIds) {
      const dealRes = await hs(`/crm/v3/objects/deals/${dealId}?properties=portal_application_reference`, "GET")

      if (dealRes.status !== 200) {
        results.push({ dealId, status: "failed", reason: `Could not fetch deal (status ${dealRes.status})` })
        continue
      }

      const ref = dealRes.body?.properties?.portal_application_reference
      if (!ref) {
        results.push({ dealId, status: "skipped", reason: "No Application Reference on this deal" })
        continue
      }

      const alreadyExists = await folderExists(spToken, ref)
      if (alreadyExists) {
        results.push({ dealId, applicationReference: ref, status: "skipped", reason: "Folder already exists" })
        continue
      }

      if (dryRun) {
        results.push({ dealId, applicationReference: ref, status: "would-create" })
        continue
      }

      const createResult = await createFolder(spToken, ref)
      if (createResult.status !== 201 && createResult.status !== 409) {
        results.push({ dealId, applicationReference: ref, status: "failed", reason: `Folder creation failed (status ${createResult.status})`, detail: createResult.body })
        continue
      }

      results.push({ dealId, applicationReference: ref, status: "created" })
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ dryRun, dealsProcessed: dealIds.length, results }, null, 2),
    }
  } catch (err) {
    console.error("backfill-sharepoint-folders error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server error", detail: err.message }) }
  }
}
