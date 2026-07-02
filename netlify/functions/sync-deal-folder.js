// sync-deal-folder.js
// Per-deal file sweep. Finds every file attached to a deal and moves any that
// aren't already in /portal-uploads into it.
//
// Idempotent: safe to call on every deal open. Files already in the target
// folder are skipped, so after the first pass it does almost nothing.
//
// Files that are still classified "sensitive" will 403 the move (PATCH is a
// write). Those are logged and skipped — they need the account-side "sensitive"
// setting turned off before they can be moved. The sweep never crashes on them.
//
// Call:  GET /.netlify/functions/sync-deal-folder?dealId=123&sessionToken=...
//   or:  GET /.netlify/functions/sync-deal-folder?dealId=123   (with ADMIN_SECRET key)
// Fire-and-forget from the portal when a deal page loads.

const https = require("https")
const jwt = require("jsonwebtoken")

const TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN
const JWT_SECRET = process.env.JWT_SECRET
const ADMIN_SECRET = process.env.ADMIN_SECRET
const HOLMES_DOMAINS = ["holmes.edu.au", "holmeseducation.group"]
const TARGET_FOLDER = "/portal-uploads"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
}

function hs(path, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : ""
    const req = https.request({
      hostname: "api.hubapi.com",
      path, method,
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      const chunks = []
      res.on("data", c => chunks.push(c))
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString() || "{}") }) }
        catch { resolve({ status: res.statusCode, body: {} }) }
      })
    })
    req.on("error", reject)
    if (data) req.write(data)
    req.end()
  })
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── 1. Collect every fileId attached to a deal ──────────────────────────────
// Mirrors download-file.js step 4: hidden files can't be listed, only found via
// the engagements attached to the record.
async function collectFileIds(dealId) {
  const ids = new Set()
  const engResult = await hs(`/engagements/v1/engagements/associated/deal/${dealId}/paged?limit=200`)
  for (const eng of engResult.body?.results || []) {
    for (const att of eng.attachments || []) {
      if (att.id) ids.add(String(att.id))
    }
    const body = eng.engagement?.bodyPreview || ""
    for (const match of body.matchAll(/fileId=(\d+)/g)) {
      ids.add(match[1])
    }
    for (const m of eng.metadata?.attachments || []) {
      if (m.id) ids.add(String(m.id))
    }
  }
  return [...ids]
}

// ── 2. Ensure the target folder exists and return its id ────────────────────
async function getTargetFolderId() {
  // Look it up first
  const found = await hs(
    `/files/v3/folders/search?path=${encodeURIComponent(TARGET_FOLDER)}`
  )
  const existing = found.body?.results?.[0]?.id || found.body?.id
  if (existing) return String(existing)

  // Create it if missing (idempotent-ish: if it now exists, HubSpot returns it)
  const created = await hs("/files/v3/folders", "POST", {
    name: TARGET_FOLDER.replace(/^\//, ""),
  })
  return created.body?.id ? String(created.body.id) : null
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }

  const dealId = event.queryStringParameters?.dealId
  if (!dealId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Missing dealId" }) }

  // ── Auth: accept either a valid session token or the admin key ────────────
  const authHeader = event.headers?.authorization || event.headers?.Authorization || ""
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim()
  const sessionToken = event.queryStringParameters?.sessionToken || bearer
  const adminKey = event.queryStringParameters?.key

  let session = null
  if (sessionToken && JWT_SECRET) {
    try { session = jwt.verify(sessionToken, JWT_SECRET) } catch { session = null }
  }
  const adminOk = ADMIN_SECRET && adminKey === ADMIN_SECRET
  if (!session && !adminOk) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Unauthorised" }) }
  }

  // ── Ownership check (skip for staff / admin) ──────────────────────────────
  const isStaff = session && HOLMES_DOMAINS.some(d => (session.email || "").toLowerCase().endsWith("@" + d))
  if (session && !isStaff && session.companyId) {
    const assoc = await hs(`/crm/v4/objects/deals/${dealId}/associations/companies`)
    const dealCompanyId = assoc.body?.results?.[0]?.toObjectId
    if (!dealCompanyId || String(dealCompanyId) !== String(session.companyId)) {
      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: "Access denied." }) }
    }
  }

  try {
    const targetFolderId = await getTargetFolderId()
    if (!targetFolderId) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Could not resolve target folder" }) }
    }

    const fileIds = await collectFileIds(dealId)
    const result = { dealId, targetFolder: TARGET_FOLDER, found: fileIds.length, moved: 0, skipped: 0, sensitive: 0, errors: 0 }

    for (const fileId of fileIds) {
      // Read current location
      const meta = await hs(`/files/v3/files/${fileId}`)
      if (meta.status < 200 || meta.status >= 300) { result.errors++; continue }

      const currentParent = String(meta.body?.parentFolderId || "")
      if (currentParent === targetFolderId) { result.skipped++; continue }  // already home

      // Move it: PATCH parentFolderId. Sensitive files 403 here.
      const patch = await hs(`/files/v3/files/${fileId}`, "PATCH", { parentFolderId: targetFolderId })
      if (patch.status >= 200 && patch.status < 300) {
        result.moved++
      } else if (patch.status === 403) {
        result.sensitive++
        console.log(`sync-deal-folder ${dealId}: file ${fileId} is sensitive — cannot move (needs admin flip)`)
      } else {
        result.errors++
        console.log(`sync-deal-folder ${dealId}: file ${fileId} move failed status=${patch.status}`)
      }

      if ((result.moved + result.errors) % 10 === 0) await sleep(300)  // gentle on rate limits
    }

    console.log(`sync-deal-folder ${dealId} complete:`, JSON.stringify(result))
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, ...result }) }
  } catch (err) {
    console.error("sync-deal-folder error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}
