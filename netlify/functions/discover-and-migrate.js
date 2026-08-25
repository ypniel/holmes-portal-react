// discover-and-migrate.js
//
// Combines discovery + migration into ONE call: checks a batch of deal IDs
// against CloudFiles, and for any that have files, migrates them into
// SharePoint immediately — no separate discovery/migration round trip.
//
// SAFETY: same guarantees as migrate-cloudfiles-to-sharepoint.js — only
// copies (never deletes from CloudFiles), verifies each file by size,
// defaults to dry run.
//
// SPEED: to avoid the Netlify function timeout that hit us on a 68-file
// deal, this caps how many FILES (not just deals) it will process per call.
// If the running file count would exceed the cap, it stops processing
// further deals in this batch and reports which ones were skipped for the
// next call — preventing a single big deal from timing out an entire batch.
//
// USAGE (POST body, JSON):
//   {
//     "dealIds": [...],       // up to 30 deal IDs
//     "dryRun": false,        // defaults to true
//     "maxFiles": 40          // optional, defaults to 40 files per call
//   }

const https = require("https")

const CLOUDFILES_API_KEY = process.env.CLOUDFILES_API_KEY
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN
const SHAREPOINT_TENANT_ID = process.env.SHAREPOINT_TENANT_ID
const SHAREPOINT_CLIENT_ID = process.env.SHAREPOINT_CLIENT_ID
const SHAREPOINT_CLIENT_SECRET = process.env.SHAREPOINT_CLIENT_SECRET
const SITE_ID = "holmesedug.sharepoint.com,461a99da-664c-41d3-b2cb-d83784fbbfb1,9c112f1c-e736-4ff3-a906-f78f7cb25873"
const ROOT_FOLDER = "Holmes-Deals"
const MAX_FILE_SIZE = 20 * 1024 * 1024
const DEFAULT_MAX_FILES = 40

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

async function getApplicationRef(dealId) {
  const result = await makeRequest({
    hostname: "api.hubapi.com",
    path: `/crm/v3/objects/deals/${dealId}?properties=portal_application_reference`,
    method: "GET",
    headers: { "Authorization": `Bearer ${HUBSPOT_TOKEN}` },
  })
  if (result.status !== 200) return null
  const ref = result.body?.properties?.portal_application_reference
  return (ref && ref.trim()) ? ref.trim() : `DEAL-${dealId}`
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

  const dealIds = Array.isArray(payload.dealIds) ? payload.dealIds.map(String) : []
  const dryRun = payload.dryRun !== false
  const maxFiles = Number.isFinite(payload.maxFiles) ? payload.maxFiles : DEFAULT_MAX_FILES

  if (dealIds.length === 0) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "dealIds must be a non-empty array" }) }
  }
  if (dealIds.length > 30) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Max 30 deal IDs per call" }) }
  }

  const results = []
  const skippedDueToCap = []
  let fileCountSoFar = 0

  try {
    const spToken = dryRun ? null : await getSharePointToken()

    for (const dealId of dealIds) {
      // Stop taking on new deals once we're at the file cap — report the
      // rest as skipped so the caller can re-run just those next.
      if (fileCountSoFar >= maxFiles) {
        skippedDueToCap.push(dealId)
        continue
      }

      const attachments = await listCloudFilesAttachments(dealId)
      if (attachments.length === 0) {
        results.push({ dealId, fileCount: 0, files: [] })
        continue
      }

      const applicationRef = await getApplicationRef(dealId)
      const fileResults = []

      for (const att of attachments) {
        if (fileCountSoFar >= maxFiles) {
          fileResults.push({ name: att.name || `file-${att.resourceId}`, status: "skipped", reason: "Batch file cap reached — re-run this deal in a later call" })
          continue
        }
        fileCountSoFar++

        const fileName = att.name || `file-${att.resourceId}`
        try {
          const downloadUrl = await getCloudFilesDownloadUrl(att.resourceId)
          if (!downloadUrl) {
            fileResults.push({ name: fileName, resourceId: att.resourceId, status: "failed", reason: "Could not get CloudFiles download URL" })
            continue
          }

          if (dryRun) {
            fileResults.push({ name: fileName, resourceId: att.resourceId, status: "would-migrate" })
            continue
          }

          const fileFetch = await fetchBytes(downloadUrl)
          if (fileFetch.status !== 200) {
            fileResults.push({ name: fileName, resourceId: att.resourceId, status: "failed", reason: `Could not download bytes (status ${fileFetch.status})` })
            continue
          }
          if (fileFetch.body.length > MAX_FILE_SIZE) {
            fileResults.push({ name: fileName, resourceId: att.resourceId, status: "failed", reason: `File too large (${fileFetch.body.length} bytes)` })
            continue
          }

          const uploadResult = await uploadToSharePoint(spToken, applicationRef, fileName, fileFetch.body)
          if (uploadResult.status !== 200 && uploadResult.status !== 201) {
            fileResults.push({ name: fileName, resourceId: att.resourceId, status: "failed", reason: `SharePoint upload failed (status ${uploadResult.status})` })
            continue
          }

          const uploadedSize = uploadResult.body?.size
          const sizesMatch = uploadedSize === fileFetch.body.length
          fileResults.push({
            name: fileName,
            resourceId: att.resourceId,
            status: sizesMatch ? "migrated" : "migrated-size-mismatch",
            sourceSize: fileFetch.body.length,
            uploadedSize,
          })
        } catch (err) {
          fileResults.push({ name: fileName, resourceId: att.resourceId, status: "failed", reason: err.message })
        }
      }

      results.push({ dealId, applicationRef, fileCount: attachments.length, files: fileResults })
    }

    const dealsWithFiles = results.filter(r => r.fileCount > 0)
    const totalMigrated = results.reduce((sum, r) => sum + (r.files || []).filter(f => f.status === "migrated").length, 0)

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        dryRun,
        dealsChecked: dealIds.length,
        dealsWithFiles: dealsWithFiles.length,
        totalMigrated,
        skippedDueToCap: skippedDueToCap.length > 0 ? skippedDueToCap : undefined,
        results: dealsWithFiles,
      }, null, 2),
    }
  } catch (err) {
    console.error("discover-and-migrate error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server error", detail: err.message }) }
  }
}
