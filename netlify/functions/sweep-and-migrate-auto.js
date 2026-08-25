// sweep-and-migrate-auto.js
//
// Self-driving version of discover-and-migrate.js. Pages through ALL deals
// in the pipeline directly via HubSpot search (not a manually-compiled ID
// list), checking each for CloudFiles files and migrating any found into
// SharePoint. This exists specifically to catch anything missed by manual
// batch tracking during the original migration sweep.
//
// SAFETY: identical guarantees to discover-and-migrate.js — copy-only,
// never deletes from CloudFiles, size-verified, dry-run by default.
//
// USAGE (POST body, JSON):
//   {
//     "after": null,      // HubSpot search "after" cursor; omit/null for first page
//     "limit": 15,         // deals to check this call (kept modest to avoid timeouts)
//     "dryRun": true,
//     "pipelineId": "789344406"   // optional, defaults to the AU pipeline
//   }
//
// Returns "nextAfter" — MUST be passed forward each call (unlike the
// links-auto tool, this searches ALL deals regardless of migration status,
// since there's no HubSpot property indicating "has been checked").

const https = require("https")

const CLOUDFILES_API_KEY = process.env.CLOUDFILES_API_KEY
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN
const SHAREPOINT_TENANT_ID = process.env.SHAREPOINT_TENANT_ID
const SHAREPOINT_CLIENT_ID = process.env.SHAREPOINT_CLIENT_ID
const SHAREPOINT_CLIENT_SECRET = process.env.SHAREPOINT_CLIENT_SECRET
const SITE_ID = "holmesedug.sharepoint.com,461a99da-664c-41d3-b2cb-d83784fbbfb1,9c112f1c-e736-4ff3-a906-f78f7cb25873"
const ROOT_FOLDER = "Holmes-Deals"
const MAX_FILE_SIZE = 20 * 1024 * 1024
const DEFAULT_PIPELINE = "789344406"

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
      res.on("end", () => {
        const raw = Buffer.concat(chunks)
        try { resolve({ status: res.statusCode, body: JSON.parse(raw.toString() || "{}") }) }
        catch { resolve({ status: res.statusCode, body: raw }) }
      })
    })
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}

function fetchBytes(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    https.get(parsed, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchBytes(res.headers.location).then(resolve).catch(reject)
        return
      }
      const chunks = []
      res.on("data", (c) => chunks.push(c))
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }))
    }).on("error", reject)
  })
}

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

async function getSharePointToken() {
  const body =
    `client_id=${encodeURIComponent(SHAREPOINT_CLIENT_ID)}` +
    `&client_secret=${encodeURIComponent(SHAREPOINT_CLIENT_SECRET)}` +
    `&scope=${encodeURIComponent("https://graph.microsoft.com/.default")}` +
    `&grant_type=client_credentials`

  const result = await makeRequest({
    hostname: "login.microsoftonline.com",
    path: `/${SHAREPOINT_TENANT_ID}/oauth2/v2.0/token`,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
  }, body)

  if (result.status !== 200 || !result.body?.access_token) {
    throw new Error(`SharePoint auth failed: ${result.status}`)
  }
  return result.body.access_token
}

async function listCloudFilesAttachments(dealId) {
  const result = await makeRequest({
    hostname: "api.cloudfiles.io",
    path: `/v1/attachments?objectId=${encodeURIComponent(dealId)}&objectType=DEAL`,
    method: "GET",
    headers: { "authorization": `Bearer ${CLOUDFILES_API_KEY}` },
  })
  if (result.status < 200 || result.status >= 300) return []
  const attachments = Array.isArray(result.body) ? result.body : []
  return attachments.filter(a => a.resourceType === "file")
}

async function getCloudFilesDownloadUrl(resourceId) {
  const result = await makeRequest({
    hostname: "api.cloudfiles.io",
    path: `/v1/files/${encodeURIComponent(resourceId)}/download`,
    method: "GET",
    headers: { "authorization": `Bearer ${CLOUDFILES_API_KEY}` },
  })
  if (result.status < 200 || result.status >= 300) return null
  return result.body?.url || null
}

