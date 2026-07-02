const https = require("https")
const jwt = require("jsonwebtoken")

const FILE_TOKEN = process.env.HUBSPOT_TOKEN
const SENSITIVE_TOKEN = process.env.HUBSPOT_TOKEN_WRITE || FILE_TOKEN
const JWT_SECRET = process.env.JWT_SECRET
const HOLMES_DOMAINS = ["holmes.edu.au", "holmeseducation.group"]

// ── HTTP helper ───────────────────────────────────────────────────────────────
function makeRequest(options, followRedirects = false, depth = 0) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      // Follow redirects server-side (for file CDN URLs)
      if (followRedirects && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 5) {
        try {
          const redirectUrl = new URL(res.headers.location, `https://${options.hostname}`)
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

  // ── 4. Verify fileId belongs to this deal ─────────────────────────────────
  if (!isStaff) {
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

  // ── 5. Fetch and serve the file ───────────────────────────────────────────
  try {
    const metaResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/files/v3/files/${fileId}`,
      method: "GET",
      headers: { "Authorization": `Bearer ${FILE_TOKEN}` },
    })

    if (metaResult.status < 200 || metaResult.status >= 300) {
      return { statusCode: metaResult.status || 500, headers: corsHeaders, body: "File not found" }
    }

    const meta = JSON.parse(metaResult.body.toString())

    // Get a signed, temporary direct download URL from HubSpot
    const signedResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/files/v3/files/${fileId}/signed-url`,
      method: "GET",
      headers: { "Authorization": `Bearer ${FILE_TOKEN}` },
    })

    let downloadUrl = ""
    if (signedResult.status >= 200 && signedResult.status < 300) {
      try { downloadUrl = JSON.parse(signedResult.body.toString()).url || "" } catch {}
    }
    // Fallback to meta.url if signed-url unavailable
    if (!downloadUrl) {
      downloadUrl = meta.url || meta.defaultHostingUrl || meta.default_hosting_url || ""
    }
    if (!downloadUrl) return { statusCode: 404, headers: corsHeaders, body: "File URL not found" }

    const parsedUrl = new URL(downloadUrl)
    const fileResult = await makeRequest({
      hostname: parsedUrl.hostname,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: "GET",
      headers: {},
    }, true)  // follow redirects server-side — never return 302 to browser

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
