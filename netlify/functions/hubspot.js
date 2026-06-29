const https = require("https")
const jwt = require("jsonwebtoken")

const TOKEN = process.env.HUBSPOT_TOKEN
const JWT_SECRET = process.env.JWT_SECRET
const PIPELINE_ID = "789344406"
const HOLMES_DOMAINS = ["holmes.edu.au", "holmeseducation.group"]

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve({ status: 302, location: res.headers.location, body: Buffer.alloc(0), headers: res.headers })
        return
      }
      const chunks = []
      res.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }))
    })
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}

function verifySession(event) {
  const token = event.queryStringParameters?.sessionToken || ""
  if (!token || !JWT_SECRET) return null
  try { return jwt.verify(token, JWT_SECRET) } catch { return null }
}

async function getDealCompanyId(dealId) {
  try {
    const res = await makeRequest({
      hostname: "api.hubapi.com",
      path: `/crm/v4/objects/deals/${dealId}/associations/companies`,
      method: "GET",
      headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    })
    const data = JSON.parse(res.body.toString() || "{}")
    return data.results?.[0]?.toObjectId ? String(data.results[0].toObjectId) : null
  } catch { return null }
}

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }

  // ── 1. Verify session — fail closed ───────────────────────────────────────
  const session = verifySession(event)
  if (!session) {
    return {
      statusCode: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Unauthorised. Please log in again." }),
    }
  }

  const isStaff = HOLMES_DOMAINS.some(d => (session.email || "").toLowerCase().endsWith("@" + d))
  const isStudent = session.type === "student_otp" || session.companyName === "Direct Student"
  const isAgent = !isStaff && !isStudent

  const path = event.queryStringParameters?.path || ""

  // ── 2. No file download logic here — handled by download-file.js only ─────
  // hubspot.js is CRM/deal/comment proxy only.

  if (!path) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "No path" }),
    }
  }

  // ── 3. Deal ownership check for agents ────────────────────────────────────
  const dealMatch = path.match(/\/crm\/v3\/objects\/deals\/(\d+)($|\?)/)
  if (dealMatch && isAgent) {
    const dealId = dealMatch[1]
    if (!session.companyId) {
      return {
        statusCode: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Access denied." }),
      }
    }
    const dealCompanyId = await getDealCompanyId(dealId)
    if (!dealCompanyId || String(dealCompanyId) !== String(session.companyId)) {
      return {
        statusCode: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Access denied. This application does not belong to your agency." }),
      }
    }
  }

  // ── 4. Proxy to HubSpot API ───────────────────────────────────────────────
  try {
    const isPost = event.httpMethod === "POST"
    const isPatch = event.httpMethod === "PATCH"
    let bodyToSend = event.body || ""

    // Inject pipeline filter for deal searches
    if (isPost && path.includes("/deals/search")) {
      const parsed = event.body ? JSON.parse(event.body) : {}
      const hasAgentFilter = parsed.filterGroups?.[0]?.filters?.some(f => f.propertyName === "agent_email")
      if (hasAgentFilter) {
        parsed.filterGroups = parsed.filterGroups.map(group => ({
          ...group,
          filters: [...group.filters, { propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID }]
        }))
      } else if (!parsed.filterGroups?.length) {
        parsed.filterGroups = [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID }] }]
      }
      bodyToSend = JSON.stringify(parsed)
    }

    const bodyBuf = Buffer.from(bodyToSend || "", "utf8")
    const options = {
      hostname: "api.hubapi.com",
      path: path,
      method: isPatch ? "PATCH" : isPost ? "POST" : "GET",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": bodyBuf.length,
      },
    }

    const result = await makeRequest(options, bodyBuf.length > 0 ? bodyToSend : undefined)
    return {
      statusCode: result.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: result.body.toString(),
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    }
  }
}
