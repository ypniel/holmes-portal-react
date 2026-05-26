// ─── HubSpot API Client ───────────────────────────────────────────────────────
// Replaces @stacker/portal-sdk with direct HubSpot REST API calls
// All data comes live from HubSpot — no duplication

const BASE = "https://api.hubapi.com"
const TOKEN = (import.meta as any).env.VITE_HUBSPOT_TOKEN
const PIPELINE_ID = (import.meta as any).env.VITE_PIPELINE_ID || ""

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
}

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

// ── Deal Properties ───────────────────────────────────────────────────────────
export const DEAL_PROPS = [
  "dealname","dealstage","pipeline","response_status",
  "course_name_australia_","campus","intake","where_applying_from_",
  "advanced_standing","oshc","eap_required","english_test_type",
  "english_test_score","course_start_date","course_end_date",
  "tuition_fees","scholarship","total_cost","hubspot_owner_id",
  "createdate","hs_lastmodifieddate","nationality_","residency_status_",
  "date_of_birth","passport_number","agent_company","branch_office",
  "student_id","jupiter_id","hs_object_id",
]

// ── Pipeline Stage Map ────────────────────────────────────────────────────────
export const STAGE_LABELS: Record<string, string> = {
  "New Application Received":    "New Application Received",
  "Documentation Outstanding":   "Documentation Outstanding",
  "Approved for Interview":      "Approved for Interview",
  "GS Checking in Process":      "GS Checking in Process",
  "Credit Assessment Team":      "Credit Assessment Team",
  "English Placement Test":      "English Placement Test",
  "Offer Letter Requested":      "Offer Letter Requested",
  "Offer Issued":                "Offer Issued",
  "Second Agent Application":    "Second Agent Application",
  "Receipting":                  "Receipting",
  "COE Request":                 "COE Request",
  "COE Team":                    "COE Team",
  "Application Complete":        "Application Complete",
  "Application Closed":          "Application Closed",
  "Enrolled":                    "Enrolled",
  "Duplicate":                   "Duplicate",
  "Interview":                   "Interview",
  "GTE in Process":              "GTE in Process",
  "Conditional Offer Issued":    "Conditional Offer Issued",
  "Application Refused":         "Application Refused",
  // Fallback HubSpot internal IDs
  appointmentscheduled:          "New Application Received",
  qualifiedtobuy:                "Documentation Outstanding",
  presentationscheduled:         "Offer Issued",
  decisionmakerboughtin:         "Receipting",
  contractsent:                  "COE Request",
  closedwon:                     "Application Complete",
  closedlost:                    "Application Refused",
}

export const PIPELINE_STAGES = [
  "New Application Received",
  "Documentation Outstanding",
  "Approved for Interview",
  "GS Checking in Process",
  "Credit Assessment Team",
  "English Placement Test",
  "Offer Letter Requested",
  "Offer Issued",
  "Second Agent Application",
  "Receipting",
  "COE Request",
  "COE Team",
  "Application Complete",
  "Application Closed",
  "Enrolled",
  "Duplicate",
  "Interview",
  "GTE in Process",
  "Conditional Offer Issued",
  "Application Refused",
]

export const STAGE_COLORS: Record<string, string> = {
  "New Application Received":  "blue",
  "Documentation Outstanding": "amber",
  "Approved for Interview":    "teal",
  "GS Checking in Process":   "cyan",
  "Credit Assessment Team":   "amber",
  "English Placement Test":   "sky",
  "Offer Letter Requested":   "indigo",
  "Offer Issued":             "indigo",
  "Second Agent Application": "purple",
  "Receipting":               "amber",
  "COE Request":              "violet",
  "COE Team":                 "violet",
  "Application Complete":     "emerald",
  "Application Closed":       "green",
  "Enrolled":                 "emerald",
  "Duplicate":                "gray",
  "Interview":                "teal",
  "GTE in Process":           "amber",
  "Conditional Offer Issued": "indigo",
  "Application Refused":      "red",
}

