const https = require("https")
const jwt = require("jsonwebtoken")

const TOKEN = process.env.HUBSPOT_TOKEN
const SENSITIVE_TOKEN = process.env.HUBSPOT_TOKEN_WRITE || TOKEN
const JWT_SECRET = process.env.JWT_SECRET
const HOLMES_DOMAINS = ["holmes.edu.au", "holmeseducation.group"]

const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"]
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

function getHeader(event, name) {
  const headers = event.headers || {}
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || ""
}

function mimeFromExtension(ext) {
  if (ext === "pdf") return "application/pdf"
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "png") return "image/png"
  return "application/octet-stream"
}

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = []
      res.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }))
    })
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-File-Name, X-Deal-Id, X-File-Size, X-File-Type, X-File-Base64",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" }

  // ── 1. Verify session token from Authorization header ─────────────────────
  const authHeader = event.headers?.authorization || event.headers?.Authorization || ""
  const token = authHeader.replace("Bearer ", "").trim()
  if (!token) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Unauthorised" }) }

  let session
  try {
    session = jwt.verify(token, JWT_SECRET)
  } catch {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Invalid session" }) }
  }

  try {
    const dealId = event.queryStringParameters?.dealId || ""
    if (!dealId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "No dealId" }) }

    // ── 2. Ownership check ──────────────────────────────────────────────────
    const isStaff = HOLMES_DOMAINS.some(d => (session.email || "").toLowerCase().endsWith("@" + d))
    const isStudent = session.type === "student_otp" || session.type === "student" || session.companyName === "Direct Student"

    if (!isStaff) {
      if (isStudent) {
        // Student: the deal must be linked to their contact
        const assoc = await makeRequest({
          hostname: "api.hubapi.com",
          path: `/crm/v4/objects/deals/${dealId}/associations/contacts`,
          method: "GET",
          headers: { "Authorization": `Bearer ${SENSITIVE_TOKEN}` },
        })
        let ok = false
        try {
          const b = JSON.parse(assoc.body.toString() || "{}")
          ok = (b.results || []).some(r => String(r.toObjectId) === String(session.contactId))
        } catch {}
        if (!ok) return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: "You do not have permission to upload to this application." }) }
      } else {
        // Agent: the deal's company must match the agent's company
        if (!session.companyId) {
          return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: "No agency linked to your account." }) }
        }
        const assoc = await makeRequest({
          hostname: "api.hubapi.com",
          path: `/crm/v4/objects/deals/${dealId}/associations/companies`,
          method: "GET",
          headers: { "Authorization": `Bearer ${SENSITIVE_TOKEN}` },
        })
        let dealCompanyId = null
        try {
          const b = JSON.parse(assoc.body.toString() || "{}")
          dealCompanyId = b.results?.[0]?.toObjectId
        } catch {}
        if (!dealCompanyId || String(dealCompanyId) !== String(session.companyId)) {
          return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: "You do not have permission to upload to this application." }) }
        }
      }
    }

    // ── 3. Validate file name / extension ─────────────────────────────────────
    const rawFileName = getHeader(event, "x-file-name") || "upload"
    const fileName = decodeURIComponent(rawFileName)
    const ext = fileName.split(".").pop()?.toLowerCase() || ""
    const contentType = getHeader(event, "x-file-type") || mimeFromExtension(ext)

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Only PDF, JPG, JPEG and PNG files are supported." }) }
    }

    // ── 4. Read + size-check the file ─────────────────────────────────────────
    const sentAsBase64 = String(getHeader(event, "x-file-base64")).toLowerCase() === "true"
    const fileBuffer = sentAsBase64 || event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "", "binary")

    if (fileBuffer.length === 0) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Empty file." }) }
    }
    if (fileBuffer.length > MAX_FILE_SIZE) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "File exceeds 5MB limit." }) }
    }

    const boundary = `----FormBoundary${Date.now()}`
    const CRLF = "\r\n"

    // ── 5. Upload as PRIVATE (not PUBLIC_INDEXABLE) ───────────────────────────
    const preamble = Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="folderPath"${CRLF}${CRLF}/HubSpot-Deals/${dealId}${CRLF}` +
      `--${boundary}${CRLF}Content-Disposition: form-data; name="options"${CRLF}Content-Type: application/json${CRLF}${CRLF}{"access":"PRIVATE","overwrite":false,"duplicateValidationStrategy":"NONE"}${CRLF}` +
      `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${fileName}"${CRLF}Content-Type: ${contentType}${CRLF}${CRLF}`
    )
    const epilogue = Buffer.from(`${CRLF}--${boundary}--${CRLF}`)
    const body = Buffer.concat([preamble, fileBuffer, epilogue])

    const uploadResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: "/filemanager/api/v3/files/upload",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    }, body)

    if (uploadResult.status !== 200 && uploadResult.status !== 201) {
      return { statusCode: uploadResult.status, headers: corsHeaders, body: uploadResult.body.toString() }
    }

    const fileData = JSON.parse(uploadResult.body.toString())
    const fileObj = fileData.objects?.[0] || fileData
    const fileId = fileObj.id

    // ── 6. Create engagement note (tagged PORTAL_UPLOAD, links via fileId + dealId) ──
    const engagementBody = JSON.stringify({
      engagement: { active: true, type: "NOTE", timestamp: Date.now() },
      associations: { dealIds: [parseInt(dealId)] },
      attachments: [{ id: parseInt(fileId) }],
      metadata: { body: `📎 File uploaded via portal [PORTAL_UPLOAD]: <a href="/.netlify/functions/download-file?fileId=${fileId}&dealId=${dealId}">${fileName}</a>` }
    })

    await makeRequest({
      hostname: "api.hubapi.com",
      path: "/engagements/v1/engagements",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SENSITIVE_TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(engagementBody),
      },
    }, engagementBody)

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, fileId, fileName })
    }
  } catch (err) {
    console.error("Upload error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}
