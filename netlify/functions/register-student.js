const https = require("https")
const jwt = require("jsonwebtoken")

const JWT_SECRET = process.env.JWT_SECRET
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN

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

  let form
  try {
    form = JSON.parse(event.body || "{}")
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid request" }) }
  }

  const email = form.email?.trim().toLowerCase()
  const firstname = form.firstname?.trim()
  const lastname = form.lastname?.trim()

  if (!email || !firstname) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "First name and email are required." }) }
  }

  // Check if contact already exists
  const searchRes = await hs("/crm/v3/objects/contacts/search", "POST", {
    filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
    properties: ["email", "firstname", "lastname"],
    limit: 1,
  })

  // Block if contact already exists — tell them to sign in
  if (searchRes.body.results?.length > 0) {
    return {
      statusCode: 409,
      headers: corsHeaders,
      body: JSON.stringify({ error: "An account with this email already exists. Please sign in instead." })
    }
  }

  let contactId
  if (false) {
    // (never reached)
  } else {
    // Create new contact
    const createRes = await hs("/crm/v3/objects/contacts", "POST", {
      properties: {
        email,
        firstname,
        lastname: lastname || "",
        date_of_birth: form.date_of_birth || "",
        passport_number: form.passport_number || "",
        nationality: form.nationality || "",
        phone: form.phone || "",
        country_the_applicant_is_applying_for: form.applying_for || "",
      }
    })

    if (createRes.status !== 201) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Failed to create account. Please try again." })
      }
    }
    contactId = createRes.body.id
  }

  // Generate a session token so they're automatically logged in
  const sessionToken = jwt.sign(
    { email, contactId, companyName: "Direct Student", type: "student", fullName: `${firstname} ${lastname || ""}`.trim() },
    JWT_SECRET,
    { expiresIn: "8h" }
  )

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      ok: true,
      sessionToken,
      user: {
        email,
        fullName: `${firstname} ${lastname || ""}`.trim(),
        contactId,
        companyName: "Direct Student",
      }
    })
  }
}