// ── Fetch Deals ───────────────────────────────────────────────────────────────
export async function fetchDeals(limit = 500): Promise<Deal[]> {
  const url = `${BASE}/crm/v3/objects/deals/search`
  const payload: any = {
    filterGroups: PIPELINE_ID ? [{
      filters: [{ propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID }]
    }] : [],
    properties: DEAL_PROPS,
    limit: 100,
    sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
  }

  const all: Deal[] = []
  let after: string | undefined

  while (all.length < limit) {
    if (after) payload.after = after
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`HubSpot API error: ${res.status}`)
    const data = await res.json()
    all.push(...data.results.map(mapDeal))
    after = data.paging?.next?.after
    if (!after) break
  }
  return all.slice(0, limit)
}

// ── Fetch Single Deal ─────────────────────────────────────────────────────────
export async function fetchDeal(id: string): Promise<Deal> {
  const res = await fetch(
    `${BASE}/crm/v3/objects/deals/${id}?properties=${DEAL_PROPS.join(",")}`,
    { headers }
  )
  if (!res.ok) throw new Error(`HubSpot API error: ${res.status}`)
  const data = await res.json()
  return mapDeal(data)
}

// ── Fetch Notes for a Deal ────────────────────────────────────────────────────
export async function fetchNotes(dealId: string): Promise<Note[]> {
  const assocRes = await fetch(
    `${BASE}/crm/v3/objects/deals/${dealId}/associations/notes`,
    { headers }
  )
  if (!assocRes.ok) return []
  const assocData = await assocRes.json()
  const noteIds: string[] = (assocData.results || []).slice(0, 20).map((a: any) => a.id)
  if (!noteIds.length) return []

  const notes = await Promise.all(
    noteIds.map(async (nid) => {
      const r = await fetch(
        `${BASE}/crm/v3/objects/notes/${nid}?properties=hs_note_body,hs_createdate,hubspot_owner_id`,
        { headers }
      )
      if (!r.ok) return null
      return r.json()
    })
  )

  return notes
    .filter(Boolean)
    .map((n: any) => ({
      id: n.id,
      body: (n.properties.hs_note_body || "").replace(/<br>/g, "\n"),
      createdAt: n.properties.hs_createdate,
      ownerId: n.properties.hubspot_owner_id,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

// ── Create Note ───────────────────────────────────────────────────────────────
export async function createNote(dealId: string, body: string): Promise<boolean> {
  const noteRes = await fetch(`${BASE}/crm/v3/objects/notes`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      properties: {
        hs_note_body: body,
        hs_timestamp: new Date().toISOString(),
      },
    }),
  })
  if (!noteRes.ok) return false
  const note = await noteRes.json()

  const assocRes = await fetch(
    `${BASE}/crm/v3/associations/notes/deals/batch/create`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        inputs: [{ from: { id: note.id }, to: { id: dealId }, type: "note_to_deal" }],
      }),
    }
  )
  return assocRes.ok
}

// ── Fetch Owners ──────────────────────────────────────────────────────────────
export async function fetchOwners(): Promise<Record<string, string>> {
  const res = await fetch(`${BASE}/crm/v3/owners`, { headers })
  if (!res.ok) return {}
  const data = await res.json()
  return Object.fromEntries(
    (data.results || []).map((o: any) => [
      String(o.id),
      `${o.firstName || ""} ${o.lastName || ""}`.trim(),
    ])
  )
}

// ── Fetch Pipeline Stages ─────────────────────────────────────────────────────
export async function fetchPipelineStages(): Promise<Record<string, string>> {
  const res = await fetch(`${BASE}/crm/v3/pipelines/deals`, { headers })
  if (!res.ok) return {}
  const data = await res.json()
  const map: Record<string, string> = {}
  for (const pl of data.results || []) {
    for (const s of pl.stages || []) {
      map[s.id] = s.label
    }
  }
  return map
}