async function uploadToSharePoint(accessToken, applicationRef, fileName, fileBuffer) {
  const safeRef = applicationRef.replace(/[^a-zA-Z0-9_-]/g, "")
  const safeFileName = fileName.replace(/[\\/:*?"<>|]/g, "_")
  const uploadPath = `/v1.0/sites/${SITE_ID}/drive/root:/${ROOT_FOLDER}/${safeRef}/${encodeURIComponent(safeFileName)}:/content`
  return makeRequest({
    hostname: "graph.microsoft.com",
    path: uploadPath,
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "Content-Length": fileBuffer.length,
    },
  }, fileBuffer)
}

exports.handler = async (event) => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" }
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }

  if (!CLOUDFILES_API_KEY || !HUBSPOT_TOKEN || !SHAREPOINT_TENANT_ID || !SHAREPOINT_CLIENT_ID || !SHAREPOINT_CLIENT_SECRET) {
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
  const pipelineId = payload.pipelineId || DEFAULT_PIPELINE

  try {
    const searchBody = {
      filterGroups: [{
        filters: [{ propertyName: "pipeline", operator: "EQ", value: pipelineId }],
      }],
      sorts: [{ propertyName: "hs_object_id", direction: "ASCENDING" }],
      properties: ["portal_application_reference"],
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
    const spToken = dryRun ? null : await getSharePointToken()

    for (const deal of deals) {
      const dealId = deal.id
      const rawRef = deal.properties?.portal_application_reference
      const applicationRef = (rawRef && rawRef.trim()) ? rawRef.trim() : `DEAL-${dealId}`

      const attachments = await listCloudFilesAttachments(dealId)
      if (attachments.length === 0) continue // don't clutter results with empty deals

      const fileResults = []
      for (const att of attachments) {
        const fileName = att.name || `file-${att.resourceId}`
        try {
          const downloadUrl = await getCloudFilesDownloadUrl(att.resourceId)
          if (!downloadUrl) {
            fileResults.push({ name: fileName, status: "failed", reason: "Could not get CloudFiles download URL" })
            continue
          }
          if (dryRun) {
            fileResults.push({ name: fileName, status: "would-migrate" })
            continue
          }
          const fileFetch = await fetchBytes(downloadUrl)
          if (fileFetch.status !== 200) {
            fileResults.push({ name: fileName, status: "failed", reason: `Download failed (${fileFetch.status})` })
            continue
          }
          if (fileFetch.body.length > MAX_FILE_SIZE) {
            fileResults.push({ name: fileName, status: "failed", reason: "File too large" })
            continue
          }
          const uploadResult = await uploadToSharePoint(spToken, applicationRef, fileName, fileFetch.body)
          if (uploadResult.status !== 200 && uploadResult.status !== 201) {
            fileResults.push({ name: fileName, status: "failed", reason: `Upload failed (${uploadResult.status})` })
            continue
          }
          const sizesMatch = uploadResult.body?.size === fileFetch.body.length
          fileResults.push({
            name: fileName,
            status: sizesMatch ? "migrated" : "migrated-size-mismatch",
            sourceSize: fileFetch.body.length,
            uploadedSize: uploadResult.body?.size,
          })
        } catch (err) {
          fileResults.push({ name: fileName, status: "failed", reason: err.message })
        }
      }

      results.push({ dealId, applicationRef, fileCount: attachments.length, files: fileResults })
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        dryRun,
        dealsCheckedThisPage: deals.length,
        dealsWithFilesFound: results.length,
        results,
        nextAfter,
        hasMore: !!nextAfter,
      }, null, 2),
    }
  } catch (err) {
    console.error("sweep-and-migrate-auto error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server error", detail: err.message }) }
  }
}
