const jwt = require("jsonwebtoken")
const https = require("https")
const crypto = require("crypto")

const JWT_SECRET = process.env.JWT_SECRET
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN
const PIPELINE_ID = "789344406"
const STAGE_ID = "1155257364" // New Application Received

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}


// ── Generate a unique 5-digit application reference: HIA-48291 ───────────────
async function generateUniqueReference() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const num = crypto.randomInt(10000, 100000)  // 5 digits, 10000–99999
    const ref = `HIA-${num}`
    // Check HubSpot for an existing deal with this reference
    const search = await hs("/crm/v3/objects/deals/search", "POST", {
      filterGroups: [{ filters: [{ propertyName: "portal_application_reference", operator: "EQ", value: ref }] }],
      properties: ["portal_application_reference"],
      limit: 1,
    })
    const exists = (search.body?.total || 0) > 0
    if (!exists) return ref
  }
  // Extremely unlikely fallback — add extra entropy
  return `HIA-${crypto.randomInt(10000, 100000)}`
}

function hs(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : ""
    const req = https.request({
      hostname: "api.hubapi.com", path, method,
      headers: {
        "Authorization": `Bearer ${HUBSPOT_TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    }, res => {
      const chunks = []
      res.on("data", c => chunks.push(c))
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) })
        } catch { resolve({ status: res.statusCode, body: {} }) }
      })
    })
    req.on("error", reject)
    if (data) req.write(data)
    req.end()
  })
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" }

  let payload, form
  try {
    const body = JSON.parse(event.body || "{}")
    const { sessionToken, ...formData } = body
    form = formData
    try {
      payload = jwt.verify(sessionToken, JWT_SECRET)
    } catch {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Session expired. Please sign in again." }) }
    }
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid request" }) }
  }

  const isStudent = payload.type === "student" || payload.companyName === "Direct Student"
  const contactId = payload.contactId

  // ── Block Holmes staff from submitting applications ─────────────────────
  const HOLMES_DOMAINS = ["holmes.edu.au", "holmeseducation.group"]
  const emailDomain = (payload.email || "").split("@")[1]?.toLowerCase() || ""
  const isStaff = HOLMES_DOMAINS.some(d => emailDomain === d)
  if (isStaff) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Holmes staff cannot submit applications. View-only access." })
    }
  }

  try {
    // ── Server-side passport duplicate check (agents only) ──────────────────
    if (!isStudent && payload.companyId && form.passport_number) {
      const passportSearch = await hs("/crm/v3/objects/deals/search", "POST", {
        filterGroups: [{ filters: [{ propertyName: "passport_number", operator: "EQ", value: form.passport_number }] }],
        properties: ["dealname", "dealstage", "first_name", "last_name"],
        limit: 5,
      })
      const matchingDeals = passportSearch.body?.results || []
      for (const deal of matchingDeals) {
        const assocRes = await hs(`/crm/v4/objects/contacts/${deal.id}/associations/companies`, "GET", null)
        const dealCompanyId = assocRes.body?.results?.[0]?.toObjectId ? String(assocRes.body.results[0].toObjectId) : null
        // Check company association via deal
        const dealAssoc = await hs(`/crm/v4/objects/deals/${deal.id}/associations/companies`, "GET", null)
        const dealCompany = dealAssoc.body?.results?.[0]?.toObjectId ? String(dealAssoc.body.results[0].toObjectId) : null
        if (dealCompany === String(payload.companyId)) {
          const p = deal.properties || {}
          const studentName = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.dealname || "Unknown"
          return {
            statusCode: 409,
            headers: corsHeaders,
            body: JSON.stringify({
              error: "A duplicate application exists for this passport number within your agency.",
              duplicate: true,
              sameCompany: true,
              dealId: deal.id,
              studentName,
              applicationUrl: `/applications/${deal.id}`,
            })
          }
        }
      }
    }

    // ── Block direct students from lodging more than one application ───────
    if (isStudent && contactId) {
      const existingDeals = await hs(`/crm/v4/objects/contacts/${contactId}/associations/deals`, "GET", null)
      if (existingDeals.body.results?.length > 0) {
        return {
          statusCode: 409,
          headers: corsHeaders,
          body: JSON.stringify({ error: "An application already exists for this contact.", dealId: String(existingDeals.body.results[0].toObjectId) })
        }
      }
    }


    // ── Normalise residency status to match new enumeration values ──────────
    const RESIDENCY_MAP = {
      "currently have an international student visa": "Currently have an international student Visa",
      "none - currently residing outside australia":  "None - Currently residing outside Australia",
      "currently have a non-student temporary visa":  "Currently have a non-student temporary Visa (Work, Tourist, or Spouse Visa)",
      "australian citizen":  "Australian Citizen",
      "humanitarian visa":   "Humanitarian Visa",
      "new zealand citizen": "New Zealand Citizen",
      "permanent visa":      "Permanent Visa",
    }
    const rawResidency = form.residency_status || ""
    const normResidency = RESIDENCY_MAP[rawResidency.toLowerCase()] || rawResidency

    // ── Build deal name ─────────────────────────────────────────────────────
    const dealName = `${form.firstname || ""} ${form.lastname || ""}`.trim() || "New Application"

    // ── Build deal properties ───────────────────────────────────────────────
    const dealProps = {
      dealname: dealName,
      pipeline: PIPELINE_ID,
      dealstage: STAGE_ID,
      response_status: "Holmes_Received",
      // Personal — deal-level property names
      first_name: form.firstname || "",
      last_name: form.lastname || "",
      mobile_phone_number: form.mobile_phone_number || "",
      date_of_birth: form.date_of_birth || "",
      email: form.student_email || "",
      city: form.city || "",
      street_name: form.street_name || "",
      state: form.state || "",
      post_code: form.post_code || "",
      country: form.country || "",
      nationality: form.nationality || "",
      usi_number: form.usi_number || "",
      passport_number: form.passport_number || "",
      residency_status_australia: normResidency,
      where_are_you_applying_from: form.where_are_you_applying_from || "",
      do_you_have_a_disability_impairment_or_longterm_medical_conditions_which_may_affect_your_studies_2: form.disability || "",
      // Course
      course_name_australia: form.course_name_australia || "",
      campus_australia: form.campus_australia || "",
      intake_australia: form.intake_australia || "",
      advanced_standing: form.advanced_standing || "",
      oshc: form.oshc || "",
      wwcc_blue_card_number: form.wwcc_blue_card_number || "",
      placement_type: form.placement_type || "",
      ohc_english: form.ohc_english || "",
      ohcweeks: form.ohcweeks || "",
      // Prior education
      name_of_qualification: form.name_of_qualification || "",
      name_of_institution_attended: form.name_of_institution_attended || "",
      // English
      name_of_english_proficiency_test_australia: form.name_of_english_proficiency_test_australia || "",
      what_are_the_results_of_your_english_proficiency_test_: form.what_are_the_results_of_your_english_proficiency_test_ || "",
      what_date_did_you_take_your_english_proficiency_test_: form.what_date_did_you_take_your_english_proficiency_test_ || "",
      eap_required: form.eap_required || "",
      // Additional
      do_you_intend_to_apply_for_fee_help_: form.do_you_intend_to_apply_for_fee_help_ || "",
    }

    // File uploads — URLs from pre-submission upload
    for (let i = 1; i <= 10; i++) {
      const key = "file_upload_" + i
      if (form[key]) dealProps[key] = form[key]
    }

    // Agent email — only for agent submissions
    if (!isStudent) {
      dealProps.agent_email = payload.email || ""
      dealProps.agent_contact_name = payload.fullName || ""
    }

    // Remove empty values to avoid HubSpot validation errors
    Object.keys(dealProps).forEach(k => {
      if (dealProps[k] === "" || dealProps[k] === null || dealProps[k] === undefined) {
        delete dealProps[k]
      }
    })
    // Always keep core fields
    dealProps.dealname = dealName
    dealProps.pipeline = PIPELINE_ID
    dealProps.dealstage = STAGE_ID
    dealProps.response_status = "Holmes_Received"

    // ── Generate unique application reference ───────────────────────────────
    const applicationReference = await generateUniqueReference()
    dealProps.portal_application_reference = applicationReference

    // ── Create deal ─────────────────────────────────────────────────────────
    const dealRes = await hs("/crm/v3/objects/deals", "POST", { properties: dealProps })
    if (dealRes.status !== 201) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Failed to create deal", detail: dealRes.body }) }
    }
    const dealId = dealRes.body.id

    // ── Associate deal with contact (agent or student) ──────────────────────
    if (contactId) {
      await hs("/crm/v3/associations/deals/contacts/batch/create", "POST", {
        inputs: [{ from: { id: String(dealId) }, to: { id: String(contactId) }, type: "deal_to_contact" }]
      })
    }

    // ── Associate deal with agent's company ─────────────────────────────────
    if (!isStudent && payload.companyId) {
      await hs("/crm/v3/associations/deals/companies/batch/create", "POST", {
        inputs: [{ from: { id: String(dealId) }, to: { id: String(payload.companyId) }, type: "deal_to_company" }]
      })
    }

    // ── Attach pre-uploaded files to deal via engagement notes ─────────────
    const uploadedFiles = form.uploadedFiles || []
    if (uploadedFiles.length > 0) {
      // One engagement note with all file attachments
      const attachments = uploadedFiles.map(f => ({ id: parseInt(f.fileId) }))
      const fileNames = uploadedFiles.map(f => f.fileName).join(", ")
      await hs("/engagements/v1/engagements", "POST", {
        engagement: { active: true, type: "NOTE", timestamp: Date.now() },
        associations: { dealIds: [parseInt(dealId)] },
        attachments,
        metadata: { body: "📎 Documents uploaded via portal: " + fileNames }
      })
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, dealId, applicationReference }),
    }
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}
