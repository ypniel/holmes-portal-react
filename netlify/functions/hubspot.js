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


  // ── File download by ID ─────────────────────────────────────────────────────
  if (isDownload && fileId) {
    try {
      // HubSpot CRM file-upload properties can return HIDDEN_SENSITIVE files.
      // Those files should be streamed through this Netlify function instead of
      // redirecting the browser to a HubSpot API/proxy URL that requires auth.
      let metaResult = await makeRequest({
        hostname: "api.hubapi.com",
        path: `/files/v3/files/${fileId}`,
        method: "GET",
        headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      })

      // Fallback for older File Manager API responses.
      if (metaResult.status !== 200) {
        metaResult = await makeRequest({
          hostname: "api.hubapi.com",
          path: `/filemanager/api/v3/files/${fileId}`,
          method: "GET",
          headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        })
      }

      if (metaResult.status !== 200) {
        return { statusCode: 404, headers: corsHeaders, body: "File not found" }
      }

      const meta = JSON.parse(metaResult.body.toString())
      const fileUrl = meta.url || meta.defaultHostingUrl || meta.default_hosting_url || meta.s3Url || meta.s3_url || ""
      if (!fileUrl) return { statusCode: 404, headers: corsHeaders, body: "File URL not found" }

      const parsedUrl = new URL(fileUrl)
      const shouldAuthorize = parsedUrl.hostname.includes("hubspot.com") || parsedUrl.hostname.includes("hubapi.com")
      const fileResult = await makeRequest({
        hostname: parsedUrl.hostname,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: "GET",
        headers: {
          ...(shouldAuthorize ? { "Authorization": `Bearer ${TOKEN}` } : {}),
        },
      })

      if (fileResult.status >= 300 && fileResult.status < 400 && fileResult.headers.location) {
        return { statusCode: 302, headers: { ...corsHeaders, "Location": fileResult.headers.location }, body: "" }
      }

      if (fileResult.status < 200 || fileResult.status >= 300) {
        return { statusCode: fileResult.status, headers: corsHeaders, body: "Unable to download file" }
      }

      const contentType = fileResult.headers["content-type"] || meta.mimeType || meta.encoding && `image/${meta.encoding}` || "application/octet-stream"
      const dispositionName = `${meta.name || "document"}${meta.extension && !(meta.name || "").toLowerCase().endsWith(`.${String(meta.extension).toLowerCase()}`) ? `.${meta.extension}` : ""}`

      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${String(dispositionName).replace(/"/g, "")}"`,
          "Cache-Control": "private, max-age=300",
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
