const https = require("https")
const jwt = require("jsonwebtoken")

const HUBSPOT_FILE_TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN
const JWT_SECRET = process.env.JWT_SECRET
const HOLMES_DOMAINS = ["holmes.edu.au", "holmeseducation.group"]

function makeRequest(options, followRedirects = false, depth = 0) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      if (
        followRedirects &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location &&
        depth < 5
      ) {
        try {
          const redirectUrl = new URL(res.headers.location, `https://${options.hostname}`)
          resolve(
            makeRequest(
              {
                hostname: redirectUrl.hostname,
                path: `${redirectUrl.pathname}${redirectUrl.search}`,
                method: "GET",
                headers: {},
              },
              true,
              depth + 1
            )
          )
          return
        } catch {
          // Fall through and return response body.
        }
      }

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
  return meta.mimeType || fileResult.headers["content-type"] || "application/octet-stream"
}

function extractFileIdsFromEngagement(eng) {
  const ids = new Set()
  const type = eng.engagement?.type
  const body = String(eng.metadata?.body || eng.engagement?.bodyPreview || "")

  // Normal notes/comments are never file records.
  // Portal-upload notes are the only NOTE records allowed to prove file ownership.
  if (type === "NOTE") {
    const isPortalUploadNote = body.includes("[FID:") || body.includes("[PORTAL_UPLOAD]")
    if (!isPortalUploadNote) return []
  }

  for (const att of eng.attachments || []) {
    if (att?.id) ids.add(String(att.id))
    if (att?.fileId) ids.add(String(att.fileId))
  }

  for (const att of eng.metadata?.attachments || []) {
    if (att?.id) ids.add(String(att.id))
    if (att?.fileId) ids.add(String(att.fileId))
  }

  const attachmentFields = [
    eng.metadata?.hs_attachment_ids,
    eng.metadata?.attachmentIds,
    eng.metadata?.hs_email_attachment_ids,
  ]

  for (const field of attachmentFields) {
    if (!field) continue
    for (const id of String(field).split(/[;,]/)) {
      const clean = id.trim()
      if (/^\d+$/.test(clean)) ids.add(clean)
    }
  }

  const possibleBodies = [
    eng.engagement?.bodyPreview,
    eng.metadata?.body,
    eng.metadata?.html,
    eng.metadata?.text,
  ]

  for (const possibleBody of possibleBodies) {
    if (!possibleBody) continue
    const text = String(possibleBody)
    for (const match of text.matchAll(/\[FID:(\d+)\]/g)) ids.add(match[1])
    for (const match of text.matchAll(/fileId=(\d+)/g)) ids.add(match[1])
  }

  return Array.from(ids)
}

async function getCrmEmailAttachmentIds(emailId) {
  if (!emailId) return []

  const emailResult = await makeRequest({
    hostname: "api.hubapi.com",
    path: `/crm/v3/objects/emails/${emailId}?properties=hs_attachment_ids,hs_email_attachment_ids`,
    method: "GET",
    headers: { Authorization: `Bearer ${HUBSPOT_FILE_TOKEN}` },
  })

  if (emailResult.status < 200 || emailResult.status >= 300) return []

  try {
    const emailBody = JSON.parse(emailResult.body.toString() || "{}")
    const ids = new Set()
    const fields = [
      emailBody.properties?.hs_attachment_ids,
      emailBody.properties?.hs_email_attachment_ids,
    ]

    for (const field of fields) {
      if (!field) continue
      for (const id of String(field).split(/[;,]/)) {
        const clean = id.trim()
        if (/^\d+$/.test(clean)) ids.add(clean)
      }
    }

    return Array.from(ids)
  } catch {
    return []
  }
}

async function getDealCompanyId(dealId) {
  const assocResult = await makeRequest({
    hostname: "api.hubapi.com",
    path: `/crm/v4/objects/deals/${dealId}/associations/companies`,
    method: "GET",
    headers: { Authorization: `Bearer ${HUBSPOT_FILE_TOKEN}` },
  })

  try {
    const assocBody = JSON.parse(assocResult.body.toString() || "{}")
    return assocBody.results?.[0]?.toObjectId ? String(assocBody.results[0].toObjectId) : ""
  } catch {
    return ""
  }
}

async function dealHasContact(dealId, contactId) {
  if (!contactId) return false

  const assocResult = await makeRequest({
    hostname: "api.hubapi.com",
    path: `/crm/v4/objects/deals/${dealId}/associations/contacts`,
    method: "GET",
    headers: { Authorization: `Bearer ${HUBSPOT_FILE_TOKEN}` },
  })

  try {
    const assocBody = JSON.parse(assocResult.body.toString() || "{}")
    return (assocBody.results || []).some((r) => String(r.toObjectId) === String(contactId))
  } catch {
    return false
  }
}

