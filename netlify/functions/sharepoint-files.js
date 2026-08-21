// sharepoint-files.js
//
// Two actions, chosen by the `action` query param:
//   ?action=list&applicationRef=HIA-38471
//     -> lists files in Holmes-Deals/HIA-38471/, returns name + itemId for each
//   ?action=download&applicationRef=HIA-38471&itemId=...
//     -> streams that specific file back to the browser
//
// Mirrors the shape of download-file.js (HubSpot's file serving), but reads
// from SharePoint via Microsoft Graph API instead.

const https = require("https")

const TENANT_ID = process.env.SHAREPOINT_TENANT_ID
const CLIENT_ID = process.env.SHAREPOINT_CLIENT_ID
const CLIENT_SECRET = process.env.SHAREPOINT_CLIENT_SECRET

const SITE_ID = "holmesedug.sharepoint.com,461a99da-664c-41d3-b2cb-d83784fbbfb1,9c112f1c-e736-4ff3-a906-f78f7cb25873"
const ROOT_FOLDER = "Holmes-Deals"

function makeRequest(options, followRedirects = false, depth = 0) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      if (followRedirects && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 5) {
        try {
          const redirectUrl = new URL(res.headers.location)
          resolve(makeRequest({
            hostname: redirectUrl.hostname,
            path: `${redirectUrl.pathname}${redirectUrl.search}`,
            method: "GET",
            headers: {},
          }, true, depth + 1))
          return
        } catch { /* fall through */ }
      }
      const chunks = []
      res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
      res.on("end", () => {
        const raw = Buffer.concat(chunks)
        resolve({ status: res.statusCode, headers: res.headers, body: raw })
      })
    })
    req.on("error", reject)
    req.end()
  })
}

async function getAccessToken() {
  const body =
    `client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&client_secret=${encodeURIComponent(CLIENT_SECRET)}` +
    `&scope=${encodeURIComponent("https://graph.microsoft.com/.default")}` +
    `&grant_type=client_credentials`

  const result = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "login.microsoftonline.com",
      path: `/${TENANT_ID}/oauth2/v2.0/token`,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(c))
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }) }
        catch { resolve({ status: res.statusCode, body: {} }) }
      })
    })
    req.on("error", reject)
    req.write(body)
    req.end()
  })

  if (result.status !== 200 || !result.body?.access_token) {
    throw new Error(`Failed to get access token: ${result.status}`)
  }
  return result.body.access_token
}

function getContentType(fileName) {
  const ext = fileName.split(".").pop()?.toLowerCase() || ""
  if (ext === "pdf") return "application/pdf"
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "png") return "image/png"
  return "application/octet-stream"
}

exports.handler = async (event) => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*" }

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    return { statusCode: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: "SharePoint not configured" }) }
  }

  const action = event.queryStringParameters?.action
  const applicationRef = event.queryStringParameters?.applicationRef
  const itemId = event.queryStringParameters?.itemId

  if (!applicationRef) {
    return { statusCode: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: "Missing applicationRef" }) }
  }
  const safeRef = applicationRef.replace(/[^a-zA-Z0-9_-]/g, "")

  try {
    const accessToken = await getAccessToken()

    if (action === "list") {
      const listResult = await makeRequest({
        hostname: "graph.microsoft.com",
        path: `/v1.0/sites/${SITE_ID}/drive/root:/${ROOT_FOLDER}/${safeRef}:/children`,
        method: "GET",
        headers: { "Authorization": `Bearer ${accessToken}` },
      })

      if (listResult.status === 404) {
        // Folder doesn't exist yet — not an error, just no files for this deal.
        return { statusCode: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ files: [] }) }
      }
      if (listResult.status !== 200) {
        return { statusCode: 502, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: "Failed to list files", detail: JSON.parse(listResult.body.toString()) }) }
      }

      const data = JSON.parse(listResult.body.toString())
      const files = (data.value || [])
        .filter((f) => f.file) // only actual files, not sub-folders
        .map((f) => ({
          id: f.id,
          name: f.name,
          size: f.size,
          createdAt: f.createdDateTime,
          url: `/.netlify/functions/sharepoint-files?action=download&applicationRef=${encodeURIComponent(safeRef)}&itemId=${encodeURIComponent(f.id)}`,
        }))

      return { statusCode: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ files }) }
    }

    if (action === "download") {
      if (!itemId) {
        return { statusCode: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: "Missing itemId" }) }
      }

      // Get the file's metadata (for name/type) and its download URL
      const metaResult = await makeRequest({
        hostname: "graph.microsoft.com",
        path: `/v1.0/sites/${SITE_ID}/drive/items/${encodeURIComponent(itemId)}`,
        method: "GET",
        headers: { "Authorization": `Bearer ${accessToken}` },
      })

      if (metaResult.status !== 200) {
        return { statusCode: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: "File not found" }) }
      }

      const meta = JSON.parse(metaResult.body.toString())
      const downloadUrl = meta["@microsoft.graph.downloadUrl"]
      if (!downloadUrl) {
        return { statusCode: 502, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: "No download URL available" }) }
      }

      // The downloadUrl is a pre-authenticated, signed URL — fetch it directly,
      // no Authorization header needed (and none should be sent).
      const parsedUrl = new URL(downloadUrl)
      const fileResult = await makeRequest({
        hostname: parsedUrl.hostname,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: "GET",
        headers: {},
      }, true)

      if (fileResult.status !== 200) {
        return { statusCode: 502, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: "Failed to fetch file bytes" }) }
      }

      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": getContentType(meta.name),
          "Content-Disposition": `inline; filename="${meta.name.replace(/["\r\n]/g, "")}"`,
          "Cache-Control": "private, no-store",
        },
        body: fileResult.body.toString("base64"),
        isBase64Encoded: true,
      }
    }

    return { statusCode: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: "Unknown action — use 'list' or 'download'" }) }
  } catch (err) {
    console.error("sharepoint-files error:", err.message)
    return { statusCode: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ error: "Server error", detail: err.message }) }
  }
}
