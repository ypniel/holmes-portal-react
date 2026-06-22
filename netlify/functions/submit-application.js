const jwt = require("jsonwebtoken")
const https = require("https")

const JWT_SECRET = process.env.JWT_SECRET
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN
const PIPELINE_ID = process.env.VITE_PIPELINE_ID || "789344406"
const STAGE_ID = "1155257364" // New Application Received

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    // Verify session — accept both agent and student tokens
    try {
      payload = jwt.verify(sessionToken, JWT_SECRET)
    } catch {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "Session expired. Please sign in again." }) }
    }
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid request" }) }
  }

  const isStudent = payload.type === "student" || payload.companyName === "Direct Student"
  const isAgent = !isStudent

  try {
    // ── Step 1: Find or verify contact ─────────────────────────────────────
    let contactId = payload.contactId

    if (isAgent) {
      // Agent submitting — find/create student contact by student email
      const studentEmail = form.student_email?.trim().toLowerCase()
      if (!studentEmail) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Student email required" }) }

      const searchRes = await hs("/crm/v3/objects/contacts/search", "POST", {
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: studentEmail }] }],
        properties: ["email", "firstname", "lastname"],
        limit: 1,
      })

      if (searchRes.body.results?.length > 0) {
        contactId = searchRes.body.results[0].id
      } else {
        // Create new contact
        const createRes = await hs("/crm/v3/objects/contacts", "POST", {
          properties: {
            email: studentEmail,
            firstname: form.firstname || "",
            lastname: form.lastname || "",
            phone: form.mobile_phone_number || "",
          }
        })
        if (createRes.status !== 201) {
          return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Failed to create student contact" }) }
        }
        contactId = createRes.body.id
      }
    }

    // ── Step 2: Build deal name ─────────────────────────────────────────────
    const dealName = [
      form.firstname || "", form.lastname || "",
      form.course_name_australia || "",
      new Date().getFullYear(),
    ].filter(Boolean).join(" – ")

    // ── Step 3: Build deal properties ──────────────────────────────────────
    const dealProps = {
      dealname: dealName,
      pipeline: PIPELINE_ID,
      dealstage: STAGE_ID,
      response_status: "Holmes_Received",

      // Personal
      firstname: form.firstname || "",
      lastname: form.lastname || "",
      mobile_phone_number: form.mobile_phone_number || "",
      date_of_birth: form.date_of_birth || "",
      street_name: form.street_name || "",
      state: form.state || "",
      post_code: form.post_code || "",
      country: form.country || "",
      nationality: form.nationality || "",
      usi_number: form.usi_number || "",
      passport_number: form.passport_number || "",
      residency_status: form.residency_status || "",
      where_are_you_applying_from: form.where_are_you_applying_from || "",
      do_you_have_a_disability_impairment_or_longterm_medical_conditions_which_may_affect_your_studies_2: form.disability || "",

      // Course
      course_name_australia: form.course_name_australia || "",
      campus_australia: form.campus_australia || "",
      intake_australia: form.intake_australia || "",
      advanced_standing: form.advanced_standing || "",
      oshc: form.oshc || "",
      wwcc_blue_card_number: form.wwcc_blue_card_number || "",

      // Prior education
      name_of_qualification: form.name_of_qualification || "",
      name_of_institution_attended: form.name_of_institution_attended || "",

      // English
      name_of_english_proficiency_test_australia: form.name_of_english_proficiency_test_australia || "",
      score: form.score || "",
      what_are_the_results_of_your_english_proficiency_test_: form.what_are_the_results_of_your_english_proficiency_test_ || "",
      what_date_did_you_take_your_english_proficiency_test_: form.what_date_did_you_take_your_english_proficiency_test_ || "",
      eap_required: form.eap_required || "",

      // Additional
      do_you_intend_to_apply_for_fee_help_: form.do_you_intend_to_apply_for_fee_help_ || "",
      course_start_date: form.course_start_date || "",
      course_end_date: form.course_end_date || "",
      ohc_english: form.ohc_english || "",
      ohcweeks: form.ohcweeks || "",
    }

    // Agent email — from agent session only
    if (isAgent) {
      dealProps.agent_email = payload.email || ""
      dealProps.agent_contact_name = payload.fullName || ""
    }

    // Remove empty strings to avoid overwriting existing HubSpot values with blank
    Object.keys(dealProps).forEach(k => {
      if (dealProps[k] === "" || dealProps[k] === null || dealProps[k] === undefined) {
        delete dealProps[k]
      }
    })
    // Always keep these even if empty
    dealProps.dealname = dealName
    dealProps.pipeline = PIPELINE_ID
    dealProps.dealstage = STAGE_ID
    dealProps.response_status = "Holmes_Received"

    // ── Step 4: Create deal ─────────────────────────────────────────────────
    const dealRes = await hs("/crm/v3/objects/deals", "POST", { properties: dealProps })
    if (dealRes.status !== 201) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Failed to create deal", detail: dealRes.body }) }
    }
    const dealId = dealRes.body.id

    // ── Step 5: Associate deal with contact ─────────────────────────────────
    await hs(`/crm/v4/objects/deals/${dealId}/associations/contacts/${contactId}`, "PUT", {
      associationTypes: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }]
    })

    // ── Step 6: If agent, also associate with agent's company ───────────────
    if (isAgent && payload.companyId) {
      await hs(`/crm/v4/objects/deals/${dealId}/associations/companies/${payload.companyId}`, "PUT", {
        associationTypes: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 5 }]
      })
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, dealId }),
    }
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}
