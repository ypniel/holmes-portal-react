const https = require("https")
const jwt = require("jsonwebtoken")
const JWT_SECRET = process.env.JWT_SECRET
const HOLMES_DOMAINS = ["holmes.edu.au", "holmeseducation.group"]

function verifySession(event) {
  const token = event.queryStringParameters?.sessionToken || ""
  if (!token || !JWT_SECRET) return null
  try { return jwt.verify(token, JWT_SECRET) } catch { return null }
}

async function getDealCompanyId(dealId) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: "api.hubapi.com",
      path: `/crm/v4/objects/deals/${dealId}/associations/companies`,
      method: "GET",
      headers: { "Authorization": `Bearer ${FILE_TOKEN}`, "Content-Type": "application/json" },
    }, (res) => {
      const chunks = []
      res.on("data", c => chunks.push(c))
      res.on("end", () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString())
          resolve(data.results?.[0]?.toObjectId ? String(data.results[0].toObjectId) : null)
        } catch { resolve(null) }
      })
    })
    req.on("error", () => resolve(null))
    req.end()
  })
}


const FILE_TOKEN = process.env.HUBSPOT_TOKEN

const SENSITIVE_TOKEN =
  process.env.HUBSPOT_TOKEN_WRITE ||
  FILE_TOKEN

function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = []

      res.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })

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

  if (ext === "pdf") return "application/pdf"
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "png") return "image/png"
  if (ext === "gif") return "image/gif"
  if (ext === "webp") return "image/webp"
  if (ext === "svg") return "image/svg+xml"

  return (
    meta.mimeType ||
    fileResult.headers["content-type"] ||
    "application/octet-stream"
  )
}

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
  }

  const fileId = event.queryStringParameters?.fileId


  const dealId = event.queryStringParameters?.dealId || ""
  if (dealId) {
    const session = verifySession(event)
    if (session && session.companyId) {
      const isStaff = HOLMES_DOMAINS.some(d => (session.email || "").toLowerCase().endsWith("@" + d))
      if (!isStaff) {
        const dealCompanyId = await getDealCompanyId(dealId)
        if (dealCompanyId && String(dealCompanyId) !== String(session.companyId)) {
          return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: "Access denied." }) }
        }
      }
    }
  }

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
