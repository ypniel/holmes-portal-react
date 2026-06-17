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

  // ── File download ─────────────────────────────────────────────────────────
  if (isDownload && fileId) {
    try {
      // Step 1: Get file metadata
      const metaResult = await makeRequest({
        hostname: "api.hubapi.com",
        path: `/filemanager/api/v3/files/${fileId}`,
        method: "GET",
        headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      })
      const meta = JSON.parse(metaResult.body.toString())

      // For private files use signed URL redirect — works with API token
      const isPrivate = meta.meta?.allows_anonymous_access === false || meta.meta?.sensitive === true

      if (isPrivate) {
        // Get signed URL
        const signedResult = await makeRequest({
          hostname: "api.hubspot.com",
          path: `/filemanager/api/v2/files/${fileId}/signed-url-redirect?portalId=39917994`,
          method: "GET",
          headers: { "Authorization": `Bearer ${TOKEN}` },
        })
        if (signedResult.status === 302 && signedResult.location) {
          return { statusCode: 302, headers: { ...corsHeaders, "Location": signedResult.location }, body: "" }
        }
        // If not a redirect, the body might be the URL
        const signedBody = signedResult.body.toString()
        try {
          const signedData = JSON.parse(signedBody)
          const signedUrl = signedData.url || signedData.signed_url || ""
          if (signedUrl) return { statusCode: 302, headers: { ...corsHeaders, "Location": signedUrl }, body: "" }
        } catch {}
        return { statusCode: 500, headers: corsHeaders, body: "Could not get signed URL" }
      }

      // Public files — redirect to CDN
      const fileUrl = meta.default_hosting_url || meta.s3_url || ""
      if (!fileUrl) return { statusCode: 404, headers: corsHeaders, body: "File not found" }
      return { statusCode: 302, headers: { ...corsHeaders, "Location": fileUrl }, body: "" }
    } catch (err) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
    }
  }


  // ── Standard proxy ────────────────────────────────────────────────────────
  if (!path) return { statusCode: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: "No path" }) }

  // Use TOKEN for everything
  const token = TOKEN

  try {
    const isPost = event.httpMethod === "POST"
    const isPatch = event.httpMethod === "PATCH"
    let bodyToSend = event.body || ""

    if (isPost && path.includes("/deals/search")) {
      const parsed = event.body ? JSON.parse(event.body) : {}
      // Check if request already has agent_email filter — if so preserve it and just add pipeline
      const hasAgentFilter = parsed.filterGroups?.[0]?.filters?.some(
        (f) => f.propertyName === "agent_email"
      )
      if (hasAgentFilter) {
        // Add pipeline to existing filters
        parsed.filterGroups = parsed.filterGroups.map((group) => ({
          ...group,
          filters: [...group.filters, { propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID }]
        }))
      } else {
        // Replace with pipeline only filter
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
