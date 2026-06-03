const https = require("https")

const FILES_TOKEN = process.env.HUBSPOT_FILES_TOKEN || process.env.HUBSPOT_TOKEN
const CRM_TOKEN = process.env.HUBSPOT_TOKEN

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
    "Access-Control-Allow-Headers": "Content-Type, X-File-Name, X-Deal-Id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" }

  try {
    const dealId = event.queryStringParameters?.dealId || ""
    const rawFileName = event.headers?.["x-file-name"] || "upload"
    const fileName = decodeURIComponent(rawFileName)
    const contentType = event.headers?.["content-type"] || "application/octet-stream"

    if (!dealId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "No dealId" }) }

    const fileBuffer = Buffer.from(event.body, "base64")
    const boundary = `----FormBoundary${Date.now()}`
    const CRLF = "\r\n"

    const preamble = Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="folderPath"${CRLF}${CRLF}/portal-uploads${CRLF}` +
      `--${boundary}${CRLF}Content-Disposition: form-data; name="options"${CRLF}Content-Type: application/json${CRLF}${CRLF}{"access":"PRIVATE","overwrite":false,"duplicateValidationStrategy":"NONE"}${CRLF}` +
      `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${fileName}"${CRLF}Content-Type: ${contentType}${CRLF}${CRLF}`
    )
    const epilogue = Buffer.from(`${CRLF}--${boundary}--${CRLF}`)
    const body = Buffer.concat([preamble, fileBuffer, epilogue])

    // Step 1 — Upload file to HubSpot
    const uploadResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: "/filemanager/api/v3/files/upload",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${FILES_TOKEN}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    }, body)

    console.log("Upload status:", uploadResult.status, uploadResult.body.toString().substring(0, 200))

    if (uploadResult.status !== 200 && uploadResult.status !== 201) {
      return { statusCode: uploadResult.status, headers: corsHeaders, body: uploadResult.body.toString() }
    }

    const fileData = JSON.parse(uploadResult.body.toString())
    const fileId = fileData.id
    const fileUrl = fileData.url || fileData.default_hosting_url || ""

    // Step 2 — Create engagement (legacy API) with file attachment
    const engagementBody = JSON.stringify({
      engagement: { active: true, type: "NOTE", timestamp: Date.now() },
      associations: { dealIds: [parseInt(dealId)] },
      attachments: [{ id: parseInt(fileId) }],
      metadata: { body: `📎 File uploaded via portal: <a href="${fileUrl}">${fileName}</a>` }
    })

    const engResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: "/engagements/v1/engagements",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CRM_TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(engagementBody),
      },
    }, engagementBody)

    console.log("Engagement status:", engResult.status, engResult.body.toString().substring(0, 200))

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
