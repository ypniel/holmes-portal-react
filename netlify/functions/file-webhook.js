// file-webhook.js
// HubSpot webhook — fires when a note/file is associated to a deal (staff
// attaching a file in HubSpot). For each newly-attached file it makes a CLEAN,
// non-sensitive COPY in /portal-uploads so the agent portal can serve it.
//
// Copy (not move): we download the bytes and re-upload as a fresh
// PUBLIC_NOT_INDEXABLE file. The staff-side attachment on the deal is left
// untouched. Requires the source file to be non-sensitive (readable).
//
// Idempotent: files already in /portal-uploads are skipped, and copies are
// name-tagged so re-fired webhooks don't duplicate.
//
// Subscribe this in HubSpot → Settings → Integrations → Private Apps → Webhooks
// to deal association-change / note-creation events (same style as email-webhook.js).

const https = require("https")

const TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN
const PIPELINE_ID = "789344406"
const TARGET_FOLDER = "/portal-uploads"
const COPY_TAG = "__pcopy"   // marker embedded in copied filenames for idempotency

// ── JSON helper (matches email-webhook.js) ──────────────────────────────────
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

// ── Raw byte fetch, follows redirects, no auth on CDN hops ───────────────────
function fetchBytes(options, followRedirects = true, depth = 0) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      if (followRedirects && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 5) {
        try {
          const u = new URL(res.headers.location, `https://${options.hostname}`)
          const isApi = u.hostname === "api.hubapi.com" || u.hostname.endsWith(".hubapi.com") || /^api(-[a-z0-9]+)?\.hubspot\.com$/.test(u.hostname)
          resolve(fetchBytes({
            hostname: u.hostname,
            path: `${u.pathname}${u.search}`,
            method: "GET",
            headers: isApi ? { "Authorization": `Bearer ${TOKEN}` } : {},
          }, true, depth + 1))
          return
        } catch (e) { /* fall through */ }
      }
      const chunks = []
      res.on("data", c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on("error", reject)
    req.end()
  })
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Collect fileIds attached to a deal (mirrors download-file.js step 4) ─────
async function collectFileIds(dealId) {
  const ids = new Set()
  const eng = await hs(`/engagements/v1/engagements/associated/deal/${dealId}/paged?limit=200`)
  for (const e of eng.body?.results || []) {
    for (const att of e.attachments || []) { if (att.id) ids.add(String(att.id)) }
    const body = e.engagement?.bodyPreview || ""
    for (const m of body.matchAll(/fileId=(\d+)/g)) ids.add(m[1])
    for (const m of e.metadata?.attachments || []) { if (m.id) ids.add(String(m.id)) }
  }
  return [...ids]
}

function mimeFromExtension(ext) {
  ext = String(ext || "").toLowerCase()
  if (ext === "pdf") return "application/pdf"
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "png") return "image/png"
  if (ext === "gif") return "image/gif"
  if (ext === "webp") return "image/webp"
  return "application/octet-stream"
}

