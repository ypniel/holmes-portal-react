const https = require("https")

const TOKEN = process.env.HUBSPOT_TOKEN || process.env.VITE_HUBSPOT_TOKEN

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = []
      res.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }))
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
    const fileName = event.headers?.["x-file-name"] || "upload"
    const contentType = event.headers?.["content-type"] || "application/octet-stream"

    if (!dealId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "No dealId" }) }

    // Decode base64 file body
    const fileBuffer = Buffer.from(event.body, "base64")

    // Build multipart form data for HubSpot Files API
    const boundary = `----FormBoundary${Date.now()}`
    const CRLF = "\r\n"

    const parts = []
    // folderPath field
    parts.push(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="folderPath"${CRLF}${CRLF}` +
      `/portal-uploads${CRLF}`
    )
    // options field
    parts.push(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="options"${CRLF}` +
      `Content-Type: application/json${CRLF}${CRLF}` +
      `{"access": "PRIVATE", "overwrite": false, "duplicateValidationStrategy": "NONE"}${CRLF}`
    )
    // file field
    const fileHeader = Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"${CRLF}` +
      `Content-Type: ${contentType}${CRLF}${CRLF}`
    )
    const fileFooter = Buffer.from(`${CRLF}--${boundary}--${CRLF}`)

    const partsBuffer = Buffer.from(parts.join(""))
    const body = Buffer.concat([partsBuffer, fileHeader, fileBuffer, fileFooter])

    // Step 1 — Upload file to HubSpot Files API
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
      const errBody = uploadResult.body.toString()
      console.error("File upload error:", uploadResult.status, errBody)
      return { statusCode: uploadResult.status, headers: corsHeaders, body: JSON.stringify({ error: errBody }) }
    }

    const fileData = JSON.parse(uploadResult.body.toString())
    const fileId = fileData.id

    // Step 2 — Create a note on the deal with the file attached
    const noteResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: "/crm/v3/objects/notes",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    }, JSON.stringify({
      properties: {
        hs_note_body: `📎 File uploaded: ${fileName}`,
        hs_timestamp: new Date().toISOString(),
      },
      associations: [{
        to: { id: dealId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 }]
      }]
    }))

    const noteData = JSON.parse(noteResult.body.toString())
    const noteId = noteData.id

    // Step 3 — Associate file attachment with the note via engagements
    if (noteId && fileId) {
      await makeRequest({
        hostname: "api.hubapi.com",
        path: "/engagements/v1/engagements",
        method: "POST",
        headers: {
          "Authorization": `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }, JSON.stringify({
        engagement: { active: true, type: "NOTE" },
        associations: { dealIds: [parseInt(dealId)] },
        attachments: [{ id: fileId }],
        metadata: { body: `📎 File uploaded: ${fileName}` }
      }))
    }

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
