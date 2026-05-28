const https = require("https")

const TOKEN = process.env.HUBSPOT_TOKEN || process.env.VITE_HUBSPOT_TOKEN
const COMPANY_TOKEN = process.env.HUBSPOT_PERSONAL_ACCESS_KEY || TOKEN
const PIPELINE_ID = process.env.VITE_PIPELINE_ID || "789344406"

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve({ status: 302, location: res.headers.location, body: "" })
        return
      }
      let data = ""
      res.on("data", chunk => { data += chunk })
      res.on("end", () => resolve({ status: res.statusCode, body: data }))
    })
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }

  const path = event.queryStringParameters?.path || ""
  const isRedirect = event.queryStringParameters?.redirect === "true"
  const useCompanyToken = event.queryStringParameters?.useCompanyToken === "true"
  
  if (!path) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "No path" }) }

  // Use company token for company-related requests
  const token = useCompanyToken ? COMPANY_TOKEN : TOKEN
  
  // Debug — remove after fixing
  if (useCompanyToken) {
    console.log("Using company token, starts with:", token ? token.substring(0, 15) : "MISSING")
  }

  try {
    const isPost = event.httpMethod === "POST"
    let bodyToSend = event.body || ""

    if (isPost && path.includes("/deals/search")) {
      const parsed = event.body ? JSON.parse(event.body) : {}
      parsed.filterGroups = [{
        filters: [{ propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID }]
      }]
      bodyToSend = JSON.stringify(parsed)
    }

    const bodyBuf = Buffer.from(bodyToSend || "", "utf8")

    const options = {
      hostname: "api.hubapi.com",
      path: path,
      method: isPost ? "POST" : "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": bodyBuf.length,
      },
    }

    const result = await makeRequest(options, bodyBuf.length > 0 ? bodyToSend : undefined)

    if (isRedirect && result.status === 302 && result.location) {
      return {
        statusCode: 302,
        headers: { "Location": result.location, "Access-Control-Allow-Origin": "*" },
        body: "",
      }
    }

    return { statusCode: result.status, headers: corsHeaders, body: result.body }
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}
