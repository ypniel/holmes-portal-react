// ─── HubSpot API Client ───────────────────────────────────────────────────────
const TOKEN = (import.meta as any).env.VITE_HUBSPOT_TOKEN
const COMPANY_TOKEN = (import.meta as any).env.VITE_HUBSPOT_PERSONAL_ACCESS_KEY || TOKEN
const PIPELINE_ID = (import.meta as any).env.VITE_PIPELINE_ID || ""
const IS_DEV = (import.meta as any).env.DEV

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

// ── Core fetch wrapper ────────────────────────────────────────────────────────
async function hsFetch(path: string, init: RequestInit = {}, useCompanyToken = false): Promise<any> {
  const token = useCompanyToken ? COMPANY_TOKEN : TOKEN
  let url: string
  let fetchInit: RequestInit

  if (IS_DEV) {
    url = `https://api.hubapi.com${path}`
    fetchInit = {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    }
  } else {
    // Use Netlify serverless function as proxy to avoid CORS
    const extra = useCompanyToken ? "&useCompanyToken=true" : ""
    url = `/.netlify/functions/hubspot?path=${encodeURIComponent(path)}${extra}`
    fetchInit = {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    }
  }

  const res = await fetch(url, fetchInit)
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
  "english_test_type","english_test_score",
  "course_start_date","course_end_date",
  "tuition_fees","scholarship","total_cost",
  "hubspot_owner_id","createdate","hs_lastmodifieddate",
  "nationality_","nationality","country",
  "residency_status_","residency_status",
  "date_of_birth","passport_number",
  "agent_company","agency_name_import_use_only","branch_office",
  "agent_email","agent_company_name","agent_mobile_number","agent_contact_name",
  "contact_person_name","name",
  "student_id","jupiter_id","hs_object_id",
]

// ── Pipeline Stage Map ────────────────────────────────────────────────────────
export const STAGE_LABELS: Record<string, string> = {
  // Real Australia Admissions Pipeline stage IDs
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

// ── Fetch Deals ───────────────────────────────────────────────────────────────
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

  // Method 1 — CRM Notes API (new notes created via portal)
  try {
    const assoc = await hsFetch(`/crm/v3/objects/deals/${dealId}/associations/notes`)
    const noteIds: string[] = (assoc.results || []).slice(0, 50).map((a: any) => a.id)
    if (noteIds.length) {
      const notes = await Promise.all(
        noteIds.map(async (nid) => {
          try {
            return await hsFetch(`/crm/v3/objects/notes/${nid}?properties=hs_note_body,hs_createdate,hubspot_owner_id`)
          } catch { return null }
        })
      )
      notes.filter(Boolean).forEach((n: any) => {
        allNotes.push({
          id: n.id,
          body: (n.properties.hs_note_body || "").replace(/<br>/g, "\n"),
          createdAt: n.properties.hs_createdate,
          ownerId: n.properties.hubspot_owner_id,
        })
      })
    }
  } catch {}

  // Method 2 — Legacy Engagements API (notes added directly in HubSpot)
  try {
    const eng = await hsFetch(`/engagements/v1/engagements/associated/deal/${dealId}/paged?limit=50`)
    for (const e of eng.results || []) {
      if (e.engagement?.type === "NOTE" && e.metadata?.body) {
        const id = String(e.engagement.id)
        if (!allNotes.find(n => n.id === id)) {
          allNotes.push({
            id,
            body: e.metadata.body.replace(/<br>/g, "\n").replace(/<[^>]*>/g, ""),
            createdAt: new Date(e.engagement.createdAt).toISOString(),
            ownerId: String(e.engagement.ownerId || ""),
          })
        }
      }
    }
  } catch {}

  return allNotes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

// ── Create Note ───────────────────────────────────────────────────────────────
export async function createNote(dealId: string, body: string): Promise<boolean> {
  try {
    const note = await hsFetch("/crm/v3/objects/notes", {
      method: "POST",
      body: JSON.stringify({ properties: { hs_note_body: body, hs_timestamp: new Date().toISOString() } }),
    })
    await hsFetch("/crm/v3/associations/notes/deals/batch/create", {
      method: "POST",
      body: JSON.stringify({ inputs: [{ from: { id: note.id }, to: { id: dealId }, type: "note_to_deal" }] }),
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

// ── Fetch Company (Agent Details) ─────────────────────────────────────────────
// ── Fetch the main agent email for a sub-agent ────────────────────────────────
// 1. Find the contact by email
// 2. Get their associated company
// 3. Return the company's agent_email
export async function fetchMainAgentEmail(subAgentEmail: string): Promise<string | null> {
  try {
    // Step 1 — find contact by email
    const contactRes = await hsFetch(
      `/crm/v3/objects/contacts/search`,
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: subAgentEmail }] }],
          properties: ["email", "firstname", "lastname"],
          limit: 1,
        })
      }
    )
    const contact = contactRes.results?.[0]
    if (!contact) return null

    // Step 2 — get associated company
    const assoc = await hsFetch(`/crm/v4/objects/contacts/${contact.id}/associations/companies`)
    const companyId = assoc.results?.[0]?.toObjectId
    if (!companyId) return null

    // Step 3 — get company's agent_email
    const company = await hsFetch(
      `/crm/v3/objects/companies/${companyId}?properties=agent_email,name`,
      {}, true
    )
    return company.properties?.agent_email || null
  } catch { return null }
}

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

