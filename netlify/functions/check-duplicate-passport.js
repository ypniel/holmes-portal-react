const https = require("https")

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function hs(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : "{}"
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
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch { resolve({}) }
      })
    })
    req.on("error", reject)
    req.write(data)
    req.end()
  })
}

const STAGE_LABELS = {
  "1155257364": "New Application Received",
  "1155257365": "Documentation Outstanding",
  "1155257366": "Assessment In Progress",
  "1155257367": "Offer Issued",
  "1155257368": "Offer Accepted",
  "1155257369": "Enrolled",
  "1155163699": "New Application Received",
  "1155163700": "Documentation Outstanding",
  "1155163702": "Assessment In Progress",
  "1155163703": "Withdrawn / Unsuccessful",
  "1155163706": "Offer Issued",
  "1363564956": "Assessment In Progress",
  "1363564957": "Offer Issued",
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" }

  let passport, agentCompanyId
  try {
    const body = JSON.parse(event.body || "{}")
    passport = body.passport?.trim().toUpperCase()
    agentCompanyId = body.agentCompanyId ? String(body.agentCompanyId) : null
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid request" }) }
  }

  if (!passport || passport.length < 5) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ duplicate: false }) }
  }

  // Search deals by passport number
  const searchRes = await hs("/crm/v3/objects/deals/search", "POST", {
    filterGroups: [{ filters: [{ propertyName: "passport_number", operator: "EQ", value: passport }] }],
    properties: ["dealname", "dealstage", "passport_number", "first_name", "last_name", "hs_object_id"],
    limit: 10,
  })

  const deals = searchRes.results || []
  if (deals.length === 0) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ duplicate: false }) }
  }

  // For each matching deal, check company association
  for (const deal of deals) {
    const dealId = deal.id
    const assocRes = await hs(`/crm/v4/objects/deals/${dealId}/associations/companies`, "GET", null)
    const companyId = assocRes.results?.[0]?.toObjectId ? String(assocRes.results[0].toObjectId) : null

    if (agentCompanyId && companyId === agentCompanyId) {
      // Same company — return duplicate warning with deal details
      const p = deal.properties || {}
      const studentName = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.dealname || "Unknown"
      const stage = STAGE_LABELS[p.dealstage] || p.dealstage || "Unknown"

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          duplicate: true,
          sameCompany: true,
          dealId,
          studentName,
          status: stage,
          applicationUrl: `/applications/${dealId}`,
        })
      }
    }

    if (!agentCompanyId && deals.length > 0) {
      // No company context — still flag as potential duplicate but without details
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ duplicate: true, sameCompany: false })
      }
    }
  }

  // Deals found but none from same company — different agency, don't expose details
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ duplicate: false, otherCompany: true })
  }
}
