const https = require("https")
const jwt = require("jsonwebtoken")

const FILE_TOKEN = process.env.HUBSPOT_TOKEN
const SENSITIVE_TOKEN = process.env.HUBSPOT_TOKEN_WRITE || FILE_TOKEN
const JWT_SECRET = process.env.JWT_SECRET
const CLOUDFILES_API_KEY = process.env.CLOUDFILES_API_KEY
const HOLMES_DOMAINS = ["holmes.edu.au", "holmeseducation.group"]

// ── HTTP helper ───────────────────────────────────────────────────────────────
function makeRequest(options, followRedirects = false, depth = 0) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      // Follow redirects server-side (for file CDN URLs)
      if (followRedirects && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 5) {
        try {
          const redirectUrl = new URL(res.headers.location, `https://${options.hostname}`)
          console.error("DEBUG redirect hop:", options.hostname, "->", redirectUrl.hostname, redirectUrl.pathname)
          resolve(makeRequest({
            hostname: redirectUrl.hostname,
            path: `${redirectUrl.pathname}${redirectUrl.search}`,
            method: "GET",
            headers: {},
          }, true, depth + 1))
          return
        } catch (e) { /* fall through */ }
      }
      const chunks = []
      res.on("data", (chunk) => { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)) })
      res.on("end", () => { resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }) })
    })
    req.on("error", reject)
    req.end()
  })
}

function getContentType(meta, fileResult) {
  const ext = String(meta.extension || "").toLowerCase()
  if (ext === "pdf")  return "application/pdf"
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "png")  return "image/png"
  if (ext === "gif")  return "image/gif"
  if (ext === "webp") return "image/webp"
  if (ext === "svg")  return "image/svg+xml"
  return meta.mimeType || fileResult.headers["content-type"] || "application/octet-stream"
}

// ── CloudFiles helpers ──────────────────────────────────────────────────────
// CloudFiles-native files (library !== "hubspot") live in externally connected
// cloud storage (OneDrive, etc.) and never touch HubSpot's Files API at all —
// so none of HubSpot's sensitive-data restrictions apply to them. Files that
// come back with library === "hubspot" are just CloudFiles indexing an
// old-style native HubSpot attachment; those still need the legacy HubSpot
// fetch path further down.
async function findCloudFilesAttachment(dealId, fileId) {
  if (!CLOUDFILES_API_KEY) return null
  try {
    const result = await makeRequest({
      hostname: "api.cloudfiles.io",
      path: `/v1/attachments?objectId=${encodeURIComponent(dealId)}&objectType=DEAL`,
      method: "GET",
      headers: { "authorization": `Bearer ${CLOUDFILES_API_KEY}` },
    })
    if (result.status < 200 || result.status >= 300) {
      console.error("DEBUG CloudFiles attachments lookup failed:", result.status, result.body.toString().slice(0, 300))
      return null
    }
    const attachments = JSON.parse(result.body.toString() || "[]")
    return attachments.find(a => String(a.resourceId) === String(fileId)) || null
  } catch (err) {
    console.error("DEBUG CloudFiles attachments lookup error:", err.message)
    return null
  }
}

async function downloadFromCloudFiles(resourceId) {
  const downloadMetaResult = await makeRequest({
    hostname: "api.cloudfiles.io",
    path: `/v1/files/${encodeURIComponent(resourceId)}/download`,
    method: "GET",
    headers: { "authorization": `Bearer ${CLOUDFILES_API_KEY}` },
  })

  if (downloadMetaResult.status < 200 || downloadMetaResult.status >= 300) {
    console.error("DEBUG CloudFiles /download failed:", downloadMetaResult.status, downloadMetaResult.body.toString().slice(0, 300))
    return null
  }

  let signedUrl = "", fileName = ""
  try {
    const parsed = JSON.parse(downloadMetaResult.body.toString())
    signedUrl = parsed.url || ""
    fileName = parsed.name || ""
  } catch {}
  if (!signedUrl) return null

  // Signed URL is on a separate host (streamapi.cloudfiles.io) and needs no
  // Authorization header — the "code" query param on it is the auth.
  const parsedUrl = new URL(signedUrl)
  const fileResult = await makeRequest({
    hostname: parsedUrl.hostname,
    path: `${parsedUrl.pathname}${parsedUrl.search}`,
    method: "GET",
    headers: {},
  }, true)

  if (fileResult.status < 200 || fileResult.status >= 300) {
    console.error("DEBUG CloudFiles signed URL fetch failed:", fileResult.status)
    return null
  }

  return { fileResult, fileName }
}

