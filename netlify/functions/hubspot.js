const https = require("https")

const TOKEN = process.env.HUBSPOT_TOKEN || process.env.VITE_HUBSPOT_TOKEN
const COMPANY_TOKEN = process.env.HUBSPOT_PERSONAL_ACCESS_KEY || TOKEN
const PIPELINE_ID = process.env.VITE_PIPELINE_ID || "789344406"

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve({ status: 302, location: res.headers.location, body: "", headers: res.headers })
        return
      }
      // For binary files, collect as buffer
      const chunks = []
      res.on("data", chunk => chunks.push(chunk))
      res.on("end", () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks),
        headers: res.headers,
        isBuffer: true,
      }))
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }

  const path = event.queryStringParameters?.path || ""
  const isDownload = event.queryStringParameters?.download === "true"
  const useCompanyToken = event.queryStringParameters?.useCompanyToken === "true"
  const fileId = event.queryStringParameters?.fileId || ""

  // ── File download route ──────────────────────────────────────────────────────
  // Step 1: Get signed URL from HubSpot file API
  // Step 2: Fetch the actual file using that signed URL
  // Step 3: Stream it back to the browser
  if (isDownload && fileId) {
    try {
      // Step 1 — get file metadata including signed URL
      const metaOptions = {
        hostname: "api.hubapi.com",
        path: `/filemanager/api/v3/files/${fileId}`,
        method: "GET",
        headers: {
          "Authorization": `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
      const metaResult = await makeRequest(metaOptions)
      const meta = JSON.parse(metaResult.body.toString())

      // Get the best available URL
      const fileUrl = meta.url || meta.s3_url || meta.default_hosting_url || ""
      if (!fileUrl) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: "File URL not found" }) }
      }

      // Strip hash prefix from filename
      let filename = meta.name || `file-${fileId}`
      const hashMatch = filename.match(/^[a-f0-9]{13}-(.+)$/)
      if (hashMatch) filename = hashMatch[1]
      filename = filename.replace(/_/g, " ")

      // Step 2 — fetch the actual file from the URL
      // Note: do NOT send HubSpot auth token to S3/CDN URLs
      const fileUrlObj = new URL(fileUrl)
      const fetchOptions = {
        hostname: fileUrlObj.hostname,
        path: fileUrlObj.pathname + fileUrlObj.search,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      }

      const fileResult = await makeRequest(fetchOptions)

      // Handle redirect from S3 signed URL
      if (fileResult.status === 302 && fileResult.location) {
        const redirectUrl = new URL(fileResult.location)
        const redirectOptions = {
          hostname: redirectUrl.hostname,
          path: redirectUrl.pathname + redirectUrl.search,
          method: "GET",
          headers: {},
        }
        const redirectResult = await makeRequest(redirectOptions)
        const contentType = redirectResult.headers["content-type"] || meta.type || "application/octet-stream"
        const ext = (meta.extension || meta.name?.split(".").pop() || "").toLowerCase()
        if (ext && !filename.toLowerCase().endsWith(`.${ext}`)) {
          filename = `${filename}.${ext}`
        }
        const viewable = ["pdf","jpg","jpeg","png","gif","webp","svg"].includes(ext)
        const disposition = viewable ? `inline; filename="${filename}"` : `attachment; filename="${filename}"`
        return {
          statusCode: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": contentType,
            "Content-Disposition": disposition,
          },
          body: redirectResult.body.toString("base64"),
          isBase64Encoded: true,
        }
      }

      // Step 3 — return file to browser
      const contentType = fileResult.headers["content-type"] || meta.type || "application/octet-stream"
      const ext = (meta.extension || meta.name?.split(".").pop() || "").toLowerCase()
      if (ext && !filename.toLowerCase().endsWith(`.${ext}`)) {
        filename = `${filename}.${ext}`
      }
      // View inline for PDFs and images, download for everything else
      const viewable = ["pdf","jpg","jpeg","png","gif","webp","svg"].includes(ext)
      const disposition = viewable ? `inline; filename="${filename}"` : `attachment; filename="${filename}"`
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": contentType,
          "Content-Disposition": disposition,
        },
        body: fileResult.body.toString("base64"),
        isBase64Encoded: true,
      }
    } catch (err) {
      console.error("File download error:", err.message)
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
    }
  }

  // ── Standard HubSpot API proxy ────────────────────────────────────────────────
  if (!path) return { statusCode: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: "No path" }) }

  const token = useCompanyToken ? COMPANY_TOKEN : TOKEN

  try {
    const isPost = event.httpMethod === "POST"
    let bodyToSend = event.body || ""

    if (isPost && path.includes("/deals/search")) {
      const parsed = event.body ? JSON.parse(event.body) : {}
      parsed.filterGroups = [{
        filters: [{ propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID }]
      }]
      bodyToSend = JSON.stringify(parsed)
    }

    const bodyBuf = Buffer.from(bodyToSend || "", "utf8")

    const options = {
      hostname: "api.hubapi.com",
      path: path,
      method: isPost ? "POST" : "GET",
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
