// ─── HubSpot API Client ───────────────────────────────────────────────────────
// All HubSpot API calls go through the Netlify function proxy — no tokens in the frontend
const PIPELINE_ID = "789344406"

export const BADGE_CLASSES: Record<string, string> = {
  blue:    "bg-blue-100 text-blue-700 border-blue-200",
  amber:   "bg-amber-100 text-amber-700 border-amber-200",
  green:   "bg-green-100 text-green-700 border-green-200",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
  red:     "bg-red-100 text-red-700 border-red-200",
  indigo:  "bg-indigo-100 text-indigo-700 border-indigo-200",
  violet:  "bg-violet-100 text-violet-700 border-violet-200",
  teal:    "bg-teal-100 text-teal-700 border-teal-200",
  sky:     "bg-sky-100 text-sky-700 border-sky-200",
  cyan:    "bg-cyan-100 text-cyan-700 border-cyan-200",
  gray:    "bg-gray-100 text-gray-700 border-gray-200",
  purple:  "bg-purple-100 text-purple-700 border-purple-200",
  stone:   "bg-stone-100 text-stone-700 border-stone-200",
}

// ── Core fetch wrapper — always proxied through Netlify function ──────────────
async function hsFetch(path: string, init: RequestInit = {}): Promise<any> {
  const token = sessionStorage.getItem("holmes_session_token") || ""
  const url = `/.netlify/functions/hubspot?path=${encodeURIComponent(path)}${token ? `&sessionToken=${encodeURIComponent(token)}` : ""}`
  const fetchInit: RequestInit = {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  }
  const res = await fetch(url, fetchInit)
  if (res.status === 403) {
    window.location.href = "/login"
    throw new Error("Access denied")
  }
  if (!res.ok) throw new Error(`HubSpot API error: ${res.status}`)
  return res.json()
}

// ── Deal Properties ───────────────────────────────────────────────────────────
export const DEAL_PROPS = [
  "dealname","dealstage","pipeline","response_status",
  "course_name_australia_","course_name_australia","course_name","coursename",
  "campus_australia_","campus_australia","campus",
  "intake_australia_","intake_australia","intake",
  "where_applying_from_","where_applying_from",
  "advanced_standing","oshc","eap_required",
  "name_of_english_proficiency_test_australia","what_are_the_results_of_your_english_proficiency_test_","what_date_did_you_take_your_english_proficiency_test_",
  "course_start_date","course_end_date",
  "tution_fees","scholarship_fee","total_cost",
  "hubspot_owner_id","createdate","hs_lastmodifieddate",
  "nationality_","nationality","country",
  "residency_status_","residency_status","residency_status_australia",
  "date_of_birth","passport_number",
  "agent_company","agency_name_import_use_only","branch_office",
  "agent_email","agent_company_name","agent_mobile_number","agent_contact_name",
  "contact_person_name","name",
  "student_id","student_number","jupiter_id","hs_object_id","portal_application_reference",
  "ohc_english","wwcc_blue_card_number","email","mobile_phone_number","street_name","city","post_code",
]

// ── Pipeline Stage Map ────────────────────────────────────────────────────────
export const STAGE_LABELS: Record<string, string> = {
  "1155257364": "New Application Received",
  "1155257365": "Documentation Outstanding",
  "1155257366": "Approved for Interview",
  "1155257367": "GS Checking in Process",
  "1155257368": "Credit Assessment Team",
  "1155257369": "English Placement Test",
  "1155257370": "Offer Letter Requested",
  "1155163699": "Offer Issued",
  "1155163705": "Second Agent Application",
  "1155163700": "Receipting",
  "1155163701": "COE Request",
  "1155163702": "COE Team",
  "1155163703": "Application Completed",
  "1155163706": "Application Closed",
  "1175846298": "Enrolled",
  "1349993739": "Duplicate",
  "1363564954": "Interview Invitation Sent",
  "1363564955": "GTE in Process",
  "1363564956": "Conditional Offer Issued",
  "1363564957": "Application Refused",
}

