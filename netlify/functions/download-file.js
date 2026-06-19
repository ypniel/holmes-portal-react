const https = require("https")

const FILE_TOKEN =
  process.env.HUBSPOT_TOKEN ||
  process.env.VITE_HUBSPOT_TOKEN

const SENSITIVE_TOKEN =
  process.env.HUBSPOT_TOKEN_WRITE ||
  FILE_TOKEN

function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = []

      res.on("data", (chunk) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      )

      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        })
      })
    })

    req.on("error", reject)
    req.end()
  })
}

function getContentType(meta, fileResult) {
  const ext = String(meta.extension || "").toLowerCase()

  return (
    fileResult.headers["content-type"] ||
    meta.mimeType ||
    (ext === "pdf" ? "application/pdf" : null) ||
    (ext === "jpg" || ext === "jpeg" ? "image/jpeg" : null) ||
    (ext === "png" ? "image/png" : null) ||
    (ext === "gif" ? "image/gif" : null) ||
    (ext === "webp" ? "image/webp" : null) ||
    "application/octet-stream"
  )
}

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
  }

  const fileId = event.queryStringParameters?.fileId

  if (!fileId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: "Missing fileId",
    }
  }

  try {
    const metaResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/files/v3/files/${fileId}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${FILE_TOKEN}`,
      },
    })

    if (metaResult.status < 200 || metaResult.status >= 300) {
      console.error("HubSpot file metadata failed", {
        fileId,
        status: metaResult.status,
        body: metaResult.body.toString(),
      })

      return {
        statusCode: metaResult.status || 500,
        headers: corsHeaders,
        body: "File metadata not found",
      }
    }

    const meta = JSON.parse(metaResult.body.toString())

    let fileResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/files/v3/files/${fileId}/download`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${SENSITIVE_TOKEN}`,
      },
    })

    if (
      fileResult.status >= 300 &&
      fileResult.status < 400 &&
      fileResult.headers.location
    ) {
      const redirectUrl = new URL(fileResult.headers.location)

      fileResult = await makeRequest({
        hostname: redirectUrl.hostname,
        path: `${redirectUrl.pathname}${redirectUrl.search}`,
        method: "GET",
        headers: {},
      })
    }

    if (fileResult.status < 200 || fileResult.status >= 300) {
      console.error("HubSpot file download failed", {
        fileId,
        status: fileResult.status,
        body: fileResult.body.toString(),
      })

      return {
        statusCode: fileResult.status || 500,
        headers: corsHeaders,
        body: "Unable to download file",
      }
    }

    const extension = String(meta.extension || "").toLowerCase()
    const baseName = meta.name ? String(meta.name) : "document"
    const fileName =
      extension && !baseName.toLowerCase().endsWith(`.${extension}`)
        ? `${baseName}.${extension}`
        : baseName

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": getContentType(meta, fileResult),
        "Content-Disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=300",
      },
      body: fileResult.body.toString("base64"),
      isBase64Encoded: true,
    }
  } catch (err) {
    console.error("download-file crashed", err)

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: "Unable to download file",
    }
  }
}
