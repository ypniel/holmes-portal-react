const https = require("https")
const TOKEN = process.env.HUBSPOT_TOKEN || process.env.VITE_HUBSPOT_TOKEN
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
  const cdnUrl = event.queryStringParameters?.cdnUrl || ""

  // ── CDN URL proxy (authenticated pass-through) ────────────────────────────
  if (cdnUrl) {
    try {
      const decoded = decodeURIComponent(cdnUrl)
      // Only allow hubspotusercontent CDN URLs for security
      if (!decoded.includes("hubspotusercontent")) {
        return { statusCode: 403, headers: corsHeaders, body: "Not allowed" }
      }
      const url = new URL(decoded)
      const result = await makeRequest({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "GET",
        headers: {
          "Authorization": `Bearer ${TOKEN}`,
        },
      })
      // Determine content type from URL
      const ext = url.pathname.split(".").pop()?.toLowerCase() || ""
      const contentTypes = {
        pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
        png: "image/png", gif: "image/gif", webp: "image/webp",
        doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }
      const contentType = contentTypes[ext] || "application/octet-stream"
      // If HubSpot returns a redirect, follow it
      if (result.status === 302 && result.location) {
        return { statusCode: 302, headers: { ...corsHeaders, "Location": result.location }, body: "" }
      }
      return {
        statusCode: result.status,
        headers: {
          ...corsHeaders,
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${url.pathname.split("/").pop()}"`,
        },
        body: result.body.toString("base64"),
        isBase64Encoded: true,
      }
    } catch (err) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
    }
  }

  // ── File download by ID — proxy bytes directly (avoids signed URL permission issues) ──
  if (isDownload && fileId) {
    try {
      // Get file metadata to find CDN URL and filename
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
      const fileUrl = meta.default_hosting_url || meta.s3_url || meta.url || ""
      const fileName = meta.name || "document"
      if (!fileUrl) return { statusCode: 404, headers: corsHeaders, body: "File URL not found" }

      // Fetch file bytes with our API token
      const parsedUrl = new (require("url").URL)(fileUrl)
      const fileResult = await makeRequest({
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "GET",
        headers: { "Authorization": `Bearer ${TOKEN}` },
      })

      // If HubSpot redirects to login page, token lacks files scope
      if (fileResult.status === 302 && fileResult.location) {
        const loc = fileResult.location
        if (loc.includes("login") || loc.includes("app.hubspot.com")) {
          return { statusCode: 403, headers: corsHeaders, body: "File access denied" }
        }
        return { statusCode: 302, headers: { ...corsHeaders, "Location": loc }, body: "" }
      }

      if (fileResult.status !== 200) {
        return { statusCode: fileResult.status, headers: corsHeaders, body: "Could not fetch file" }
      }

      // Stream file bytes back to browser
      const ext = (fileName.split(".").pop() || "").toLowerCase()
      const contentTypes = {
        pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
        png: "image/png", gif: "image/gif", webp: "image/webp",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }
      const contentType = contentTypes[ext] || "application/octet-stream"
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${fileName}"`,
        },
        body: fileResult.body.toString("base64"),
        isBase64Encoded: true,
      }
    } catch (err) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
    }
  }

  // ── Standard API proxy ────────────────────────────────────────────────────
  if (!path) return { statusCode: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: "No path" }) }
  const token = TOKEN
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
