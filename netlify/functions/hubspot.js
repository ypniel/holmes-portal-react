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

async function followRedirects(url, maxRedirects = 5) {
  let currentUrl = new URL(url)
  for (let i = 0; i < maxRedirects; i++) {
    const options = {
      hostname: currentUrl.hostname,
      path: currentUrl.pathname + currentUrl.search,
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0" },
    }
    const result = await makeRequest(options)
    if (result.status === 302 && result.location) {
      currentUrl = new URL(result.location)
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
      // Step 1 — get signed URL from HubSpot
      const signedUrlResult = await makeRequest({
        hostname: "api.hubapi.com",
        path: `/filemanager/api/v3/files/${fileId}/signed-url`,
        method: "GET",
        headers: {
          "Authorization": `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      })

      let signedUrl = ""
      let filename = `file-${fileId}`
      let ext = ""

      if (signedUrlResult.status === 200) {
        const signedData = JSON.parse(signedUrlResult.body.toString())
        signedUrl = signedData.url || ""
        filename = signedData.name || filename
        ext = (signedData.extension || filename.split(".").pop() || "").toLowerCase()
      }

      // Fallback — get metadata if signed URL failed
      if (!signedUrl) {
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
        signedUrl = meta.url || meta.s3_url || ""
        filename = meta.name || filename
        ext = (meta.extension || filename.split(".").pop() || "").toLowerCase()
      }

      if (!signedUrl) {
        return { statusCode: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: "Could not get file URL" }) }
      }

      // Clean filename
      const hashMatch = filename.match(/^[a-f0-9]{13}-(.+)$/)
      if (hashMatch) filename = hashMatch[1]
      filename = filename.replace(/_/g, " ")
      if (ext && !filename.toLowerCase().endsWith(`.${ext}`)) filename = `${filename}.${ext}`

      // Step 2 — fetch the actual file following any redirects
      const fileResult = await followRedirects(signedUrl)

      if (fileResult.status !== 200) {
        return { statusCode: fileResult.status, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: `File fetch failed: ${fileResult.status}` }) }
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
