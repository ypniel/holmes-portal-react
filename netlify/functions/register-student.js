const https = require("https")
const jwt = require("jsonwebtoken")

const JWT_SECRET = process.env.JWT_SECRET
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN
const HUBSPOT_TOKEN_WRITE = process.env.HUBSPOT_TOKEN_WRITE

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function hs(path, method, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : "{}"
    const req = https.request({
      hostname: "api.hubapi.com", path, method,
      headers: {
        "Authorization": `Bearer ${token || HUBSPOT_TOKEN}`,
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
    req.write(data)
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
  const lastname = (form.lastname || "").trim()

  if (!email || !firstname) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "First name and email are required." }) }
  }

  // Check if contact already exists
  const searchRes = await hs("/crm/v3/objects/contacts/search", "POST", {
    filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
    properties: ["email", "firstname", "lastname"],
    limit: 1,
  })

  if (searchRes.body.results?.length > 0) {
    return {
      statusCode: 409,
      headers: corsHeaders,
      body: JSON.stringify({ error: "An account with this email already exists. Please sign in instead." })
    }
  }

  // Build contact properties — only include valid HubSpot contact properties
  const contactProps = { email, firstname, lastname }
  if (form.phone) contactProps.phone = form.phone
  if (form.date_of_birth) contactProps.date_of_birth = form.date_of_birth
  if (form.nationality) contactProps.nationality = form.nationality
  if (form.applying_for) contactProps.country_the_applicant_is_applying_for = form.applying_for

  // Use write token for contact creation
  const createRes = await hs("/crm/v3/objects/contacts", "POST", { properties: contactProps }, HUBSPOT_TOKEN_WRITE)

  if (createRes.status !== 201) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Failed to create account. Please try again.", detail: createRes.body })
    }
  }

  const contactId = createRes.body.id
  const fullName = `${firstname} ${lastname}`.trim()

  const sessionToken = jwt.sign(
    { email, contactId, companyName: "Direct Student", type: "student", fullName },
    JWT_SECRET,
    { expiresIn: "8h" }
  )

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      ok: true,
      sessionToken,
      user: { email, fullName, contactId, companyName: "Direct Student" }
    })
  }
}