export const PIPELINE_STAGES = [
  "New Application Received","Documentation Outstanding","Approved for Interview",
  "GS Checking in Process","Credit Assessment Team","English Placement Test",
  "Offer Letter Requested","Offer Issued","Second Agent Application","Receipting",
  "COE Request","COE Team","Application Complete","Application Closed","Enrolled",
  "Duplicate","Interview","GTE in Process","Conditional Offer Issued","Application Refused",
]

export const STAGE_COLORS: Record<string, string> = {
  "1155257364": "blue",
  "1155257365": "amber",
  "1155257366": "teal",
  "1155257367": "cyan",
  "1155257368": "amber",
  "1155257369": "sky",
  "1155257370": "indigo",
  "1155163699": "indigo",
  "1155163705": "purple",
  "1155163700": "amber",
  "1155163701": "violet",
  "1155163702": "violet",
  "1155163703": "emerald",
  "1155163706": "gray",
  "1175846298": "emerald",
  "1349993739": "gray",
  "1363564954": "teal",
  "1363564955": "amber",
  "1363564956": "indigo",
  "1363564957": "red",
}

// ── Fetch Deals ────────────────────────────────────────────────────────────────
export async function fetchDeals(): Promise<Deal[]> {
  const payload: any = {
    filterGroups: PIPELINE_ID ? [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID }] }] : [],
    properties: DEAL_PROPS,
    limit: 100,
    sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
  }
  const all: Deal[] = []
  let after: string | undefined
  while (true) {
    if (after) payload.after = after
    const data = await hsFetch("/crm/v3/objects/deals/search", { method: "POST", body: JSON.stringify(payload) })
    all.push(...data.results.map(mapDeal))
    after = data.paging?.next?.after
    if (!after) break
  }
  return all
}

// ── Fetch Single Deal ─────────────────────────────────────────────────────────
export async function fetchDeal(id: string): Promise<Deal> {
  const data = await hsFetch(`/crm/v3/objects/deals/${id}?properties=${DEAL_PROPS.join(",")}`)
  return mapDeal(data)
}

