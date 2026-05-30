const https = require("https")

const TOKEN = process.env.HUBSPOT_TOKEN || process.env.VITE_HUBSPOT_TOKEN
const COMPANY_TOKEN = process.env.HUBSPOT_PERSONAL_ACCESS_KEY || TOKEN
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

async function followRedirects(url, authToken, maxRedirects = 5) {
  let currentUrl = new URL(url)
  let useAuth = true
  for (let i = 0; i < maxRedirects; i++) {
    const options = {
      hostname: currentUrl.hostname,
      path: currentUrl.pathname + currentUrl.search,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        // Only send auth token to HubSpot, not to S3/CDN
        ...(useAuth && currentUrl.hostname.includes("hubapi") ? { "Authorization": `Bearer ${authToken}` } : {}),
      },
    }
    const result = await makeRequest(options)
    if ((result.status === 301 || result.status === 302 || result.status === 307) && result.location) {
      currentUrl = new URL(result.location)
      useAuth = false // Don't send auth to S3/CDN redirects
      continue
    }
    return result
  }
  throw new Error("Too many redirects")
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

  // ── File download ────────────────────────────────────────────────────────────
  if (isDownload && fileId) {
    try {
      // Get file metadata first
      const metaResult = await makeRequest({
        hostname: "api.hubapi.com",
        path: `/filemanager/api/v3/files/${fileId}`,
        method: "GET",
        headers: {
          "Authorization": `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      })

      const meta = JSON.parse(metaResult.body.toString())
      console.log("File meta:", JSON.stringify({
        id: meta.id,
        name: meta.name,
        url: meta.url,
        s3_url: meta.s3_url,
        default_hosting_url: meta.default_hosting_url,
        extension: meta.extension,
        allows_anonymous_access: meta.allows_anonymous_access
      }))

      // Try URLs in order of preference
      const fileUrl = meta.default_hosting_url || meta.url || meta.s3_url || ""
      if (!fileUrl) {
        return { statusCode: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: "No file URL available" }) }
      }

      // Clean filename
      let filename = meta.name || `file-${fileId}`
      const hashMatch = filename.match(/^[a-f0-9]{13}-(.+)$/)
      if (hashMatch) filename = hashMatch[1]
      filename = filename.replace(/_/g, " ")
      const ext = (meta.extension || filename.split(".").pop() || "").toLowerCase()
      if (ext && !filename.toLowerCase().endsWith(`.${ext}`)) filename = `${filename}.${ext}`

      // Fetch the file following redirects
      const fileResult = await followRedirects(fileUrl, TOKEN)

      console.log("File fetch status:", fileResult.status, "size:", fileResult.body.length)

      if (fileResult.status !== 200) {
        return { 
          statusCode: fileResult.status, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }, 
          body: JSON.stringify({ error: `File fetch failed with status ${fileResult.status}` }) 
        }
      }

      const contentType = fileResult.headers["content-type"] || "application/octet-stream"
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
      return { statusCode: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: err.message }) }
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
    } else if (isPost) {
      bodyToSend = event.body || ""
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