exports.handler = async (event) => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*" }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" }
  }

  if (!JWT_SECRET || !HUBSPOT_FILE_TOKEN) {
    return { statusCode: 500, headers: corsHeaders, body: "Server not configured" }
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization || ""
  const token = authHeader.replace("Bearer ", "").trim()

  if (!token) {
    return { statusCode: 401, headers: corsHeaders, body: "Unauthorised" }
  }

  let session
  try {
    session = jwt.verify(token, JWT_SECRET)
  } catch {
    return { statusCode: 401, headers: corsHeaders, body: "Invalid session" }
  }

  const fileId = event.queryStringParameters?.fileId
  const dealId = event.queryStringParameters?.dealId

  if (!fileId) return { statusCode: 400, headers: corsHeaders, body: "Missing fileId" }
  if (!dealId) return { statusCode: 400, headers: corsHeaders, body: "Missing dealId" }
  if (!/^\d+$/.test(String(fileId))) {
    return { statusCode: 400, headers: corsHeaders, body: "Invalid fileId" }
  }

  const email = String(session.email || "").toLowerCase()
  const isStaff = HOLMES_DOMAINS.some((d) => email.endsWith("@" + d))
  const isStudent = session.type === "student_otp" || session.companyName === "Direct Student"

  if (!isStaff && isStudent) {
    const allowed = await dealHasContact(dealId, session.contactId)
    if (!allowed) {
      return { statusCode: 403, headers: corsHeaders, body: "You do not have permission to access this file." }
    }
  }

  if (!isStaff && !isStudent) {
    if (!session.companyId) {
      return { statusCode: 403, headers: corsHeaders, body: "You do not have permission to access this file." }
    }

    const dealCompanyId = await getDealCompanyId(dealId)
    if (!dealCompanyId || String(dealCompanyId) !== String(session.companyId)) {
      return { statusCode: 403, headers: corsHeaders, body: "You do not have permission to access this file." }
    }
  }

  // Verify fileId belongs to this deal.
  // Hybrid rule:
  // - EMAIL attachments are accepted.
  // - NOTE attachments are accepted only when the note is a portal-upload marker note.
  // - Normal notes/comments are ignored.
  if (!isStaff) {
    const engResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/engagements/v1/engagements/associated/deal/${dealId}/paged?limit=100`,
      method: "GET",
      headers: { Authorization: `Bearer ${HUBSPOT_FILE_TOKEN}` },
    })

    const validFileIds = new Set()

    try {
      const engBody = JSON.parse(engResult.body.toString() || "{}")
      for (const eng of engBody.results || []) {
        const type = eng.engagement?.type
        if (type !== "EMAIL" && type !== "NOTE") continue

        for (const id of extractFileIdsFromEngagement(eng)) {
          validFileIds.add(String(id))
        }

        if (type === "EMAIL") {
          const extraIds = await getCrmEmailAttachmentIds(String(eng.engagement?.id || ""))
          for (const id of extraIds) validFileIds.add(String(id))
        }
      }
    } catch {
      // Fail closed below.
    }

    if (!validFileIds.has(String(fileId))) {
      console.log("FILE ACCESS DENIED", {
        requestedFileId: String(fileId),
        dealId: String(dealId),
        sessionEmail: session.email,
        validFileIds: Array.from(validFileIds),
      })

      return { statusCode: 403, headers: corsHeaders, body: "You do not have permission to access this file." }
    }
  }

  try {
    const metaResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/files/v3/files/${fileId}`,
      method: "GET",
      headers: { Authorization: `Bearer ${HUBSPOT_FILE_TOKEN}` },
    })

    if (metaResult.status < 200 || metaResult.status >= 300) {
      return { statusCode: metaResult.status || 500, headers: corsHeaders, body: "File not found" }
    }

    const meta = JSON.parse(metaResult.body.toString())

    const signedResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/files/v3/files/${fileId}/signed-url`,
      method: "GET",
      headers: { Authorization: `Bearer ${HUBSPOT_FILE_TOKEN}` },
    })

    let downloadUrl = ""
    if (signedResult.status >= 200 && signedResult.status < 300) {
      try {
        downloadUrl = JSON.parse(signedResult.body.toString()).url || ""
      } catch {}
    }

    if (!downloadUrl) {
      downloadUrl = meta.url || meta.defaultHostingUrl || meta.default_hosting_url || ""
    }

    if (!downloadUrl) {
      return { statusCode: 404, headers: corsHeaders, body: "File URL not found" }
    }

    const parsedUrl = new URL(downloadUrl)
    const fileResult = await makeRequest(
      {
        hostname: parsedUrl.hostname,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: "GET",
        headers: {},
      },
      true
    )

    if (fileResult.status < 200 || fileResult.status >= 300) {
      return { statusCode: fileResult.status, headers: corsHeaders, body: "Unable to download file" }
    }

    const contentType = getContentType(meta, fileResult)
    const baseName = meta.name ? String(meta.name) : "document"
    const extension = String(meta.extension || "").toLowerCase()
    const cleanName =
      extension && !baseName.toLowerCase().endsWith(`.${extension}`)
        ? `${baseName}.${extension}`
        : baseName
    const safeFileName = cleanName.replace(/["\r\n]/g, "")

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${safeFileName}"`,
        "Content-Length": String(fileResult.body.length),
        "Cache-Control": "private, no-store",
      },
      body: fileResult.body.toString("base64"),
      isBase64Encoded: true,
    }
  } catch (err) {
    console.error("download-file error:", err.message)
    return { statusCode: 500, headers: corsHeaders, body: "Server error" }
  }
}
