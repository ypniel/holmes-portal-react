const https = require("https")

const TOKEN = process.env.HUBSPOT_TOKEN

const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"]
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

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
    "Access-Control-Allow-Headers": "Content-Type, X-File-Name, X-File-Size",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" }

  try {
    const rawFileName = event.headers?.["x-file-name"] || "upload"
    const fileName = decodeURIComponent(rawFileName)
    const ext = fileName.split(".").pop()?.toLowerCase() || ""
    const declaredSize = parseInt(event.headers?.["x-file-size"] || "0")

    // ── Validate extension ────────────────────────────────────────────────────
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: `Only PDF, JPG, JPEG and PNG files are supported.` })
      }
    }

    // ── Validate file size ────────────────────────────────────────────────────
    const fileBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body || "", "utf8")

    if (fileBuffer.length > MAX_FILE_SIZE) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "File exceeds 5MB limit." })
      }
    }

    const contentType = event.headers?.["content-type"] || "application/octet-stream"
    const boundary = `----FormBoundary${Date.now()}`
    const CRLF = "\r\n"

    const preamble = Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="folderPath"${CRLF}${CRLF}/portal-uploads/pending${CRLF}` +
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
      const err = JSON.parse(uploadResult.body.toString())
      return {
        statusCode: uploadResult.status,
        headers: corsHeaders,
        body: JSON.stringify({ error: err.message || "Upload failed" })
      }
    }

    const fileData = JSON.parse(uploadResult.body.toString())
    const fileObj = fileData.objects?.[0] || fileData
    const fileId = String(fileObj.id)
    const fileSize = fileBuffer.length

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        fileId,
        fileName,
        extension: ext,
        size: fileSize,
      })
    }
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}
