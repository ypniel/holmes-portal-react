// sync-deal-folder.js
// Backfill sweep — same copy logic as file-webhook.js, but pull-based instead
// of event-based. Point it at a deal and it copies every attached file into
// /portal-uploads as a clean PUBLIC_NOT_INDEXABLE duplicate.
//
// Use this for files that were attached BEFORE the webhook went live (the
// webhook only catches new attachments; this catches the backlog).
//
// Copy (not move): staff-side attachments are left untouched. Requires source
// files to be non-sensitive (readable). Idempotent: files already in
// /portal-uploads or already tagged as copies are skipped.
//
// Call:
//   GET /.netlify/functions/sync-deal-folder?dealId=123&sessionToken=...   (agent/staff session)
//   GET /.netlify/functions/sync-deal-folder?dealId=123&key=ADMIN_SECRET    (manual/admin)

const https = require("https")
const jwt = require("jsonwebtoken")

const TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN
const JWT_SECRET = process.env.JWT_SECRET
const ADMIN_SECRET = process.env.ADMIN_SECRET
const HOLMES_DOMAINS = ["holmes.edu.au", "holmeseducation.group"]
const TARGET_FOLDER = "/portal-uploads"
const COPY_TAG = "__pcopy"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
}

// JSON helper
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

function isHubSpotApiHost(hostname) {
  const h = String(hostname || "").toLowerCase()
  return h === "api.hubapi.com" || h.endsWith(".hubapi.com") || /^api(-[a-z0-9]+)?\.hubspot\.com$/.test(h)
}

// Raw byte fetch, follows redirects, auth only on HubSpot API hosts
function fetchBytes(options, followRedirects = true, depth = 0) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      if (followRedirects && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 5) {
        try {
          const u = new URL(res.headers.location, `https://${options.hostname}`)
          resolve(fetchBytes({
            hostname: u.hostname,
            path: `${u.pathname}${u.search}`,
            method: "GET",
            headers: isHubSpotApiHost(u.hostname) ? { "Authorization": `Bearer ${TOKEN}` } : {},
          }, true, depth + 1))
          return
        } catch (e) { /* fall through */ }
      }
      const chunks = []
      res.on("data", c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on("error", reject)
    req.end()
  })
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

function mimeFromExtension(ext) {
  ext = String(ext || "").toLowerCase()
  if (ext === "pdf") return "application/pdf"
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "png") return "image/png"
  if (ext === "gif") return "image/gif"
  if (ext === "webp") return "image/webp"
  return "application/octet-stream"
}

// Collect fileIds attached to a deal (mirrors download-file.js step 4)
async function collectFileIds(dealId) {
  const ids = new Set()
  const eng = await hs(`/engagements/v1/engagements/associated/deal/${dealId}/paged?limit=200`)
  for (const e of eng.body?.results || []) {
    for (const att of e.attachments || []) { if (att.id) ids.add(String(att.id)) }
    const body = e.engagement?.bodyPreview || ""
    for (const m of body.matchAll(/fileId=(\d+)/g)) ids.add(m[1])
    for (const m of e.metadata?.attachments || []) { if (m.id) ids.add(String(m.id)) }
  }
  return [...ids]
}