// ── Batch fetch deals by IDs (for demo mode) ─────────────────────────────────
export async function fetchDealsByIds(ids: string[]): Promise<Deal[]> {
  const results: Deal[] = []
  // HubSpot batch read supports max 100 at a time
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
// ── Fetch agent profile via Company association ───────────────────────────────
// 1. Search contacts by email
// 2. Get associated company
// 3. Return company agent_email, name etc
export async function fetchAgentByEmail(email: string): Promise<{ 
  agentEmail: string
  companyName: string
  contactName: string
  companyId: string 
} | null> {
  try {
    // Step 1 — find contact by email
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

    // Step 2 — get associated company
    const assocRes = await hsFetch(`/crm/v4/objects/contacts/${contact.id}/associations/companies`)
    const companyId = assocRes.results?.[0]?.toObjectId
    if (!companyId) return null

    // Step 3 — get company details
    const company = await hsFetch(
      `/crm/v3/objects/companies/${companyId}?properties=name,agent_email,contact_person_name`
    )
    return {
      agentEmail: company.properties?.agent_email || email,
      companyName: company.properties?.name || "",
      contactName: company.properties?.contact_person_name || 
        `${contact.properties?.firstname || ""} ${contact.properties?.lastname || ""}`.trim(),
      companyId: String(companyId),
    }
  } catch { return null }
}

// ── Fetch all deals for a company ─────────────────────────────────────────────
export async function fetchDealsByCompanyId(companyId: string): Promise<Deal[]> {
  try {
    // Get deal IDs associated with this company
    const assocRes = await hsFetch(`/crm/v4/objects/companies/${companyId}/associations/deals`)
    const dealIds = (assocRes.results || []).map((r: any) => String(r.toObjectId))
    if (!dealIds.length) return []
    return await fetchDealsByIds(dealIds)
  } catch { return [] }
}

// ── Fast agent lookup for login ───────────────────────────────────────────────
export async function fetchDealByAgentEmail(email: string): Promise<Deal | null> {
  try {
    const data = await hsFetch(
      `/crm/v3/objects/deals/search`,
      {
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
      }
    )
    const raw = data.results?.[0]
    if (!raw) return null
    return mapDeal(raw)
  } catch { return null }
}
export async function fetchFiles(dealId: string): Promise<FileItem[]> {
  try {
    const data = await hsFetch(`/engagements/v1/engagements/associated/deal/${dealId}/paged?limit=50`)
    const files: FileItem[] = []
    
    for (const eng of data.results || []) {
      const body = eng.metadata?.body || ""
      
      // Method 1 — attachment with valid ID
      for (const att of eng.attachments || []) {
        if (!att.id || att.id === 0) continue
        try {
          const fileData = await hsFetch(`/filemanager/api/v3/files/${att.id}`)
          let name = fileData.name || att.name || "Document"
          name = name.replace(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-/, "")
          name = name.replace(/^file_upload_\d+-/, "")
          name = name.replace(/-[a-f0-9]{6}$/, "")
          name = name.replace(/_/g, " ")
          const url = fileData.url || fileData.default_hosting_url || fileData.s3_url || 
            `/.netlify/functions/hubspot?download=true&fileId=${att.id}`
          files.push({ name, id: String(att.id), url, createdAt: eng.engagement?.createdAt })
        } catch {
          files.push({ name: "Document", id: String(att.id), url: "", createdAt: eng.engagement?.createdAt })
        }
      }

      // Method 2 — parse file URL from metadata body HTML
      const linkMatches = [...body.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
      for (const match of linkMatches) {
        const hrefUrl = match[1]
        let name = match[2].trim()
        name = name.replace(/^[a-f0-9]{13}-/, "")
        name = name.replace(/_/g, " ")
        if (!name || files.find(f => f.name === name)) continue

        // Extract file ID from signed URL and fetch public URL
        const fileIdMatch = hrefUrl.match(/\/files\/(\d+)\//)
        if (fileIdMatch) {
          try {
            const fileData = await hsFetch(`/filemanager/api/v3/files/${fileIdMatch[1]}`)
            const publicUrl = fileData.url || fileData.default_hosting_url || fileData.s3_url || hrefUrl
            files.push({ name, id: fileIdMatch[1], url: publicUrl, createdAt: eng.engagement?.createdAt })
          } catch {
            files.push({ name, id: hrefUrl, url: hrefUrl, createdAt: eng.engagement?.createdAt })
          }
        }
      }
    }
    
    return files.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
  } catch { return [] }
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
  
  // Helper to get first non-empty value
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
    englishTestType: g("english_test_type"),
    englishScore: g("english_test_score"),
    courseStart: g("course_start_date"),
    courseEnd: g("course_end_date"),
    tuitionFees: g("tuition_fees"),
    scholarship: g("scholarship"),
    totalCost: g("total_cost"),
    ownerId: g("hubspot_owner_id"),
    createdAt: g("createdate"),
    lastModified: g("hs_lastmodifieddate"),
    nationality: g("country", "nationality_", "nationality"),
    residencyStatus: g("residency_status_", "residency_status"),
    dob: g("date_of_birth"),
    passport: g("passport_number"),
    agentCompany: g("agent_company_name", "name", "agent_company", "agency_name_import_use_only"),
    agentEmail: g("agent_email"),
    agentPhone: g("agent_mobile_number"),
    agentContact: g("agent_contact_name", "contact_person_name"),
    branchOffice: g("branch_office"),
    studentId: g("student_id"),
    jupiterId: g("jupiter_id"),
    dealId: raw.id,
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Deal {
  id: string; studentName: string; dealstage: string; stageLabel: string; stageColor: string
  responseStatus: string; courseName: string; campus: string; intake: string; applyingFrom: string
  advancedStanding: string; oshc: string; eap: string; englishTestType: string; englishScore: string
  courseStart: string; courseEnd: string; tuitionFees: string; scholarship: string; totalCost: string
  ownerId: string; createdAt: string; lastModified: string; nationality: string; residencyStatus: string
  dob: string; passport: string; agentCompany: string; agentEmail: string
  agentPhone: string; agentContact: string; branchOffice: string
  studentId: string; jupiterId: string; dealId: string
}
export interface Note { id: string; body: string; createdAt: string; ownerId: string }
export interface FileItem { name: string; id: string; url?: string; createdAt?: number }
export interface Company {
  id: string; name: string; contactPerson: string; phone: string; email: string
  city: string; country: string; address: string; website: string
}
