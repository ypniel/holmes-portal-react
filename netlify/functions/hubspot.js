const https = require("https")
const TOKEN = process.env.HUBSPOT_TOKEN || process.env.VITE_HUBSPOT_TOKEN
const WRITE_TOKEN = process.env.HUBSPOT_TOKEN_WRITE || TOKEN
const PIPELINE_ID = process.env.VITE_PIPELINE_ID || "789344406"
function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve({ status: 302, location: res.headers.location, body: Buffer.alloc(0), headers: res.headers })
        return
      }
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
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  }
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }
  const path = event.queryStringParameters?.path || ""
  const isDownload = event.queryStringParameters?.download === "true"
  const fileId = event.queryStringParameters?.fileId || ""


  // ── File download by ID ─────────────────────────────────────────────────────
  if (isDownload && fileId) {
    try {
      // Get file metadata — TOKEN has files + files.ui_hidden scope
      const metaResult = await makeRequest({
        hostname: "api.hubapi.com",
        path: `/filemanager/api/v3/files/${fileId}`,
        method: "GET",
        headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      })
      if (metaResult.status !== 200) {
        return { statusCode: 404, headers: corsHeaders, body: "File not found" }
      }
      const meta = JSON.parse(metaResult.body.toString())
      const fileName = meta.name || "document"
      const ext = meta.extension || fileName.split(".").pop() || ""

      // Try multiple approaches to fetch the file bytes with auth
      const displayName = ext && !fileName.endsWith(`.${ext}`) ? `${fileName}.${ext}` : fileName
      const contentTypes = {
        pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
        png: "image/png", gif: "image/gif", webp: "image/webp", heic: "image/heic",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }
      const contentType = contentTypes[ext.toLowerCase()] || "application/octet-stream"

      // Try v2 API (designed for form-uploaded files, uses forms-uploaded-files scope)
      const v2Result = await makeRequest({
        hostname: "api.hubapi.com",
        path: `/filemanager/api/v2/files/${fileId}`,
        method: "GET",
        headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      })
      if (v2Result.status === 200) {
        try {
          const v2Data = JSON.parse(v2Result.body.toString())
          const v2Url = v2Data.default_hosting_url || v2Data.s3_url || ""
          if (v2Url) {
            // Redirect directly — v2 CDN URLs for form-uploads work without extra auth
            return { statusCode: 302, headers: { ...corsHeaders, "Location": v2Url }, body: "" }
          }
        } catch {}
      }

      // Try v3 proxy with TOKEN
      const v3Result = await makeRequest({
        hostname: "api-na1.hubspot.com",
        path: `/filemanager/api/v3/files/${fileId}/proxy?portalId=39917994`,
        method: "GET",
        headers: { "Authorization": `Bearer ${TOKEN}` },
      })
      if (v3Result.status === 200) {
        return {
          statusCode: 200,
          headers: { ...corsHeaders, "Content-Type": contentType, "Content-Disposition": `inline; filename="${displayName}"` },
          body: v3Result.body.toString("base64"),
          isBase64Encoded: true,
        }
      }

      // Try v3 proxy with WRITE_TOKEN
      const v3WriteResult = await makeRequest({
        hostname: "api-na1.hubspot.com",
        path: `/filemanager/api/v3/files/${fileId}/proxy?portalId=39917994`,
        method: "GET",
        headers: { "Authorization": `Bearer ${WRITE_TOKEN}` },
      })
      if (v3WriteResult.status === 200) {
        return {
          statusCode: 200,
          headers: { ...corsHeaders, "Content-Type": contentType, "Content-Disposition": `inline; filename="${displayName}"` },
          body: v3WriteResult.body.toString("base64"),
          isBase64Encoded: true,
        }
      }

      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: "Could not access file", v2: v2Result?.status, v3Token: v3Result?.status, v3Write: v3WriteResult?.status }) }
    } catch (err) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
    }
  }

  // ── Standard API proxy ────────────────────────────────────────────────────
  if (!path) return { statusCode: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: "No path" }) }
  const useWriteToken = event.queryStringParameters?.useWriteToken === "true"
  const token = useWriteToken ? WRITE_TOKEN : TOKEN
  try {
    const isPost = event.httpMethod === "POST"
    const isPatch = event.httpMethod === "PATCH"
    let bodyToSend = event.body || ""
    if (isPost && path.includes("/deals/search")) {
      const parsed = event.body ? JSON.parse(event.body) : {}
      const hasAgentFilter = parsed.filterGroups?.[0]?.filters?.some(
        (f) => f.propertyName === "agent_email"
      )
      if (hasAgentFilter) {
        parsed.filterGroups = parsed.filterGroups.map((group) => ({
          ...group,
          filters: [...group.filters, { propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID }]
        }))
      } else {
        parsed.filterGroups = [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID }] }]
      }
      bodyToSend = JSON.stringify(parsed)
    }
    const bodyBuf = Buffer.from(bodyToSend || "", "utf8")
    const options = {
      hostname: "api.hubapi.com",
      path: path,
      method: isPatch ? "PATCH" : isPost ? "POST" : "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": bodyBuf.length,
      },
    }
    const result = await makeRequest(options, bodyBuf.length > 0 ? bodyToSend : undefined)
    return {
      statusCode: result.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: result.body.toString(),
    }
  } catch (err) {
    return { statusCode: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: err.message }) }
  }
}
