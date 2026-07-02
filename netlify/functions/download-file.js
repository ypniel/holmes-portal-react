const https = require("https")
const jwt = require("jsonwebtoken")

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN
const HUBSPOT_FILE_TOKEN = process.env.HUBSPOT_TOKEN_WRITE || HUBSPOT_TOKEN
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
          // Continue and return the original redirect response body.
        }
      }

      const chunks = []
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
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

function parseJson(buffer) {
  try {
    return JSON.parse(buffer.toString() || "{}")
  } catch {
    return {}
  }
}

function addNumericId(ids, value) {
  if (value === undefined || value === null) return
  const clean = String(value).trim()
  if (/^\d+$/.test(clean)) ids.add(clean)
}

function addIdsFromDelimitedString(ids, value) {
  if (!value) return
  for (const raw of String(value).split(/[;,]/)) {
    addNumericId(ids, raw)
  }
}

function extractFileIdsFromEngagement(eng) {
  const ids = new Set()

  for (const att of eng.attachments || []) {
    addNumericId(ids, att?.id)
    addNumericId(ids, att?.fileId)
  }

  for (const att of eng.metadata?.attachments || []) {
    addNumericId(ids, att?.id)
    addNumericId(ids, att?.fileId)
  }

  addIdsFromDelimitedString(ids, eng.metadata?.hs_attachment_ids)
  addIdsFromDelimitedString(ids, eng.metadata?.attachmentIds)

  const bodies = [
    eng.engagement?.bodyPreview,
    eng.metadata?.body,
    eng.metadata?.html,
    eng.metadata?.text,
  ]

  for (const body of bodies) {
    if (!body) continue
    const text = String(body)

    for (const match of text.matchAll(/\[FID:(\d+)\]/g)) addNumericId(ids, match[1])
    for (const match of text.matchAll(/fileId=(\d+)/g)) addNumericId(ids, match[1])
    for (const match of text.matchAll(/files\/(\d+)/g)) addNumericId(ids, match[1])
    for (const match of text.matchAll(/\/files\/v3\/files\/(\d+)/g)) addNumericId(ids, match[1])
  }

  return Array.from(ids)
}

async function getDealCompanyIds(dealId) {
  const res = await makeRequest({
    hostname: "api.hubapi.com",
    path: `/crm/v4/objects/deals/${dealId}/associations/companies`,
    method: "GET",
    headers: { Authorization: `Bearer ${HUBSPOT_FILE_TOKEN}` },
  })

  const body = parseJson(res.body)
  return (body.results || []).map((r) => String(r.toObjectId)).filter(Boolean)
}

async function getDealContactIds(dealId) {
  const res = await makeRequest({
    hostname: "api.hubapi.com",
    path: `/crm/v4/objects/deals/${dealId}/associations/contacts`,
    method: "GET",
    headers: { Authorization: `Bearer ${HUBSPOT_FILE_TOKEN}` },
  })

  const body = parseJson(res.body)
  return (body.results || []).map((r) => String(r.toObjectId)).filter(Boolean)
}

