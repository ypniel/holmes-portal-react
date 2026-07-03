// HubSpot native webhook — subscribed to Deal "Association Changed" events.
// When an email (or other activity) is associated to a deal, HubSpot POSTs:
//   [{ objectId: <dealId>, subscriptionType: "object.associationChange", ... }]
//
// We start from the deal, look at its latest email, and set response_status:
//   Latest email has "Comment by Agent" marker → portal/agent → Holmes_Received
//   Otherwise → Holmes staff reply → Waiting_on_Agent

const https = require("https")

const TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN
const PIPELINE_ID = "789344406"

// ── File-copy config (added: auto-copy deal attachments into /portal-uploads) ──
const TARGET_FOLDER = "/portal-uploads"
const COPY_TAG = "__pcopy"
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@holmeseducation.group"
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || "Holmes Admissions"
const PORTAL_URL = "https://aportal.holmes.edu.au"

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

function sendgrid(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = https.request({
      hostname: "api.sendgrid.com",
      path: "/v3/mail/send",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    }, (res) => {
      let chunks = ""
      res.on("data", c => chunks += c)
      res.on("end", () => resolve({ status: res.statusCode, body: chunks }))
    })
    req.on("error", reject)
    req.write(data)
    req.end()
  })
}

// Notify the agent that Holmes has replied, via a no-reply email (no message content)
async function notifyAgent(dealId) {
  try {
    if (!SENDGRID_API_KEY) { console.log("notifyAgent: no SendGrid key"); return }

    // Find the agent contact on the deal
    const assoc = await hs(`/crm/v4/objects/deals/${dealId}/associations/contacts`)
    const contactId = assoc.body?.results?.[0]?.toObjectId
    if (!contactId) { console.log(`notifyAgent: no contact on deal ${dealId}`); return }

    const contactRes = await hs(`/crm/v3/objects/contacts/${contactId}?properties=email,firstname`)
    const agentEmail = contactRes.body?.properties?.email
    const agentName = contactRes.body?.properties?.firstname || "there"
    if (!agentEmail) { console.log(`notifyAgent: no email for contact ${contactId}`); return }

    // Fetch the deal name and application reference to include in the notification
    const dealInfo = await hs(`/crm/v3/objects/deals/${dealId}?properties=dealname,portal_application_reference`)
    const dealName = dealInfo.body?.properties?.dealname || ""
    const appRef = dealInfo.body?.properties?.portal_application_reference || dealId

    const link = `${PORTAL_URL}/applications/${dealId}`
    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #333; max-width: 480px;">
        <p>Hi ${agentName},</p>
        <p>You have a new message from Holmes Admissions regarding the following application:</p>
        <table style="border-collapse: collapse; font-size: 13px; color: #444; margin: 12px 0;">
          <tr>
            <td style="padding: 3px 12px 3px 0; color: #888;">Application Reference</td>
            <td style="padding: 3px 0; font-weight: 700; color: #991b1b;">${appRef}</td>
          </tr>
          <tr>
            <td style="padding: 3px 12px 3px 0; color: #888;">Application</td>
            <td style="padding: 3px 0;">${dealName}</td>
          </tr>
        </table>
        <p style="margin: 20px 0;">
          <a href="${link}" style="display: inline-block; padding: 10px 24px; background: #991b1b; color: #ffffff; font-weight: 700; text-decoration: none; border-radius: 4px;">View message in the portal →</a>
        </p>
        <p style="font-size: 12px; color: #888;">Please do not reply to this email. All correspondence must be made via the Admissions Portal.</p>
      </div>`

    const res = await sendgrid({
      personalizations: [{ to: [{ email: agentEmail }] }],
      from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
      reply_to: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
      subject: `New message in the Holmes Admissions Portal — ${appRef}`,
      content: [{ type: "text/html", value: html }],
    })
    console.log(`notifyAgent: emailed ${agentEmail} for deal ${dealId}, status ${res.status}`)
  } catch (err) {
    console.error(`notifyAgent error for deal ${dealId}:`, err.message)
  }
}

// ── FILE COPY HELPERS ────────────────────────────────────────────────────────
// Auto-copy files attached to a deal into /portal-uploads as clean,
// non-sensitive (PUBLIC_NOT_INDEXABLE) duplicates so the agent portal can serve
// them. Copy (not move) — staff attachments are left untouched. Requires source
// files to be non-sensitive. Idempotent via folder check + name tag.

function isHubSpotApiHost(hostname) {
  const h = String(hostname || "").toLowerCase()
  return h === "api.hubapi.com" || h.endsWith(".hubapi.com") || /^api(-[a-z0-9]+)?\.hubspot\.com$/.test(h)
}

function fetchBytes(options, followRedirects = true, depth = 0) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      if (followRedirects && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 5) {
        try {
          const u = new URL(res.headers.location, `https://${options.hostname}`)
          resolve(fetchBytes({
            hostname: u.hostname,
            path: `${u.pathname}${u.search}`,
            method: "GET",
            headers: isHubSpotApiHost(u.hostname) ? { "Authorization": `Bearer ${TOKEN}` } : {},
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

function mimeFromExtension(ext) {
  ext = String(ext || "").toLowerCase()
  if (ext === "pdf") return "application/pdf"
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "png") return "image/png"
  if (ext === "gif") return "image/gif"
  if (ext === "webp") return "image/webp"
  return "application/octet-stream"
}

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

// Read a note's attachments DIRECTLY by note ID (no dependence on the lagging
// engagements-associated-to-deal list). hs_attachment_ids is a semicolon-
// separated list of file IDs on the note. This is what makes newly-attached
// files visible immediately.
async function fileIdsFromNote(noteId) {
  const res = await hs(`/crm/v3/objects/notes/${noteId}?properties=hs_attachment_ids`)
  const raw = res.body?.properties?.hs_attachment_ids || ""
  return String(raw).split(";").map(s => s.trim()).filter(Boolean)
}

// Read an EMAIL object's attachments directly. Files attached to a logged email
// live in hs_attachment_ids on the email object (objectTypeId 0-49), NOT a note.
async function fileIdsFromEmail(emailId) {
  const res = await hs(`/crm/v3/objects/emails/${emailId}?properties=hs_attachment_ids`)
  const raw = res.body?.properties?.hs_attachment_ids || ""
  return String(raw).split(";").map(s => s.trim()).filter(Boolean)
}

async function copyFileToPortalUploads(fileId) {
  const meta = await hs(`/files/v3/files/${fileId}`)
  if (meta.status < 200 || meta.status >= 300) return "meta_fail"
  const m = meta.body || {}
  const name = m.name || "document"
  const ext = m.extension || ""

  if (String(m.path || "").startsWith(TARGET_FOLDER)) return "already_in_folder"
  if (name.includes(COPY_TAG)) return "already_copy"

  let downloadUrl = ""
  const signed = await hs(`/files/v3/files/${fileId}/signed-url`)
  if (signed.status >= 200 && signed.status < 300) {
    try { downloadUrl = (signed.body && signed.body.url) || "" } catch {}
  }
  if (signed.status === 403) return "sensitive"
  if (!downloadUrl) downloadUrl = m.url || m.defaultHostingUrl || m.default_hosting_url || ""
  if (!downloadUrl) return "no_url"

  const u = new URL(downloadUrl)
  const fileRes = await fetchBytes({
    hostname: u.hostname,
    path: `${u.pathname}${u.search}`,
    method: "GET",
    headers: isHubSpotApiHost(u.hostname) ? { "Authorization": `Bearer ${TOKEN}` } : {},
  })
  if (fileRes.status < 200 || fileRes.status >= 300) return "fetch_fail"
  const bytes = fileRes.body

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

  if (up.status !== 200 && up.status !== 201) return "upload_fail"
  return "copied"
}

// Copy all currently-attached files for a deal into /portal-uploads.
async function syncDealFiles(dealId) {
  const fileIds = await collectFileIds(dealId)
  const r = { found: fileIds.length, copied: 0, skipped: 0, sensitive: 0, errors: 0 }
  for (const fileId of fileIds) {
    const outcome = await copyFileToPortalUploads(fileId)
    if (outcome === "copied") r.copied++
    else if (outcome === "sensitive") { r.sensitive++; console.log(`file-copy ${dealId}: file ${fileId} SENSITIVE — cannot copy`) }
    else if (outcome === "already_in_folder" || outcome === "already_copy") r.skipped++
    else { r.errors++; console.log(`file-copy ${dealId}: file ${fileId} outcome=${outcome}`) }
  }
  console.log(`file-copy ${dealId} complete:`, JSON.stringify(r))
  return r
}

exports.handler = async (event) => {
  try {
    const events = JSON.parse(event.body || "[]")
    console.log("email-webhook received:", JSON.stringify(events).substring(0, 400))

    // Extract (dealId, emailId) pairs from association events.
    //   EMAIL_TO_DEAL: fromObjectId=email, toObjectId=deal
    //   DEAL_TO_EMAIL: fromObjectId=deal,  toObjectId=email
    // We read the SPECIFIC triggering email (not "latest"), because the legacy
    // deal→emails list lags and returns stale results right after an email is sent.
    const pairs = []
    for (const e of events) {
      if (e.associationType === "EMAIL_TO_DEAL") {
        pairs.push({ dealId: String(e.toObjectId), emailId: String(e.fromObjectId) })
      } else if (e.associationType === "DEAL_TO_EMAIL") {
        pairs.push({ dealId: String(e.fromObjectId), emailId: String(e.toObjectId) })
      }
    }
    // De-dupe by emailId
    const seen = new Set()
    const uniquePairs = pairs.filter(p => {
      if (seen.has(p.emailId)) return false
      seen.add(p.emailId)
      return true
    })

    for (const { dealId, emailId } of uniquePairs) {
      // Confirm Australia pipeline
      const dealRes = await hs(`/crm/v3/objects/deals/${dealId}?properties=pipeline,response_status`)
      const pipeline = dealRes.body?.properties?.pipeline
      if (pipeline !== PIPELINE_ID) { console.log(`deal ${dealId}: pipeline=${pipeline}, skip`); continue }

      // Read the SPECIFIC triggering email via v3 emails object API (objectTypeId 0-49)
      const emailRes = await hs(`/crm/v3/objects/emails/${emailId}?properties=hs_email_text,hs_email_html,hs_email_subject,hs_email_direction`)
      const p = emailRes.body?.properties || {}
      let bodyText = (p.hs_email_text || "") + (p.hs_email_html || "") + (p.hs_email_subject || "")

      // Fallback: if v3 props are empty, try the legacy engagement body
      if (!bodyText.trim()) {
        const legacy = await hs(`/engagements/v1/engagements/${emailId}`)
        bodyText = (legacy.body?.engagement?.bodyPreview || "") +
                   (legacy.body?.metadata?.html || "") +
                   (legacy.body?.metadata?.body || "")
      }

      const isPortal = bodyText.includes("Comment by Agent")
      console.log(`deal ${dealId}: email ${emailId} isPortal=${isPortal} dir=${p.hs_email_direction} preview="${bodyText.substring(0,60)}"`)

      const newStatus = isPortal ? "Holmes_Received" : "Waiting_on_Agent"

      if (dealRes.body.properties.response_status !== newStatus) {
        await hs(`/crm/v3/objects/deals/${dealId}`, "PATCH", {
          properties: { response_status: newStatus },
        })
        console.log(`deal ${dealId} → ${newStatus} (isPortal=${isPortal})`)
      } else {
        console.log(`deal ${dealId}: already ${newStatus}`)
      }

      // Notify the agent on every Holmes staff reply (email without the portal marker)
      if (!isPortal) {
        await notifyAgent(dealId)
      }
    }

    // ── FILE-COPY PASS ────────────────────────────────────────────────────────
    // The same association events fire when a note/file is attached to a deal.
    // The event gives us the NOTE id (fromObjectTypeId "0-46") and the DEAL id
    // ("0-3"). We read the note's attachments DIRECTLY (immediate, no lag) and
    // copy them into /portal-uploads. Isolated try — can never break the email
    // flow above. Idempotent, so re-fires are harmless.
    try {
      // Build note→deal AND email→deal pairs from association events.
      // Notes are objectTypeId 0-46; Emails are 0-49. Both can carry attachments
      // in hs_attachment_ids. Deals are 0-3.
      const notePairs = []
      const emailPairs = []
      const bareDealIds = new Set()
      for (const e of events) {
        const fromType = String(e.fromObjectTypeId)
        const toType   = String(e.toObjectTypeId)
        const fromIsNote = fromType === "0-46", toIsNote = toType === "0-46"
        const fromIsEmail = fromType === "0-49", toIsEmail = toType === "0-49"
        const fromIsDeal = fromType === "0-3", toIsDeal = toType === "0-3"

        if (fromIsNote && toIsDeal) notePairs.push({ noteId: String(e.fromObjectId), dealId: String(e.toObjectId) })
        else if (toIsNote && fromIsDeal) notePairs.push({ noteId: String(e.toObjectId), dealId: String(e.fromObjectId) })
        else if (fromIsEmail && toIsDeal) emailPairs.push({ emailId: String(e.fromObjectId), dealId: String(e.toObjectId) })
        else if (toIsEmail && fromIsDeal) emailPairs.push({ emailId: String(e.toObjectId), dealId: String(e.fromObjectId) })
        else {
          for (const cand of [e.objectId, e.fromObjectId, e.toObjectId]) {
            if (cand) bareDealIds.add(String(cand))
          }
        }
      }

      // Helper: copy a list of fileIds, log a summary
      const copyList = async (label, id, dealId, fileIds) => {
        if (fileIds.length === 0) { console.log(`file-copy ${label} ${id} (deal ${dealId}): no attachments`); return }
        const r = { [label]: id, deal: dealId, found: fileIds.length, copied: 0, skipped: 0, sensitive: 0, errors: 0 }
        for (const fileId of fileIds) {
          const outcome = await copyFileToPortalUploads(fileId)
          if (outcome === "copied") r.copied++
          else if (outcome === "sensitive") { r.sensitive++; console.log(`file-copy: file ${fileId} SENSITIVE — cannot copy`) }
          else if (outcome === "already_in_folder" || outcome === "already_copy") r.skipped++
          else { r.errors++; console.log(`file-copy: file ${fileId} outcome=${outcome}`) }
        }
        console.log(`file-copy ${label} ${id} complete:`, JSON.stringify(r))
      }

      // Notes
      const seenNotes = new Set()
      for (const { noteId, dealId } of notePairs) {
        if (seenNotes.has(noteId)) continue
        seenNotes.add(noteId)
        const dRes = await hs(`/crm/v3/objects/deals/${dealId}?properties=pipeline`)
        if (dRes.status !== 200 || dRes.body?.properties?.pipeline !== PIPELINE_ID) continue
        await copyList("note", noteId, dealId, await fileIdsFromNote(noteId))
      }

      // Emails (logged emails with attachments)
      const seenEmails = new Set()
      for (const { emailId, dealId } of emailPairs) {
        if (seenEmails.has(emailId)) continue
        seenEmails.add(emailId)
        const dRes = await hs(`/crm/v3/objects/deals/${dealId}?properties=pipeline`)
        if (dRes.status !== 200 || dRes.body?.properties?.pipeline !== PIPELINE_ID) continue
        await copyList("email", emailId, dealId, await fileIdsFromEmail(emailId))
      }

      // Fallback: any bare deal IDs get the whole-deal scan (backfill-style).
      for (const dealId of bareDealIds) {
        const dRes = await hs(`/crm/v3/objects/deals/${dealId}?properties=pipeline`)
        if (dRes.status !== 200 || dRes.body?.properties?.pipeline !== PIPELINE_ID) continue
        await syncDealFiles(dealId)
      }
    } catch (fileErr) {
      console.error("email-webhook file-copy pass error:", fileErr.message)
    }

    return { statusCode: 200, body: "ok" }
  } catch (err) {
    console.error("email-webhook error:", err.message)
    return { statusCode: 200, body: "ok" }
  }
}
