const https = require("https")
const jwt = require("jsonwebtoken")

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN
const CLOUDFILES_API_KEY = process.env.CLOUDFILES_API_KEY
const JWT_SECRET = process.env.JWT_SECRET
const HOLMES_DOMAINS = ["holmes.edu.au", "holmeseducation.group"]

function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = []
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }))
    })
    req.on("error", reject)
    req.end()
  })
}

function verifySession(event) {
  const token = event.queryStringParameters?.sessionToken || ""
  if (!token || !JWT_SECRET) return null
  try { return jwt.verify(token, JWT_SECRET) } catch { return null }
}

async function getDealCompanyId(dealId) {
  try {
    const res = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/crm/v4/objects/deals/${dealId}/associations/companies`,
      method: "GET",
      headers: { "Authorization": `Bearer ${HUBSPOT_TOKEN}` },
    })
    const data = JSON.parse(res.body.toString() || "{}")
    return data.results?.[0]?.toObjectId ? String(data.results[0].toObjectId) : null
  } catch { return null }
}

// Strip a trailing ".ext" from name if the extension is already appended
// elsewhere, and otherwise leave the CloudFiles-provided name as-is — it
// already comes through with the real extension attached (e.g.
// "Booking.com_ Confirmation.pdf").
function cleanName(name) {
  return name || "Document"
}

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }

  // ── 1. Verify session — fail closed, but return [] rather than error so the
  // frontend's best-effort merge pattern (see dealFiles.ts) still works cleanly.
  const session = verifySession(event)
  if (!session) {
    return { statusCode: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: "[]" }
  }

  const dealId = event.queryStringParameters?.dealId || ""
  if (!dealId) {
    return { statusCode: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: "[]" }
  }

  const isStaff = HOLMES_DOMAINS.some(d => (session.email || "").toLowerCase().endsWith("@" + d))

  // ── 2. Ownership check for agents (mirrors hubspot.js / download-file.js) ──
  if (!isStaff) {
    if (!session.companyId) {
      return { statusCode: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: "[]" }
    }
    const dealCompanyId = await getDealCompanyId(dealId)
    if (!dealCompanyId || String(dealCompanyId) !== String(session.companyId)) {
      return { statusCode: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: "[]" }
    }
  }

  // ── 3. Fetch CloudFiles attachments for this deal ──────────────────────────
  if (!CLOUDFILES_API_KEY) {
    return { statusCode: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: "[]" }
  }

  try {
    const result = await makeRequest({
      hostname: "api.cloudfiles.io",
      path: `/v1/attachments?objectId=${encodeURIComponent(dealId)}&objectType=DEAL`,
      method: "GET",
      headers: { "authorization": `Bearer ${CLOUDFILES_API_KEY}` },
    })

    if (result.status < 200 || result.status >= 300) {
      return { statusCode: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: "[]" }
    }

    const attachments = JSON.parse(result.body.toString() || "[]")

    // Only surface genuinely CloudFiles-native files here — attachments with
    // library === "hubspot" are native HubSpot files that CloudFiles is just
    // indexing, and those already show up via fetchFiles()/fetchDealAssociatedFiles()
    // to avoid duplicate entries in the portal's file list.
    const files = attachments
      .filter(a => a.resourceType === "file" && a.library !== "hubspot")
      .map(a => ({
        name: cleanName(a.name),
        id: String(a.resourceId),
        url: `/.netlify/functions/download-file?fileId=${encodeURIComponent(a.resourceId)}&dealId=${encodeURIComponent(dealId)}`,
        createdAt: a.createdAt ? new Date(a.createdAt).getTime() : Date.now(),
      }))

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(files),
    }
  } catch (err) {
    console.error("cloudfiles-files error:", err.message)
    return { statusCode: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: "[]" }
  }
}