// ── Fetch Notes ───────────────────────────────────────────────────────────────
export async function fetchNotes(dealId: string): Promise<Note[]> {
  const allNotes: Note[] = []

  try {
    const eng = await hsFetch(`/engagements/v1/engagements/associated/deal/${dealId}/paged?limit=100`)
    for (const e of eng.results || []) {
      const type = e.engagement?.type
      if (type !== "EMAIL") continue
      const id = String(e.engagement.id)
      if (allNotes.find(n => n.id === id)) continue

      let body = ""
      const rawBody = e.metadata?.body || e.metadata?.html || ""
      // The "Comment by Agent" marker identifies portal (agent) messages.
      // No marker = message came from Holmes (HubSpot) side.
      const isAgentMessage = rawBody.includes("Comment by Agent")
      body = rawBody.replace(/\s*(<br>)*\s*— Comment by Agent \(via Portal\)\s*/g, "")
      body = body
        .replace(/<img[^>]*>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
      const disclaimerIndex = body.search(/please do not reply to this email/i)
      if (disclaimerIndex > 0) body = body.substring(0, disclaimerIndex).trim()
      const sigIndex = body.search(/kind regards|holmes education group|holmes institute/i)
      if (sigIndex > 0) body = body.substring(0, sigIndex).trim()
      const unsubIndex = body.search(/prefer fewer emails|unsubscribe/i)
      if (unsubIndex > 0) body = body.substring(0, unsubIndex).trim()

      if (!body || body.includes("File uploaded")) continue

      allNotes.push({
        id,
        body,
        createdAt: new Date(e.engagement.createdAt).toISOString(),
        ownerId: String(e.engagement.ownerId || ""),
        author: isAgentMessage ? "Agent" : "Holmes Admissions",
        type: "email",
      })
    }
  } catch {}

  return allNotes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

// ── Create Note ───────────────────────────────────────────────────────────────
export async function createNote(dealId: string, body: string, authorName?: string, studentName?: string, passport?: string): Promise<boolean> {
  try {
    const subject = studentName
      ? `Re: ${studentName}${passport ? ` (${passport})` : ""} — Holmes Portal`
      : "Portal Message"
    const engBody = JSON.stringify({
      engagement: { active: true, type: "EMAIL", timestamp: Date.now() },
      associations: { dealIds: [parseInt(dealId)] },
      attachments: [],
      metadata: {
        from: { email: "portal@holmes.edu.au", firstName: authorName || "Agent" },
        to: [{ email: "admissions@holmes.edu.au" }],
        subject,
        body: body + "\n\n— Comment by Agent (via Portal)",
        html: body + "<br><br>— Comment by Agent (via Portal)",
      }
    })
    await hsFetch("/engagements/v1/engagements", { method: "POST", body: engBody })
    await hsFetch(`/crm/v3/objects/deals/${dealId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { response_status: "Holmes_Received" } }),
    })
    return true
  } catch { return false }
}

// ── Fetch Owners ──────────────────────────────────────────────────────────────
export async function fetchOwners(): Promise<Record<string, string>> {
  try {
    const data = await hsFetch("/crm/v3/owners")
    return Object.fromEntries((data.results || []).map((o: any) => [
      String(o.id), `${o.firstName || ""} ${o.lastName || ""}`.trim()
    ]))
  } catch { return {} }
}

// ── Fetch Main Agent Email ────────────────────────────────────────────────────
export async function fetchMainAgentEmail(subAgentEmail: string): Promise<string | null> {
  try {
    const contactRes = await hsFetch(`/crm/v3/objects/contacts/search`, {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: subAgentEmail }] }],
        properties: ["email", "firstname", "lastname"],
        limit: 1,
      })
    })
    const contact = contactRes.results?.[0]
    if (!contact) return null
    const assoc = await hsFetch(`/crm/v4/objects/contacts/${contact.id}/associations/companies`)
    const companyId = assoc.results?.[0]?.toObjectId
    if (!companyId) return null
    const company = await hsFetch(`/crm/v3/objects/companies/${companyId}?properties=agent_email,name`)
    return company.properties?.agent_email || null
  } catch { return null }
}

// ── Fetch Deal Company ────────────────────────────────────────────────────────
export async function fetchDealCompany(dealId: string): Promise<Company | null> {
  try {
    const assoc = await hsFetch(`/crm/v4/objects/deals/${dealId}/associations/companies`)
    let companyIds: string[] = (assoc.results || []).slice(0, 1).map((a: any) => String(a.toObjectId || a.id))

    if (!companyIds.length) {
      const assocV3 = await hsFetch(`/crm/v3/objects/deals/${dealId}/associations/companies`)
      const v3Ids = (assocV3.results || []).slice(0, 1).map((a: any) => String(a.id))
      if (!v3Ids.length) return null
      companyIds.push(...v3Ids)
    }

    const data = await hsFetch(
      `/crm/v3/objects/companies/${companyIds[0]}?properties=name,contact_person_name,agency_name_import_use_only,agent_city,agentcountry,agent_email,agent_mobile_no,phone,email,city,country,address,website`
    )
    const p = data.properties || {}
    const g = (...keys: string[]) => {
      for (const k of keys) {
        const v = p[k]
        if (v && String(v).trim() && v !== "null") return String(v).trim()
      }
      return ""
    }
    return {
      id: data.id,
      name: g("name", "agency_name_import_use_only"),
      contactPerson: g("contact_person_name"),
      phone: g("agent_mobile_no", "phone"),
      email: g("agent_email", "email"),
      city: g("agent_city", "city"),
      country: g("agentcountry", "country"),
      address: g("address"),
      website: g("website"),
    }
  } catch { return null }
}

// ── Fetch Deals by IDs ────────────────────────────────────────────────────────
export async function fetchDealsByIds(ids: string[]): Promise<Deal[]> {
  const results: Deal[] = []
  const chunks = []
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
  for (const chunk of chunks) {
    try {
      const data = await hsFetch(`/crm/v3/objects/deals/batch/read`, {
        method: "POST",
        body: JSON.stringify({
          inputs: chunk.map(id => ({ id })),
          properties: DEAL_PROPS,
        })
      })
      for (const raw of data.results || []) {
        results.push(mapDeal(raw))
      }
    } catch {}
  }
  return results
}

// ── Fetch Agent by Email ──────────────────────────────────────────────────────
export async function fetchAgentByEmail(email: string): Promise<{
  agentEmail: string
  companyName: string
  contactName: string
  companyId: string
  contactId: string
} | null> {
  try {
    const contactRes = await hsFetch(`/crm/v3/objects/contacts/search`, {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
        properties: ["email", "firstname", "lastname"],
        limit: 1,
      })
    })
    const contact = contactRes.results?.[0]
    if (!contact) return null

    const assocRes = await hsFetch(`/crm/v4/objects/contacts/${contact.id}/associations/companies`)
    const companyId = assocRes.results?.[0]?.toObjectId
    if (!companyId) return null

    const company = await hsFetch(
      `/crm/v3/objects/companies/${companyId}?properties=name,agent_email,contact_person_name`
    )
    return {
      agentEmail: company.properties?.agent_email || email,
      companyName: company.properties?.name || "",
      contactName: company.properties?.contact_person_name ||
        `${contact.properties?.firstname || ""} ${contact.properties?.lastname || ""}`.trim(),
      companyId: String(companyId),
      contactId: String(contact.id),
    }
  } catch { return null }
}

// ── Fetch Deals by Company ID ─────────────────────────────────────────────────
export async function fetchDealsByCompanyId(companyId: string): Promise<Deal[]> {
  try {
    const assocRes = await hsFetch(`/crm/v4/objects/companies/${companyId}/associations/deals`)
    const dealIds = (assocRes.results || []).map((r: any) => String(r.toObjectId))
    if (!dealIds.length) return []
    const all = await fetchDealsByIds(dealIds)
    return PIPELINE_ID ? all.filter(d => d.pipeline === PIPELINE_ID) : all
  } catch { return [] }
}

// ── Fetch Deal by Agent Email ─────────────────────────────────────────────────
export async function fetchDealByAgentEmail(email: string): Promise<Deal | null> {
  try {
    const data = await hsFetch(`/crm/v3/objects/deals/search`, {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [{
          filters: [
            { propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID },
            { propertyName: "agent_email", operator: "EQ", value: email },
          ]
        }],
        properties: DEAL_PROPS,
        sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
        limit: 1,
      })
    })
    const raw = data.results?.[0]
    if (!raw) return null
    return mapDeal(raw)
  } catch { return null }
}

// ── Fetch Files ───────────────────────────────────────────────────────────────
function extractFileIdsFromEngagement(eng: any, allowPortalNote = true): string[] {
  const ids = new Set<string>()
  const type = eng.engagement?.type
  const body = String(eng.metadata?.body || eng.engagement?.bodyPreview || "")

  // Normal notes/comments must not appear as files.
  // A NOTE is only treated as a file record if it is a portal-upload note.
  if (type === "NOTE" && allowPortalNote) {
    const isPortalUploadNote = body.includes("[FID:") || body.includes("[PORTAL_UPLOAD]")
    if (!isPortalUploadNote) return []
  }

  // Standard legacy engagement attachments.
  for (const att of eng.attachments || []) {
    if (att?.id) ids.add(String(att.id))
    if (att?.fileId) ids.add(String(att.fileId))
  }

  // Metadata attachments, used by some HubSpot email/note activities.
  for (const att of eng.metadata?.attachments || []) {
    if (att?.id) ids.add(String(att.id))
    if (att?.fileId) ids.add(String(att.fileId))
  }

  // HubSpot logged email attachment IDs can appear as semicolon/comma-separated values.
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

  // Portal upload marker. This is the reliable index for portal-uploaded files.
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

function cleanFileName(name: string, extension?: string): string {
  let cleaned = name || "Document"
  cleaned = cleaned.replace(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-/i, "")
  cleaned = cleaned.replace(/^file_upload_\d+-/i, "")
  cleaned = cleaned.replace(/-[a-f0-9]{6}$/i, "")
  cleaned = cleaned.replace(/^[a-f0-9]{13}-/i, "")
  cleaned = cleaned.replace(/_/g, " ").trim() || "Document"

  if (extension && !cleaned.toLowerCase().endsWith("." + extension.toLowerCase())) {
    cleaned = cleaned + "." + extension
  }

  return cleaned
}

async function fetchEmailAttachmentIdsFromCrmEmail(emailId: string): Promise<string[]> {
  try {
    const email = await hsFetch(
      `/crm/v3/objects/emails/${emailId}?properties=hs_attachment_ids,hs_email_attachment_ids,hs_timestamp,hs_body_preview,hs_email_subject`
    )

    const ids = new Set<string>()
    const fields = [
      email.properties?.hs_attachment_ids,
      email.properties?.hs_email_attachment_ids,
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

async function fetchFileMeta(fileId: string, fallbackCreatedAt?: number): Promise<FileItem> {
  try {
    const fileData = await hsFetch(`/filemanager/api/v3/files/${fileId}`)
    const name = cleanFileName(fileData.name || "Document", fileData.extension)
    return {
      name,
      id: fileId,
      url: `/.netlify/functions/download-file?fileId=${encodeURIComponent(fileId)}`,
      createdAt: fallbackCreatedAt,
    }
  } catch {
    return {
      name: `Document ${fileId}`,
      id: fileId,
      url: `/.netlify/functions/download-file?fileId=${encodeURIComponent(fileId)}`,
      createdAt: fallbackCreatedAt,
    }
  }
}

export async function fetchFiles(dealId: string): Promise<FileItem[]> {
  try {
    const data = await hsFetch(`/engagements/v1/engagements/associated/deal/${dealId}/paged?limit=100`)
    const fileMap = new Map<string, { fileId: string; createdAt?: number }>()

    for (const eng of data.results || []) {
      const type = eng.engagement?.type
      const body = String(eng.metadata?.body || eng.engagement?.bodyPreview || "")
      const isEmail = type === "EMAIL"
      const isPortalUploadNote = type === "NOTE" && (body.includes("[FID:") || body.includes("[PORTAL_UPLOAD]"))

      // New rule:
      // - Show EMAIL attachments.
      // - Show portal-upload NOTE files only when the note has a file marker.
      // - Ignore all normal notes/comments.
      if (!isEmail && !isPortalUploadNote) continue

      let fileIds = extractFileIdsFromEngagement(eng)

      // HubSpot logged email attachments are sometimes not returned on the legacy engagement payload.
      // For EMAIL activities, ask the CRM email object for hs_attachment_ids as a fallback.
      if (isEmail) {
        const extraIds = await fetchEmailAttachmentIdsFromCrmEmail(String(eng.engagement?.id || ""))
        fileIds = Array.from(new Set([...fileIds, ...extraIds]))
      }

      if (fileIds.length === 0) continue

      for (const fileId of fileIds) {
        if (!/^\d+$/.test(String(fileId))) continue
        if (!fileMap.has(String(fileId))) {
          fileMap.set(String(fileId), {
            fileId: String(fileId),
            createdAt: eng.engagement?.createdAt || eng.engagement?.timestamp,
          })
        }
      }
    }

    const fileMetas = await Promise.allSettled(
      Array.from(fileMap.values()).map((f) => fetchFileMeta(f.fileId, f.createdAt))
    )

    const files = fileMetas
      .filter((r): r is PromiseFulfilledResult<FileItem> => r.status === "fulfilled")
      .map((r) => r.value)
      .map((f) => ({
        ...f,
        url: `/.netlify/functions/download-file?fileId=${encodeURIComponent(f.id)}&dealId=${encodeURIComponent(dealId)}`,
      }))

    const seen = new Set<string>()
    return files
      .filter((f) => {
        if (seen.has(f.id)) return false
        seen.add(f.id)
        return true
      })
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
  } catch {
    return []
  }
}

// ── Lookup Contact ────────────────────────────────────────────────────────────
export async function lookupContact(email: string): Promise<{ id: string; name: string; email: string } | null> {
  try {
    const data = await hsFetch("/crm/v3/objects/contacts/search", {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
        properties: ["email", "firstname", "lastname"],
        limit: 1,
      }),
    })
    if (!data.results?.length) return null
    const c = data.results[0]
    return {
      id: c.id,
      name: `${c.properties.firstname || ""} ${c.properties.lastname || ""}`.trim() || email,
      email: c.properties.email,
    }
  } catch { return null }
}

// ── Map raw deal ──────────────────────────────────────────────────────────────
function mapDeal(raw: any): Deal {
  const p = raw.properties || {}
  const stageId = p.dealstage || ""
  const stageLabel = STAGE_LABELS[stageId] || stageId.replace(/_/g, " ")

  const g = (...keys: string[]) => {
    for (const k of keys) {
      const v = p[k]
      if (v && String(v).trim() && v !== "null") return String(v).trim()
    }
    return ""
  }

  return {
    id: raw.id,
    studentName: g("dealname") || `Deal #${raw.id}`,
    dealstage: stageId,
    pipeline: g("pipeline"),
    stageLabel,
    stageColor: STAGE_COLORS[stageId] || "stone",
    responseStatus: g("response_status").replace(/_/g, " "),
    courseName: g("course_name_australia_", "course_name_australia", "course_name", "coursename"),
    campus: g("campus_australia_", "campus_australia", "campus"),
    intake: g("intake_australia_", "intake_australia", "intake"),
    applyingFrom: g("where_applying_from_", "where_applying_from"),
    advancedStanding: g("advanced_standing"),
    oshc: g("oshc"),
    eap: g("eap_required"),
    englishTestType: g("name_of_english_proficiency_test_australia"),
    englishScore: g("what_are_the_results_of_your_english_proficiency_test_"),
    englishTestDate: g("what_date_did_you_take_your_english_proficiency_test_"),
    courseStart: g("course_start_date"),
    courseEnd: g("course_end_date"),
    tuitionFees: g("tution_fees"),
    scholarship: g("scholarship_fee"),
    totalCost: g("total_cost"),
    ownerId: g("hubspot_owner_id"),
    createdAt: g("createdate"),
    lastModified: g("hs_lastmodifieddate"),
    nationality: g("country", "nationality_", "nationality"),
    residencyStatus: g("residency_status_australia", "residency_status_", "residency_status"),
    dob: g("date_of_birth"),
    passport: g("passport_number"),
    agentCompany: g("agent_company_name", "name", "agent_company", "agency_name_import_use_only"),
    agentEmail: g("agent_email"),
    agentPhone: g("agent_mobile_number"),
    agentContact: g("agent_contact_name", "contact_person_name"),
    branchOffice: g("branch_office"),
    studentId: g("student_number") || g("student_id"),
    applicationReference: g("portal_application_reference"),
    jupiterId: g("jupiter_id"),
    dealId: raw.id,
    ohcEnglish: g("ohc_english"),
    wwcc: g("wwcc_blue_card_number"),
    studentEmail: g("email"),
    studentPhone: g("mobile_phone_number"),
    streetName: g("street_name"),
    city: g("city"),
    postCode: g("post_code"),
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Deal {
  id: string; studentName: string; dealstage: string; pipeline: string; stageLabel: string; stageColor: string
  responseStatus: string; courseName: string; campus: string; intake: string; applyingFrom: string
  advancedStanding: string; oshc: string; eap: string; englishTestType: string; englishScore: string; englishTestDate: string
  courseStart: string; courseEnd: string; tuitionFees: string; scholarship: string; totalCost: string
  ownerId: string; createdAt: string; lastModified: string; nationality: string; residencyStatus: string
  dob: string; passport: string; agentCompany: string; agentEmail: string
  agentPhone: string; agentContact: string; branchOffice: string
  studentId: string; jupiterId: string; dealId: string; applicationReference: string
  ohcEnglish: string; wwcc: string; studentEmail: string; studentPhone: string
  streetName: string; city: string; postCode: string
}
export interface Note { id: string; body: string; createdAt: string; ownerId: string; author?: string; type?: "note" | "email" }
export interface FileItem { name: string; id: string; url?: string; createdAt?: number }
export interface Company {
  id: string; name: string; contactPerson: string; phone: string; email: string
  city: string; country: string; address: string; website: string
}