exports.handler = async (event) => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*" }

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }

  // ── 1. Verify session token from Authorization header ─────────────────────
  const authHeader = event.headers?.authorization || event.headers?.Authorization || ""
  const token = authHeader.replace("Bearer ", "").trim()

  if (!token) {
    return { statusCode: 401, headers: corsHeaders, body: "Unauthorised" }
  }

  let session
  try {
    session = jwt.verify(token, JWT_SECRET)
  } catch {
    return { statusCode: 401, headers: corsHeaders, body: "Invalid session" }
  }

  // ── 2. Require dealId ─────────────────────────────────────────────────────
  const fileId = event.queryStringParameters?.fileId
  const dealId = event.queryStringParameters?.dealId

  if (!fileId) return { statusCode: 400, headers: corsHeaders, body: "Missing fileId" }
  if (!dealId) return { statusCode: 400, headers: corsHeaders, body: "Missing dealId" }

  // ── 3. Check deal ownership (skip for Holmes staff) ───────────────────────
  const isStaff = HOLMES_DOMAINS.some(d => (session.email || "").toLowerCase().endsWith("@" + d))
  const isStudent = session.type === "student_otp" || session.companyName === "Direct Student"

  if (!isStaff && session.companyId) {
    const assocResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/crm/v4/objects/deals/${dealId}/associations/companies`,
      method: "GET",
      headers: { "Authorization": `Bearer ${SENSITIVE_TOKEN}` },
    })

    let dealCompanyId = null
    try {
      const assocBody = JSON.parse(assocResult.body.toString() || "{}")
      dealCompanyId = assocBody.results?.[0]?.toObjectId
    } catch {}

    if (!dealCompanyId || String(dealCompanyId) !== String(session.companyId)) {
      return { statusCode: 403, headers: corsHeaders, body: "You do not have permission to access this file." }
    }
  }

  // ── 4. Try CloudFiles first ────────────────────────────────────────────────
  // If this file is managed by CloudFiles' connected cloud storage (not a
  // native HubSpot attachment), serve it directly — this entirely bypasses
  // HubSpot's Files API and sensitive-data restrictions. Also confirms the
  // file belongs to this deal, since the lookup is scoped by dealId.
  const cfAttachment = await findCloudFilesAttachment(dealId, fileId)

  if (cfAttachment && cfAttachment.library !== "hubspot") {
    const cfResult = await downloadFromCloudFiles(cfAttachment.resourceId)
    if (cfResult) {
      const { fileResult, fileName } = cfResult
      const cleanName = fileName || cfAttachment.name || "document"
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": fileResult.headers["content-type"] || "application/octet-stream",
          "Content-Disposition": `inline; filename="${cleanName}"`,
          "Content-Length": String(fileResult.body.length),
          "Cache-Control": "private, no-store",
        },
        body: fileResult.body.toString("base64"),
        isBase64Encoded: true,
      }
    }
    // CloudFiles said this is a CloudFiles-native file but the download step
    // failed — don't silently fall through to HubSpot logic for a file that
    // was never there in the first place.
    return { statusCode: 502, headers: corsHeaders, body: "Unable to download file from CloudFiles" }
  }

  // Otherwise this is either a native HubSpot attachment (cfAttachment.library
  // === "hubspot") or a file CloudFiles doesn't know about yet — fall through
  // to the legacy HubSpot verification + fetch path below. If CloudFiles
  // already confirmed the file belongs to this deal, skip the redundant
  // engagement scan.
  const cloudFilesConfirmedOwnership = !!cfAttachment

  // ── 5. Verify fileId belongs to this deal (legacy HubSpot path) ────────────
  if (!isStaff && !cloudFilesConfirmedOwnership) {
    const engResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/engagements/v1/engagements/associated/deal/${dealId}/paged?limit=200`,
      method: "GET",
      headers: { "Authorization": `Bearer ${SENSITIVE_TOKEN}` },
    })

    let validFileIds = new Set()
    try {
      const engBody = JSON.parse(engResult.body.toString() || "{}")
      for (const eng of engBody.results || []) {
        // Attachments
        for (const att of eng.attachments || []) {
          validFileIds.add(String(att.id))
        }
        // FileIds embedded in body
        const body = eng.engagement?.bodyPreview || ""
        for (const match of body.matchAll(/fileId=(\d+)/g)) {
          validFileIds.add(match[1])
        }
        // FileIds in metadata
        for (const m of eng.metadata?.attachments || []) {
          if (m.id) validFileIds.add(String(m.id))
        }
      }
    } catch {}

    if (validFileIds.size > 0 && !validFileIds.has(String(fileId))) {
      return { statusCode: 403, headers: corsHeaders, body: "You do not have permission to access this file." }
    }
  }

  // ── 6. Fetch and serve the file (legacy HubSpot path) ──────────────────────
  try {
    const metaResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/files/v3/files/${fileId}`,
      method: "GET",
      headers: { "Authorization": `Bearer ${SENSITIVE_TOKEN}` },
    })

    if (metaResult.status < 200 || metaResult.status >= 300) {
      console.error("DEBUG metaResult failed:", metaResult.status, metaResult.body.toString().slice(0, 300))
      return { statusCode: metaResult.status || 500, headers: corsHeaders, body: "File not found" }
    }

    const meta = JSON.parse(metaResult.body.toString())
    console.error("DEBUG meta.url:", meta.url, "| meta.defaultHostingUrl:", meta.defaultHostingUrl, "| meta.default_hosting_url:", meta.default_hosting_url, "| isUsableInPublicContent:", meta.isUsableInPublicContent)

    // HubSpot's dedicated download endpoint — the officially documented path for
    // sensitive files. Requires the FILE_MANAGER_SENSITIVE_ACCESS scope on the
    // private app. Try this FIRST for sensitive files, since signed-url is
    // explicitly rejected for them and the legacy filemanager proxy in meta.url
    // does not accept private-app Bearer tokens at all.
    const downloadResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/files/v3/files/${fileId}/download`,
      method: "GET",
      headers: { "Authorization": `Bearer ${SENSITIVE_TOKEN}` },
    }, true)

    console.error("DEBUG /download endpoint status:", downloadResult.status, "| content-type:", downloadResult.headers["content-type"], "| body preview (if error):", downloadResult.status >= 300 ? downloadResult.body.toString("utf8").slice(0, 300) : "(binary, skipped)")

    if (downloadResult.status >= 200 && downloadResult.status < 300) {
      const contentType = getContentType(meta, downloadResult)
      const cleanName = `${meta.name || "document"}${meta.extension && !(meta.name || "").toLowerCase().endsWith(`.${String(meta.extension).toLowerCase()}`) ? `.${meta.extension}` : ""}`

      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${cleanName}"`,
          "Content-Length": String(downloadResult.body.length),
          "Cache-Control": "private, no-store",
        },
        body: downloadResult.body.toString("base64"),
        isBase64Encoded: true,
      }
    }

    // Fall through to signed-url / meta.url path below if /download didn't work
    // (e.g. non-sensitive file, or scope not yet enabled on the private app).

    // Get a signed, temporary direct download URL from HubSpot
    const signedResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/files/v3/files/${fileId}/signed-url`,
      method: "GET",
      headers: { "Authorization": `Bearer ${SENSITIVE_TOKEN}` },
    })

    console.error("DEBUG signedResult.status:", signedResult.status, "| body:", signedResult.body.toString().slice(0, 300))

    let downloadUrl = ""
    if (signedResult.status >= 200 && signedResult.status < 300) {
      try { downloadUrl = JSON.parse(signedResult.body.toString()).url || "" } catch {}
    }
    // Fallback to meta.url if signed-url unavailable
    if (!downloadUrl) {
      downloadUrl = meta.url || meta.defaultHostingUrl || meta.default_hosting_url || ""
    }
    if (!downloadUrl) return { statusCode: 404, headers: corsHeaders, body: "File URL not found" }

    console.error("DEBUG downloadUrl chosen:", downloadUrl)

    const parsedUrl = new URL(downloadUrl)
    // Sensitive files can't get a signed URL ("Cannot generate signed URL for
    // sensitive file"), so the fallback is an authenticated HubSpot API URL — it
    // must be fetched WITH the token. Signed CDN URLs (S3/hubspotusercontent) must
    // be fetched WITHOUT auth, and redirect hops already drop headers.
    const isHubSpotApiHost = /(^|\.)hubapi\.com$/.test(parsedUrl.hostname) ||
                             (/\.hubspot\.com$/.test(parsedUrl.hostname) && /^api/.test(parsedUrl.hostname))

    // meta.url sometimes points at a regional host like api-na1.hubspot.com,
    // which is an internal endpoint that does NOT validate OAuth Bearer tokens
    // the same way the public gateway does (returns 401 "auth is missing" even
    // with a valid token attached). Rewrite to the public gateway host, keeping
    // path/query intact, whenever this needs Bearer auth.
    if (isHubSpotApiHost && parsedUrl.hostname !== "api.hubapi.com") {
      console.error("DEBUG rewriting host from", parsedUrl.hostname, "to api.hubapi.com")
      parsedUrl.hostname = "api.hubapi.com"
    }

    console.error("DEBUG parsedUrl.hostname:", parsedUrl.hostname, "| isHubSpotApiHost:", isHubSpotApiHost)

    const fileResult = await makeRequest({
      hostname: parsedUrl.hostname,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: "GET",
      headers: isHubSpotApiHost ? { "Authorization": `Bearer ${SENSITIVE_TOKEN}` } : {},
    }, true)  // follow redirects server-side — never return 302 to browser

    console.error("DEBUG fileResult.status:", fileResult.status, "| headers:", JSON.stringify(fileResult.headers), "| body preview:", fileResult.body.toString("utf8").slice(0, 300))

    if (fileResult.status < 200 || fileResult.status >= 300) {
      return { statusCode: fileResult.status, headers: corsHeaders, body: "Unable to download file" }
    }

    const contentType = getContentType(meta, fileResult)
    const cleanName = `${meta.name || "document"}${meta.extension && !(meta.name || "").toLowerCase().endsWith(`.${String(meta.extension).toLowerCase()}`) ? `.${meta.extension}` : ""}`

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${cleanName}"`,
        "Content-Length": String(fileResult.body.length),
        "Cache-Control": "private, no-store",
      },
      body: fileResult.body.toString("base64"),
      isBase64Encoded: true,
    }
  } catch (err) {
    console.error("download-file error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: "Server error" }
  }
}
