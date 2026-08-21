// migrate-cloudfiles-to-sharepoint.js
//
// ONE-TIME MIGRATION TOOL. Never deletes anything from CloudFiles — this only
// READS from CloudFiles and WRITES (copies) into SharePoint. CloudFiles stays
// fully intact and usable throughout and after this runs.
//
// SAFETY DESIGN:
//   - Defaults to DRY RUN (dryRun=true) — lists what WOULD be migrated without
//     touching SharePoint at all. You must explicitly pass dryRun=false to
//     actually copy files.
//   - Processes a small, explicit batch of deal IDs per call — never "all
//     deals at once". You control exactly which deals run each time.
//   - Every file is verified by size after upload (source size === uploaded
//     size) before being counted as successfully migrated.
//   - Returns a detailed per-file result list — nothing is assumed to have
//     worked; you can see exactly what happened to every single file.
//
// USAGE (POST body, JSON):
//   {
//     "dealIds": ["63746524051", "61120234792"],   // explicit list, required
//     "dryRun": true                                 // default true if omitted
//   }
//
// RECOMMENDED FIRST RUN: dryRun=true with 2-3 real deal IDs, to see what it
// finds before copying anything for real.

const https = require("https")

const CLOUDFILES_API_KEY = process.env.CLOUDFILES_API_KEY
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN

const SHAREPOINT_TENANT_ID = process.env.SHAREPOINT_TENANT_ID
const SHAREPOINT_CLIENT_ID = process.env.SHAREPOINT_CLIENT_ID
const SHAREPOINT_CLIENT_SECRET = process.env.SHAREPOINT_CLIENT_SECRET
const SITE_ID = "holmesedug.sharepoint.com,461a99da-664c-41d3-b2cb-d83784fbbfb1,9c112f1c-e736-4ff3-a906-f78f7cb25873"
const ROOT_FOLDER = "Holmes-Deals"
const MAX_FILE_SIZE = 20 * 1024 * 1024

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
      // Follow one redirect if present (signed URLs sometimes redirect)
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

// Get the deal's Application Reference from HubSpot — files are filed under
// this in SharePoint (Holmes-Deals/{ApplicationReference}/), matching the
// convention used by sharepoint-upload.js.
async function getApplicationRef(dealId) {
  const result = await makeRequest({
    hostname: "api.hubapi.com",
    path: `/crm/v3/objects/deals/${dealId}?properties=portal_application_reference,dealname`,
    method: "GET",
    headers: { "Authorization": `Bearer ${HUBSPOT_TOKEN}` },
  })
  if (result.status !== 200) return null
  const ref = result.body?.properties?.portal_application_reference
  // Fall back to the raw dealId if no reference exists yet, so migration
  // doesn't just silently skip deals without one.
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
  const attachments = JSON.parse(Buffer.isBuffer(result.body) ? result.body.toString() : JSON.stringify(result.body))
  return (Array.isArray(attachments) ? attachments : []).filter(a => a.resourceType === "file")
}

async function getCloudFilesDownloadUrl(resourceId) {
  const result = await makeRequest({
    hostname: "api.cloudfiles.io",
    path: `/v1/files/${encodeURIComponent(resourceId)}/download`,
    method: "GET",
    headers: { "authorization": `Bearer ${CLOUDFILES_API_KEY}` },
  })
  if (result.status < 200 || result.status >= 300) return null
  const parsed = JSON.parse(Buffer.isBuffer(result.body) ? result.body.toString() : JSON.stringify(result.body))
  return parsed?.url || null
}

async function uploadToSharePoint(accessToken, applicationRef, fileName, fileBuffer) {
  const safeRef = applicationRef.replace(/[^a-zA-Z0-9_-]/g, "")
  const safeFileName = fileName.replace(/[\\/:*?"<>|]/g, "_")
  const uploadPath = `/v1.0/sites/${SITE_ID}/drive/root:/${ROOT_FOLDER}/${safeRef}/${encodeURIComponent(safeFileName)}:/content`

  const result = await makeRequest({
    hostname: "graph.microsoft.com",
    path: uploadPath,
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "Content-Length": fileBuffer.length,
    },
  }, fileBuffer)

  return result
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
  const dryRun = payload.dryRun !== false // defaults to true unless explicitly false

  if (dealIds.length === 0) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "dealIds must be a non-empty array" }) }
  }
  if (dealIds.length > 10) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Max 10 deal IDs per call — run in batches" }) }
  }

  const results = []

  try {
    const spToken = dryRun ? null : await getSharePointToken()

    for (const dealId of dealIds) {
      const applicationRef = await getApplicationRef(dealId)
      const attachments = await listCloudFilesAttachments(dealId)

      if (attachments.length === 0) {
        results.push({ dealId, applicationRef, files: [], note: "No CloudFiles attachments found for this deal" })
        continue
      }

      const fileResults = []
      for (const att of attachments) {
        const fileName = att.name || `file-${att.resourceId}`
        try {
          const downloadUrl = await getCloudFilesDownloadUrl(att.resourceId)
          if (!downloadUrl) {
            fileResults.push({ name: fileName, resourceId: att.resourceId, status: "failed", reason: "Could not get CloudFiles download URL" })
            continue
          }

          if (dryRun) {
            fileResults.push({ name: fileName, resourceId: att.resourceId, status: "would-migrate", reason: "Dry run — not copied" })
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
            fileResults.push({ name: fileName, resourceId: att.resourceId, status: "failed", reason: `SharePoint upload failed (status ${uploadResult.status})`, detail: uploadResult.body })
            continue
          }

          // Verify: uploaded size matches source size before calling it a success
          const uploadedSize = uploadResult.body?.size
          const sizesMatch = uploadedSize === fileFetch.body.length
          fileResults.push({
            name: fileName,
            resourceId: att.resourceId,
            status: sizesMatch ? "migrated" : "migrated-size-mismatch",
            sourceSize: fileFetch.body.length,
            uploadedSize,
            sharePointItemId: uploadResult.body?.id,
          })
        } catch (err) {
          fileResults.push({ name: fileName, resourceId: att.resourceId, status: "failed", reason: err.message })
        }
      }

      results.push({ dealId, applicationRef, files: fileResults })
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ dryRun, dealsProcessed: dealIds.length, results }, null, 2),
    }
  } catch (err) {
    console.error("migrate-cloudfiles-to-sharepoint error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server error", detail: err.message }) }
  }
}
