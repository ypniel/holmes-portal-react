const https = require("https")

const TOKEN = process.env.HUBSPOT_TOKEN
const CRM_TOKEN = process.env.HUBSPOT_TOKEN

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
    "Access-Control-Allow-Headers": "Content-Type, X-File-Name, X-Deal-Id, X-File-Size, X-File-Type, X-File-Base64",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" }

  try {
    const dealId = event.queryStringParameters?.dealId || ""
    const rawFileName = getHeader(event, "x-file-name") || "upload"
    const fileName = decodeURIComponent(rawFileName)
    const ext = fileName.split(".").pop()?.toLowerCase() || ""
    const contentType = getHeader(event, "x-file-type") || mimeFromExtension(ext)

    if (!dealId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "No dealId" }) }

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Only PDF, JPG, JPEG and PNG files are supported." }),
      }
    }

    const sentAsBase64 = String(getHeader(event, "x-file-base64")).toLowerCase() === "true"
    const fileBuffer = sentAsBase64 || event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "", "binary")

    if (fileBuffer.length > MAX_FILE_SIZE) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "File exceeds 5MB limit." }),
      }
    }

    const boundary = `----FormBoundary${Date.now()}`
    const CRLF = "\r\n"

    const preamble = Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="folderPath"${CRLF}${CRLF}/HubSpot-Deals/${dealId}${CRLF}` +
      `--${boundary}${CRLF}Content-Disposition: form-data; name="options"${CRLF}Content-Type: application/json${CRLF}${CRLF}{"access":"PUBLIC_INDEXABLE","overwrite":false,"duplicateValidationStrategy":"NONE"}${CRLF}` +
      `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${fileName}"${CRLF}Content-Type: ${contentType}${CRLF}${CRLF}`
    )
    const epilogue = Buffer.from(`${CRLF}--${boundary}--${CRLF}`)
    const body = Buffer.concat([preamble, fileBuffer, epilogue])

    // Step 1 — Upload file to HubSpot Files
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

    // Step 2 — Get actual file URL from metadata
    const metaResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/filemanager/api/v3/files/${fileId}`,
      method: "GET",
      headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    })
    const meta = JSON.parse(metaResult.body.toString())
    const fileUrl = meta.url || meta.default_hosting_url || meta.s3_url || ""

    // Step 3 — Create engagement note with real file URL and attachment ID
    const engagementBody = JSON.stringify({
      engagement: { active: true, type: "NOTE", timestamp: Date.now() },
      associations: { dealIds: [parseInt(dealId)] },
      attachments: [{ id: parseInt(fileId) }],
      metadata: { body: `📎 File uploaded via portal [PORTAL_UPLOAD]: <a href="/.netlify/functions/download-file?fileId=${fileId}">${fileName}</a>` }
    })

    await makeRequest({
      hostname: "api.hubapi.com",
      path: "/engagements/v1/engagements",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CRM_TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(engagementBody),
      },
    }, engagementBody)

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, fileId, fileName, fileUrl })
    }
  } catch (err) {
    console.error("Upload error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}
