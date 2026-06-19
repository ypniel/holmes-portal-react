const https = require("https")

const TOKEN = process.env.HUBSPOT_TOKEN
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

    // Decode base64 file — Netlify sends binary as base64
    const fileBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body || "", "utf8")

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
    const cdnUrl = `https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/HubSpot-Deals/${dealId}/${encodeURIComponent(fileName)}`

    // Step 2 — Create engagement note with CDN link and attachment ID
    const engagementBody = JSON.stringify({
      engagement: { active: true, type: "NOTE", timestamp: Date.now() },
      associations: { dealIds: [parseInt(dealId)] },
      attachments: [{ id: parseInt(fileId) }],
      metadata: { body: `📎 File uploaded via portal: <a href="${cdnUrl}">${fileName}</a>` }
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

    // Step 3 — Attach file directly to deal record via CRM v3
    const attachBody = JSON.stringify({ id: String(fileId) })
    await makeRequest({
      hostname: "api.hubapi.com",
      path: `/crm/v3/objects/deals/${dealId}/associations/FILE/${fileId}/FILE_TO_DEAL`,
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${CRM_TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(attachBody),
      },
    }, attachBody)

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, fileId, fileName, cdnUrl })
    }
  } catch (err) {
    console.error("Upload error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}
