// sharepoint-upload.js
//
// Uploads a file to SharePoint, into a per-deal folder named by the
// Application Reference (e.g. Holmes-Deals/HIA-38471/filename.pdf).
// Mirrors the shape of upload.js (HubSpot's file upload), but targets
// SharePoint via Microsoft Graph API instead.
//
// Frontend sends: multipart/form-data with fields:
//   file            - the file itself
//   applicationRef  - the deal's Application Reference (e.g. "HIA-38471")

const https = require("https")

const TENANT_ID = process.env.SHAREPOINT_TENANT_ID
const CLIENT_ID = process.env.SHAREPOINT_CLIENT_ID
const CLIENT_SECRET = process.env.SHAREPOINT_CLIENT_SECRET

// Resolved once via sharepoint-test.js — hardcoded here since it never changes
// for a given site (re-resolving it on every request would be wasteful).
const SITE_ID = "holmesedug.sharepoint.com,461a99da-664c-41d3-b2cb-d83784fbbfb1,9c112f1c-e736-4ff3-a906-f78f7cb25873"

const ROOT_FOLDER = "Holmes-Deals"
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB — Graph API's simple upload path supports up to 4MB in one shot reliably; see note below.
const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png"]

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
      res.on("end", () => {
        const raw = Buffer.concat(chunks)
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw.toString() || "{}") })
        } catch {
          resolve({ status: res.statusCode, body: raw })
        }
      })
    })
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}

async function getAccessToken() {
  const body =
    `client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&client_secret=${encodeURIComponent(CLIENT_SECRET)}` +
    `&scope=${encodeURIComponent("https://graph.microsoft.com/.default")}` +
    `&grant_type=client_credentials`

  const result = await makeRequest({
    hostname: "login.microsoftonline.com",
    path: `/${TENANT_ID}/oauth2/v2.0/token`,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
  }, body)

  if (result.status !== 200 || !result.body?.access_token) {
    throw new Error(`Failed to get access token: ${result.status}`)
  }
  return result.body.access_token
}

// Minimal multipart/form-data parser — extracts the file bytes, filename,
// and the applicationRef field from the incoming request body.
function parseMultipart(body, contentType) {
  const boundaryMatch = contentType.match(/boundary=(.+)$/)
  if (!boundaryMatch) throw new Error("No boundary in content-type")
  const boundary = "--" + boundaryMatch[1]
  const parts = body.toString("binary").split(boundary)

  let fileBuffer = null
  let fileName = ""
  let applicationRef = ""

  for (const part of parts) {
    if (part.includes('name="file"')) {
      const nameMatch = part.match(/filename="([^"]+)"/)
      if (nameMatch) fileName = nameMatch[1]
      const idx = part.indexOf("\r\n\r\n")
      if (idx !== -1) {
        const contentPart = part.slice(idx + 4, part.lastIndexOf("\r\n"))
        fileBuffer = Buffer.from(contentPart, "binary")
      }
    } else if (part.includes('name="applicationRef"')) {
      const idx = part.indexOf("\r\n\r\n")
      if (idx !== -1) {
        applicationRef = part.slice(idx + 4, part.lastIndexOf("\r\n")).trim()
      }
    }
  }

  return { fileBuffer, fileName, applicationRef }
}

exports.handler = async (event) => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" }

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "SharePoint not configured" }) }
  }

  try {
    const contentType = event.headers["content-type"] || event.headers["Content-Type"] || ""
    if (!contentType.includes("multipart/form-data")) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Expected multipart/form-data" }) }
    }

    const rawBody = event.isBase64Encoded ? Buffer.from(event.body, "base64") : Buffer.from(event.body, "binary")
    const { fileBuffer, fileName, applicationRef } = parseMultipart(rawBody, contentType)

    if (!fileBuffer || !fileName) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "No file found in request" }) }
    }
    if (!applicationRef) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Missing applicationRef" }) }
    }
    if (fileBuffer.length > MAX_FILE_SIZE) {
      return { statusCode: 413, headers: corsHeaders, body: JSON.stringify({ error: "File too large (max 20MB)" }) }
    }
    const ext = fileName.split(".").pop()?.toLowerCase() || ""
    if (!ALLOWED_EXT.includes(ext)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `File type .${ext} not allowed` }) }
    }

    // Sanitize applicationRef and filename for use in a URL path
    const safeRef = applicationRef.replace(/[^a-zA-Z0-9_-]/g, "")
    const safeFileName = fileName.replace(/[\\/:*?"<>|]/g, "_")

    const accessToken = await getAccessToken()

    // Upload via Graph API's simple PUT path (fine for files under ~4MB; larger
    // files should use an upload session — not needed yet at current file sizes).
    const uploadPath = `/v1.0/sites/${SITE_ID}/drive/root:/${ROOT_FOLDER}/${safeRef}/${encodeURIComponent(safeFileName)}:/content`
    const uploadResult = await makeRequest({
      hostname: "graph.microsoft.com",
      path: uploadPath,
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
        "Content-Length": fileBuffer.length,
      },
    }, fileBuffer)

    if (uploadResult.status !== 200 && uploadResult.status !== 201) {
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Upload to SharePoint failed", detail: uploadResult.body }),
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        fileName: safeFileName,
        applicationRef: safeRef,
        itemId: uploadResult.body.id,
        webUrl: uploadResult.body.webUrl,
      }),
    }
  } catch (err) {
    console.error("sharepoint-upload error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Server error", detail: err.message }) }
  }
}