// Copy one file into /portal-uploads as PUBLIC_NOT_INDEXABLE
// Identical behaviour to file-webhook.js copyFileToPortalUploads().
async function copyFileToPortalUploads(fileId) {
  const meta = await hs(`/files/v3/files/${fileId}`)
  if (meta.status < 200 || meta.status >= 300) return "meta_fail"
  const m = meta.body || {}
  const name = m.name || "document"
  const ext = m.extension || ""

  if (String(m.path || "").startsWith(TARGET_FOLDER)) return "already_in_folder"
  if (name.includes(COPY_TAG)) return "already_copy"

  let downloadUrl = ""
  const signed = await hs(`/files/v3/files/${fileId}/signed-url`)
  if (signed.status >= 200 && signed.status < 300) {
    try { downloadUrl = (signed.body && signed.body.url) || "" } catch {}
  }
  if (signed.status === 403) return "sensitive"
  if (!downloadUrl) downloadUrl = m.url || m.defaultHostingUrl || m.default_hosting_url || ""
  if (!downloadUrl) return "no_url"

  const u = new URL(downloadUrl)
  const fileRes = await fetchBytes({
    hostname: u.hostname,
    path: `${u.pathname}${u.search}`,
    method: "GET",
    headers: isHubSpotApiHost(u.hostname) ? { "Authorization": `Bearer ${TOKEN}` } : {},
  })
  if (fileRes.status < 200 || fileRes.status >= 300) return "fetch_fail"
  const bytes = fileRes.body

  const dotExt = ext ? `.${ext}` : ""
  const baseName = name.toLowerCase().endsWith(dotExt.toLowerCase()) ? name.slice(0, name.length - dotExt.length) : name
  const copyName = `${baseName}${COPY_TAG}${dotExt}`
  const contentType = m.mimeType || mimeFromExtension(ext)

  const boundary = `----FormBoundary${Date.now()}`
  const CRLF = "\r\n"
  const preamble = Buffer.from(
    `--${boundary}${CRLF}Content-Disposition: form-data; name="folderPath"${CRLF}${CRLF}${TARGET_FOLDER}${CRLF}` +
    `--${boundary}${CRLF}Content-Disposition: form-data; name="options"${CRLF}Content-Type: application/json${CRLF}${CRLF}{"access":"PUBLIC_NOT_INDEXABLE","overwrite":false,"duplicateValidationStrategy":"NONE"}${CRLF}` +
    `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${copyName}"${CRLF}Content-Type: ${contentType}${CRLF}${CRLF}`
  )
  const epilogue = Buffer.from(`${CRLF}--${boundary}--${CRLF}`)
  const multipart = Buffer.concat([preamble, bytes, epilogue])

  const up = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.hubapi.com",
      path: "/filemanager/api/v3/files/upload",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": multipart.length,
      },
    }, (res) => {
      const chunks = []
      res.on("data", c => chunks.push(c))
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }))
    })
    req.on("error", reject)
    req.write(multipart)
    req.end()
  })

  if (up.status !== 200 && up.status !== 201) return "upload_fail"
  return "copied"
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }

  const dealId = event.queryStringParameters?.dealId
  if (!dealId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Missing dealId" }) }

  // Auth: valid session OR admin key
  const authHeader = event.headers?.authorization || event.headers?.Authorization || ""
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim()
  const sessionToken = event.queryStringParameters?.sessionToken || bearer
  const adminKey = event.queryStringParameters?.key

  let session = null
  if (sessionToken && JWT_SECRET) {
    try { session = jwt.verify(sessionToken, JWT_SECRET) } catch { session = null }
  }
  const adminOk = ADMIN_SECRET && adminKey === ADMIN_SECRET
  if (!session && !adminOk) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Unauthorised" }) }
  }

  // Ownership check for agents (staff/admin skip)
  const isStaff = session && HOLMES_DOMAINS.some(d => (session.email || "").toLowerCase().endsWith("@" + d))
  if (session && !isStaff && session.companyId) {
    const assoc = await hs(`/crm/v4/objects/deals/${dealId}/associations/companies`)
    const dealCompanyId = assoc.body?.results?.[0]?.toObjectId
    if (!dealCompanyId || String(dealCompanyId) !== String(session.companyId)) {
      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: "Access denied." }) }
    }
  }

  try {
    const fileIds = await collectFileIds(dealId)
    const result = { dealId, targetFolder: TARGET_FOLDER, found: fileIds.length, copied: 0, skipped: 0, sensitive: 0, errors: 0 }

    for (const fileId of fileIds) {
      const outcome = await copyFileToPortalUploads(fileId)
      if (outcome === "copied") result.copied++
      else if (outcome === "sensitive") { result.sensitive++; console.log(`sync-deal-folder ${dealId}: file ${fileId} SENSITIVE — cannot copy`) }
      else if (outcome === "already_in_folder" || outcome === "already_copy") result.skipped++
      else { result.errors++; console.log(`sync-deal-folder ${dealId}: file ${fileId} outcome=${outcome}`) }
      if ((result.copied + result.errors) % 8 === 0) await sleep(300)
    }

    console.log(`sync-deal-folder ${dealId} complete:`, JSON.stringify(result))
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, ...result }) }
  } catch (err) {
    console.error("sync-deal-folder error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}