async function addFileIdsFromLegacyEngagements(dealId, validFileIds) {
  let offset = 0
  let hasMore = true
  let guard = 0

  while (hasMore && guard < 10) {
    guard += 1

    const res = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/engagements/v1/engagements/associated/deal/${dealId}/paged?limit=100&offset=${offset}`,
      method: "GET",
      headers: { Authorization: `Bearer ${HUBSPOT_FILE_TOKEN}` },
    })

    const body = parseJson(res.body)
    const results = body.results || []

    for (const eng of results) {
      const type = eng.engagement?.type
      if (type !== "NOTE" && type !== "EMAIL") continue

      for (const id of extractFileIdsFromEngagement(eng)) {
        validFileIds.add(String(id))
      }
    }

    hasMore = Boolean(body.hasMore && results.length)
    offset = body.offset ?? offset + results.length
    if (!results.length) break
  }
}

async function getAssociatedEmailIds(dealId) {
  const ids = new Set()
  const associationTypes = ["emails", "email"]

  for (const type of associationTypes) {
    try {
      const res = await makeRequest({
        hostname: "api.hubapi.com",
        path: `/crm/v4/objects/deals/${dealId}/associations/${type}`,
        method: "GET",
        headers: { Authorization: `Bearer ${HUBSPOT_FILE_TOKEN}` },
      })

      const body = parseJson(res.body)
      for (const r of body.results || []) {
        addNumericId(ids, r.toObjectId)
      }
    } catch {
      // Try the next association type.
    }
  }

  return Array.from(ids).slice(0, 100)
}

async function addFileIdsFromEmailObjects(dealId, validFileIds) {
  const emailIds = await getAssociatedEmailIds(dealId)

  for (const emailId of emailIds) {
    try {
      const res = await makeRequest({
        hostname: "api.hubapi.com",
        path: `/crm/v3/objects/emails/${emailId}?properties=hs_attachment_ids,hs_email_html,hs_email_text,hs_body_preview`,
        method: "GET",
        headers: { Authorization: `Bearer ${HUBSPOT_FILE_TOKEN}` },
      })

      const body = parseJson(res.body)
      const p = body.properties || {}

      addIdsFromDelimitedString(validFileIds, p.hs_attachment_ids)

      const textBlocks = [p.hs_email_html, p.hs_email_text, p.hs_body_preview]
      for (const textBlock of textBlocks) {
        if (!textBlock) continue
        const text = String(textBlock)
        for (const match of text.matchAll(/\[FID:(\d+)\]/g)) addNumericId(validFileIds, match[1])
        for (const match of text.matchAll(/fileId=(\d+)/g)) addNumericId(validFileIds, match[1])
        for (const match of text.matchAll(/files\/(\d+)/g)) addNumericId(validFileIds, match[1])
      }
    } catch {
      // One bad email record should not break the whole document list.
    }
  }
}

async function getValidFileIdsForDeal(dealId) {
  const validFileIds = new Set()

  await addFileIdsFromLegacyEngagements(dealId, validFileIds)
  await addFileIdsFromEmailObjects(dealId, validFileIds)

  return validFileIds
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

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" }
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" }
  }

  if (!JWT_SECRET || !HUBSPOT_FILE_TOKEN) {
    return { statusCode: 500, headers: corsHeaders, body: "Server not configured" }
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization || ""
  const token = authHeader.replace(/^Bearer\s+/i, "").trim()

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
  if (!/^\d+$/.test(String(fileId)) || !/^\d+$/.test(String(dealId))) {
    return { statusCode: 400, headers: corsHeaders, body: "Invalid request" }
  }

  const email = String(session.email || "").toLowerCase()
  const isStaff = HOLMES_DOMAINS.some((domain) => email.endsWith(`@${domain}`))
  const isStudent = session.type === "student_otp" || session.type === "student" || session.companyName === "Direct Student"

  try {
    if (!isStaff && isStudent) {
      const contactId = session.contactId
      if (!contactId) {
        return { statusCode: 403, headers: corsHeaders, body: "You do not have permission to access this file." }
      }

      const contactIds = await getDealContactIds(dealId)
      if (!contactIds.includes(String(contactId))) {
        return { statusCode: 403, headers: corsHeaders, body: "You do not have permission to access this file." }
      }
    }

    if (!isStaff && !isStudent) {
      const companyId = session.companyId
      if (!companyId) {
        return { statusCode: 403, headers: corsHeaders, body: "You do not have permission to access this file." }
      }

      const companyIds = await getDealCompanyIds(dealId)
      if (!companyIds.includes(String(companyId))) {
        return { statusCode: 403, headers: corsHeaders, body: "You do not have permission to access this file." }
      }
    }

    if (!isStaff) {
      const validFileIds = await getValidFileIdsForDeal(dealId)

      if (!validFileIds.has(String(fileId))) {
        console.log("FILE ACCESS DENIED", {
          requestedFileId: String(fileId),
          dealId: String(dealId),
          sessionEmail: session.email,
          sessionCompanyId: session.companyId,
          sessionContactId: session.contactId,
          validFileIds: Array.from(validFileIds),
        })

        return { statusCode: 403, headers: corsHeaders, body: "You do not have permission to access this file." }
      }
    }

    const metaResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/files/v3/files/${fileId}`,
      method: "GET",
      headers: { Authorization: `Bearer ${HUBSPOT_FILE_TOKEN}` },
    })

    if (metaResult.status < 200 || metaResult.status >= 300) {
      return { statusCode: metaResult.status || 500, headers: corsHeaders, body: "File not found" }
    }

    const meta = parseJson(metaResult.body)

    const signedResult = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/files/v3/files/${fileId}/signed-url`,
      method: "GET",
      headers: { Authorization: `Bearer ${HUBSPOT_FILE_TOKEN}` },
    })

    let downloadUrl = ""
    if (signedResult.status >= 200 && signedResult.status < 300) {
      downloadUrl = parseJson(signedResult.body).url || ""
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
      return { statusCode: fileResult.status || 500, headers: corsHeaders, body: "Unable to download file" }
    }

    const extension = String(meta.extension || "").toLowerCase()
    const baseName = meta.name ? String(meta.name) : "document"
    const fileName =
      extension && !baseName.toLowerCase().endsWith(`.${extension}`)
        ? `${baseName}.${extension}`
        : baseName
    const safeFileName = fileName.replace(/["\r\n]/g, "")

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": getContentType(meta, fileResult),
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
