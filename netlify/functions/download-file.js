const https = require("https")

const TOKEN =
  process.env.HUBSPOT_TOKEN_WRITE ||
  process.env.HUBSPOT_TOKEN ||
  process.env.VITE_HUBSPOT_TOKEN

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = []
      res.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      res.on("end", () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks),
        headers: res.headers,
      }))
    })

    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}

function safeFilename(meta) {
  const baseName = meta?.name ? String(meta.name) : "document"
  const extension = meta?.extension ? String(meta.extension) : ""

  const withExtension = extension && !baseName.toLowerCase().endsWith(`.${extension.toLowerCase()}`)
    ? `${baseName}.${extension}`
    : baseName

  return withExtension.replace(/"/g, "")
}

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" }
  }

  const fileId = event.queryStringParameters?.fileId || event.queryStringParameters?.id || ""

  if (!TOKEN) {
    return { statusCode: 500, headers: corsHeaders, body: "Missing HubSpot token" }
  }

  if (!fileId || !/^\d+$/.test(String(fileId))) {
    return { statusCode: 400, headers: corsHeaders, body: "Missing or invalid fileId" }
  }

  try {
    const metaResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/files/v3/files/${fileId}`,
      method: "GET",
      headers: { Authorization: `Bearer ${TOKEN}` },
    })

    if (metaResult.status < 200 || metaResult.status >= 300) {
      console.error("HubSpot file metadata failed", {
        fileId,
        status: metaResult.status,
        body: metaResult.body.toString(),
      })

      return { statusCode: metaResult.status || 404, headers: corsHeaders, body: "File not found" }
    }

    const meta = JSON.parse(metaResult.body.toString())

    // CRM file upload properties usually return a HubSpot proxy URL in meta.url.
    // Fetch it server-side with the private app token, then stream the file to the browser.
    let sourceUrl = meta.url || meta.defaultHostingUrl || meta.default_hosting_url || ""

    // Last fallback: official download endpoint.
    // Kept as fallback only so this function does not depend on one HubSpot file style.
    if (!sourceUrl) {
      sourceUrl = `https://api.hubapi.com/files/v3/files/${fileId}/download`
    }

    let parsedUrl = new URL(sourceUrl)
    let fileResult = await makeRequest({
      hostname: parsedUrl.hostname,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
      },
    })

    // Some HubSpot file URLs redirect to a CDN URL. Follow it inside Netlify.
    if (fileResult.status >= 300 && fileResult.status < 400 && fileResult.headers.location) {
      parsedUrl = new URL(fileResult.headers.location)
      fileResult = await makeRequest({
        hostname: parsedUrl.hostname,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: "GET",
        headers: {},
      })
    }

    // If proxy/default URL failed, try the official download endpoint once.
    if (fileResult.status < 200 || fileResult.status >= 300) {
      const downloadUrl = new URL(`https://api.hubapi.com/files/v3/files/${fileId}/download`)
      fileResult = await makeRequest({
        hostname: downloadUrl.hostname,
        path: downloadUrl.pathname,
        method: "GET",
        headers: { Authorization: `Bearer ${TOKEN}` },
      })

      if (fileResult.status >= 300 && fileResult.status < 400 && fileResult.headers.location) {
        const redirectUrl = new URL(fileResult.headers.location)
        fileResult = await makeRequest({
          hostname: redirectUrl.hostname,
          path: `${redirectUrl.pathname}${redirectUrl.search}`,
          method: "GET",
          headers: {},
        })
      }
    }

    if (fileResult.status < 200 || fileResult.status >= 300) {
      console.error("HubSpot file download failed", {
        fileId,
        status: fileResult.status,
        body: fileResult.body.toString(),
      })

      return { statusCode: fileResult.status || 500, headers: corsHeaders, body: "Unable to download file" }
    }

    const contentType =
      fileResult.headers["content-type"] ||
      meta.mimeType ||
      (meta.encoding ? `image/${meta.encoding}` : null) ||
      "application/octet-stream"

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${safeFilename(meta)}"`,
        "Cache-Control": "private, max-age=300",
      },
      body: fileResult.body.toString("base64"),
      isBase64Encoded: true,
    }
  } catch (err) {
    console.error("download-file error", err)
    return { statusCode: 500, headers: corsHeaders, body: "Unable to download file" }
  }
}