// ── Fetch Files ───────────────────────────────────────────────────────────────
export async function fetchFiles(dealId: string): Promise<FileItem[]> {
  const res = await fetch(
    `${BASE}/engagements/v1/engagements/associated/deal/${dealId}/paged?limit=50`,
    { headers }
  )
  if (!res.ok) return []
  const data = await res.json()
  const files: FileItem[] = []
  for (const eng of data.results || []) {
    for (const att of eng.attachments || []) {
      files.push({
        name: att.name || "Unknown",
        id: att.id,
        createdAt: eng.engagement?.createdAt,
      })
    }
  }
  return files
}

// ── Auth (Magic Link via HubSpot Forms) ──────────────────────────────────────
// We store a simple JWT in localStorage after verifying the user's email
// against HubSpot Contacts. For production, use a proper auth backend.
export async function lookupContact(email: string): Promise<{ id: string; name: string; email: string } | null> {
  const res = await fetch(`${BASE}/crm/v3/objects/contacts/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
      properties: ["email", "firstname", "lastname"],
      limit: 1,
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data.results?.length) return null
  const c = data.results[0]
  const p = c.properties
  return {
    id: c.id,
    name: `${p.firstname || ""} ${p.lastname || ""}`.trim() || email,
    email: p.email,
  }
}

// ── Map raw HubSpot deal to Deal type ─────────────────────────────────────────
function mapDeal(raw: any): Deal {
  const p = raw.properties || {}
  const stageId = p.dealstage || ""
  const stageLabel = STAGE_LABELS[stageId] || stageId.replace(/_/g, " ")
  return {
    id: raw.id,
    studentName: p.dealname || `Deal #${raw.id}`,
    dealstage: stageId,
    stageLabel,
    stageColor: STAGE_COLORS[stageLabel] || "stone",
    responseStatus: p.response_status || "",
    courseName: p.course_name_australia_ || "",
    campus: p.campus || "",
    intake: p.intake || "",
    applyingFrom: p.where_applying_from_ || "",
    advancedStanding: p.advanced_standing || "",
    oshc: p.oshc || "",
    eap: p.eap_required || "",
    englishTestType: p.english_test_type || "",
    englishScore: p.english_test_score || "",
    courseStart: p.course_start_date || "",
    courseEnd: p.course_end_date || "",
    tuitionFees: p.tuition_fees || "",
    scholarship: p.scholarship || "",
    totalCost: p.total_cost || "",
    ownerId: p.hubspot_owner_id || "",
    createdAt: p.createdate || "",
    lastModified: p.hs_lastmodifieddate || "",
    nationality: p.nationality_ || "",
    residencyStatus: p.residency_status_ || "",
    dob: p.date_of_birth || "",
    passport: p.passport_number || "",
    agentCompany: p.agent_company || "",
    branchOffice: p.branch_office || "",
    studentId: p.student_id || "",
    jupiterId: p.jupiter_id || "",
    dealId: raw.id,
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Deal {
  id: string
  studentName: string
  dealstage: string
  stageLabel: string
  stageColor: string
  responseStatus: string
  courseName: string
  campus: string
  intake: string
  applyingFrom: string
  advancedStanding: string
  oshc: string
  eap: string
  englishTestType: string
  englishScore: string
  courseStart: string
  courseEnd: string
  tuitionFees: string
  scholarship: string
  totalCost: string
  ownerId: string
  createdAt: string
  lastModified: string
  nationality: string
  residencyStatus: string
  dob: string
  passport: string
  agentCompany: string
  branchOffice: string
  studentId: string
  jupiterId: string
  dealId: string
}

export interface Note {
  id: string
  body: string
  createdAt: string
  ownerId: string
}

export interface FileItem {
  name: string
  id: string
  createdAt?: number
}
