const https = require("https")

const TOKEN = process.env.HUBSPOT_TOKEN

const FILE_PROPS = [
  "file_upload_1","file_upload_2","file_upload_3","file_upload_4","file_upload_5",
  "file_upload_6","file_upload_7","file_upload_8","file_upload_9","file_upload_10"
]

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

function fetchFileBuffer(fileUrl) {
  return new Promise((resolve, reject) => {
    const mod = fileUrl.startsWith("https") ? https : require("http")
    mod.get(fileUrl, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchFileBuffer(res.headers.location).then(resolve).catch(reject)
      }
      const chunks = []
      res.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      res.on("end", () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers["content-type"] || "application/octet-stream" }))
    }).on("error", reject)
  })
}

async function processFile(fileUrl, dealId) {
  const fileName = decodeURIComponent(fileUrl.split("/").pop().split("?")[0]) || "upload"

  const { buffer, contentType } = await fetchFileBuffer(fileUrl)

  const boundary = `----FormBoundary${Date.now()}`
  const CRLF = "\r\n"

  const preamble = Buffer.from(
    `--${boundary}${CRLF}Content-Disposition: form-data; name="folderPath"${CRLF}${CRLF}/HubSpot-Deals/${dealId}${CRLF}` +
    `--${boundary}${CRLF}Content-Disposition: form-data; name="options"${CRLF}Content-Type: application/json${CRLF}${CRLF}{"access":"PUBLIC_INDEXABLE","overwrite":false,"duplicateValidationStrategy":"NONE"}${CRLF}` +
    `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${fileName}"${CRLF}Content-Type: ${contentType}${CRLF}${CRLF}`
  )
  const epilogue = Buffer.from(`${CRLF}--${boundary}--${CRLF}`)
  const body = Buffer.concat([preamble, buffer, epilogue])

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
    throw new Error(`File upload failed (${uploadResult.status}): ${uploadResult.body.toString()}`)
  }

  const fileData = JSON.parse(uploadResult.body.toString())
  const fileObj = fileData.objects?.[0] || fileData
  const fileId = fileObj.id
  const cdnUrl = `https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/HubSpot-Deals/${dealId}/${encodeURIComponent(fileName)}`

  const engagementBody = JSON.stringify({
    engagement: { active: true, type: "NOTE", timestamp: Date.now() },
    associations: { dealIds: [parseInt(dealId)] },
    attachments: [{ id: parseInt(fileId) }],
    metadata: { body: `📎 File from form submission: <a href="${cdnUrl}">${fileName}</a>` }
  })

  await makeRequest({
    hostname: "api.hubapi.com",
    path: "/engagements/v1/engagements",
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(engagementBody),
    },
  }, engagementBody)

  return { fileId, fileName, cdnUrl }
}

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" }

  try {
    let payload = {}
    try { payload = JSON.parse(event.body || "{}") } catch { payload = {} }

    const dealId = payload.dealId || event.queryStringParameters?.dealId
    if (!dealId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Missing dealId" }) }

    // Fetch deal to read all file_upload_X properties
    const dealRes = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/crm/v3/objects/deals/${dealId}?properties=${FILE_PROPS.join(",")}`,
      method: "GET",
      headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    })

    if (dealRes.status !== 200) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: "Deal not found" }) }
    }

    const dealData = JSON.parse(dealRes.body.toString())
    const props = dealData.properties || {}

    const fileUrls = FILE_PROPS
      .map(p => props[p])
      .filter(v => v && v !== "null" && v.startsWith("http"))

    if (fileUrls.length === 0) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "No files to process" }) }
    }

    const results = []
    for (const url of fileUrls) {
      try {
        const result = await processFile(url, dealId)
        results.push({ success: true, ...result })
      } catch (err) {
        results.push({ success: false, url, error: err.message })
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ processed: results.length, results }),
    }
  } catch (err) {
    console.error("form-to-attachments error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}
