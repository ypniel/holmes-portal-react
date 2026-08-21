// sharepoint-test.js — TEMPORARY diagnostic function.
// Purpose: confirm the Azure app registration + Graph API permissions actually
// work, and resolve the SharePoint Site ID we'll need for real uploads/downloads.
// Delete this file once the real sharepoint-upload.js / sharepoint-download.js
// functions are built and confirmed working — it has no auth of its own and
// shouldn't stay live long-term.

const https = require("https")

const TENANT_ID = process.env.SHAREPOINT_TENANT_ID
const CLIENT_ID = process.env.SHAREPOINT_CLIENT_ID
const CLIENT_SECRET = process.env.SHAREPOINT_CLIENT_SECRET

// Your SharePoint site, derived from:
// https://holmesedug.sharepoint.com/sites/AgentPortal/...
const SITE_HOSTNAME = "holmesedug.sharepoint.com"
const SITE_PATH = "/sites/AgentPortal"

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(c))
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString()
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw || "{}") })
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

// Step 1: exchange Tenant ID + Client ID + Client Secret for an access token.
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

  return result
}

exports.handler = async () => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" }

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        step: "env-check",
        error: "Missing one or more SharePoint env vars",
        have: {
          SHAREPOINT_TENANT_ID: !!TENANT_ID,
          SHAREPOINT_CLIENT_ID: !!CLIENT_ID,
          SHAREPOINT_CLIENT_SECRET: !!CLIENT_SECRET,
        },
      }),
    }
  }

  try {
    // Step 1: get an access token
    const tokenResult = await getAccessToken()
    if (tokenResult.status !== 200 || !tokenResult.body?.access_token) {
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({
          step: "get-access-token",
          status: tokenResult.status,
          detail: tokenResult.body,
        }),
      }
    }
    const accessToken = tokenResult.body.access_token

    // Step 2: use the token to resolve the Site ID for our SharePoint site
    const siteResult = await makeRequest({
      hostname: "graph.microsoft.com",
      path: `/v1.0/sites/${SITE_HOSTNAME}:${SITE_PATH}`,
      method: "GET",
      headers: { "Authorization": `Bearer ${accessToken}` },
    })

    if (siteResult.status !== 200) {
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({
          step: "resolve-site-id",
          status: siteResult.status,
          detail: siteResult.body,
        }),
      }
    }

    // Success — return the Site ID we'll hardcode into the real functions next.
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        siteId: siteResult.body.id,
        siteName: siteResult.body.displayName,
        webUrl: siteResult.body.webUrl,
      }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ step: "unexpected-error", error: err.message }),
    }
  }
}