// ── Copy one file into /portal-uploads as PUBLIC_NOT_INDEXABLE ───────────────
async function copyFileToPortalUploads(fileId) {
  // 1. Metadata
  const meta = await hs(`/files/v3/files/${fileId}`)
  if (meta.status < 200 || meta.status >= 300) {
    console.log(`file-webhook: ${fileId} meta status=${meta.status}, skip`)
    return "meta_fail"
  }
  const m = meta.body || {}
  const name = m.name || "document"
  const ext = m.extension || ""

  // Idempotency: already in target folder, or already a copy
  if (String(m.path || "").startsWith(TARGET_FOLDER)) return "already_in_folder"
  if (name.includes(COPY_TAG)) return "already_copy"

  // 2. Get a signed URL (works for non-sensitive files); fallback to meta.url
  let downloadUrl = ""
  const signed = await hs(`/files/v3/files/${fileId}/signed-url`)
  if (signed.status >= 200 && signed.status < 300) {
    try { downloadUrl = JSON.parse(JSON.stringify(signed.body)).url || "" } catch {}
  }
  if (signed.status === 403) {
    console.log(`file-webhook: ${fileId} signed-url 403 (SENSITIVE) — cannot copy`)
    return "sensitive"
  }
  if (!downloadUrl) downloadUrl = m.url || m.defaultHostingUrl || m.default_hosting_url || ""
  if (!downloadUrl) return "no_url"

  // 3. Fetch bytes
  const u = new URL(downloadUrl)
  const isApi = u.hostname === "api.hubapi.com" || u.hostname.endsWith(".hubapi.com") || /^api(-[a-z0-9]+)?\.hubspot\.com$/.test(u.hostname)
  const fileRes = await fetchBytes({
    hostname: u.hostname,
    path: `${u.pathname}${u.search}`,
    method: "GET",
    headers: isApi ? { "Authorization": `Bearer ${TOKEN}` } : {},
  })
  if (fileRes.status < 200 || fileRes.status >= 300) {
    console.log(`file-webhook: ${fileId} byte fetch status=${fileRes.status}`)
    return "fetch_fail"
  }
  const bytes = fileRes.body

  // 4. Re-upload into /portal-uploads (multipart) — mark the name with COPY_TAG
  const dotExt = ext ? `.${ext}` : ""
  const baseName = name.toLowerCase().endsWith(dotExt.toLowerCase()) ? name.slice(0, name.length - dotExt.length) : name
  const copyName = `${baseName}${COPY_TAG}${dotExt}`
  const contentType = m.mimeType || mimeFromExtension(ext)

  const boundary = `----FormBoundary${Date.now()}`
  const CRLF = "\r\n"
  const preamble = Buffer.from(
    `--${boundary}${CRLF}Content-Disposition: form-data; name="folderPath"${CRLF}${CRLF}${TARGET_FOLDER}${CRLF}` +
    `--${boundary}${CRLF}Content-Disposition: form-data; name="options"${CRLF}Content-Type: application/json${CRLF}${CRLF}{"access":"PUBLIC_NOT_INDEXABLE","overwrite":false,"duplicateValidationStrategy":"NONE"}${CRLF}` +
    `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${copyName}"${CRLF}Content-Type: ${contentType}${CRLF}${CRLF}`
  )
  const epilogue = Buffer.from(`${CRLF}--${boundary}--${CRLF}`)
  const multipart = Buffer.concat([preamble, bytes, epilogue])

  const up = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.hubapi.com",
      path: "/filemanager/api/v3/files/upload",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": multipart.length,
      },
    }, (res) => {
      const chunks = []
      res.on("data", c => chunks.push(c))
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }))
    })
    req.on("error", reject)
    req.write(multipart)
    req.end()
  })

  if (up.status !== 200 && up.status !== 201) {
    console.log(`file-webhook: ${fileId} re-upload status=${up.status} body=${up.body.slice(0, 200)}`)
    return "upload_fail"
  }
  console.log(`file-webhook: ${fileId} copied -> ${TARGET_FOLDER}/${copyName}`)
  return "copied"
}

exports.handler = async (event) => {
  try {
    const events = JSON.parse(event.body || "[]")
    console.log("file-webhook received:", JSON.stringify(events).substring(0, 400))

    // Collect deal IDs touched by this batch (association-change events).
    const dealIds = new Set()
    for (const e of events) {
      if (e.associationType === "DEAL_TO_NOTE" || e.associationType === "NOTE_TO_DEAL" ||
          e.associationType === "DEAL_TO_EMAIL" || e.associationType === "EMAIL_TO_DEAL") {
        // pick whichever side is the deal
        const a = String(e.fromObjectId || "")
        const b = String(e.toObjectId || "")
        // We can't always tell here which is the deal; resolve per-deal below by
        // trying both as deals (non-deal IDs simply return no engagements).
        dealIds.add(a); dealIds.add(b)
      } else if (e.objectId) {
        dealIds.add(String(e.objectId))
      }
    }

    for (const dealId of dealIds) {
      // Only act on Australia-pipeline deals; non-deal IDs return no/blank pipeline.
      const dealRes = await hs(`/crm/v3/objects/deals/${dealId}?properties=pipeline`)
      if (dealRes.status !== 200) continue
      if (dealRes.body?.properties?.pipeline !== PIPELINE_ID) continue

      const fileIds = await collectFileIds(dealId)
      let copied = 0, skipped = 0, sensitive = 0, errors = 0
      for (const fileId of fileIds) {
        const outcome = await copyFileToPortalUploads(fileId)
        if (outcome === "copied") copied++
        else if (outcome === "sensitive") sensitive++
        else if (outcome === "already_in_folder" || outcome === "already_copy") skipped++
        else errors++
        if ((copied + errors) % 8 === 0) await sleep(300)  // gentle on rate limits
      }
      console.log(`file-webhook deal ${dealId}: copied=${copied} skipped=${skipped} sensitive=${sensitive} errors=${errors}`)
    }

    return { statusCode: 200, body: "ok" }
  } catch (err) {
    console.error("file-webhook error:", err.message)
    return { statusCode: 200, body: "ok" }  // ack so HubSpot doesn't retry-storm
  }
}
