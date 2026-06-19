const https = require("https")

const TOKEN = process.env.HUBSPOT_TOKEN
const WRITE_TOKEN = process.env.HUBSPOT_TOKEN_WRITE
const FILE_PROPS = ["file_upload_1","file_upload_2","file_upload_3","file_upload_4","file_upload_5"]

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

function extractFileIds(value) {
  if (!value || value === "null" || value.trim() === "") return []
  return value.split(";").map(v => {
    v = v.trim()
    if (/^\d+$/.test(v)) return v
    const m = v.match(/\/file\/(\d+)/) || v.match(/fileId=(\d+)/)
    return m ? m[1] : null
  }).filter(Boolean)
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

    // Fetch deal to read file_upload_1 to 5
    const dealRes = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/crm/v3/objects/deals/${dealId}?properties=${FILE_PROPS.join(",")}`,
      method: "GET",
      headers: { "Authorization": `Bearer ${WRITE_TOKEN}`, "Content-Type": "application/json" },
    })

    if (dealRes.status !== 200) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: "Deal not found" }) }
    }

    const props = JSON.parse(dealRes.body.toString()).properties || {}
    const attached = [], failed = []

    for (const prop of FILE_PROPS) {
      const fileIds = extractFileIds(props[prop])
      for (const fileId of fileIds) {
        const result = await makeRequest({
          hostname: "api.hubapi.com",
          path: `/crm/v3/objects/deals/${dealId}/associations/FILE/${fileId}/FILE_TO_DEAL`,
          method: "PUT",
          headers: { "Authorization": `Bearer ${WRITE_TOKEN}`, "Content-Type": "application/json", "Content-Length": 0 },
        })
        if ([200, 201, 204].includes(result.status)) {
          attached.push(fileId)
        } else {
          failed.push({ fileId, error: result.body.toString() })
        }
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, attached, failed })
    }
  } catch (err) {
    console.error("form-to-attachments error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}
