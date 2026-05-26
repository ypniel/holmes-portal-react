const https = require("https")

const TOKEN = process.env.HUBSPOT_TOKEN || process.env.VITE_HUBSPOT_TOKEN
const PIPELINE_ID = process.env.VITE_PIPELINE_ID || "789344406"

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
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

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" }
  }

  const path = event.queryStringParameters?.path || ""
  if (!path) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "No path" }) }

  try {
    const isSearch = event.httpMethod === "POST"
    let bodyToSend = event.body || ""

    // For deal searches, always inject the pipeline filter
    if (isSearch && path.includes("/deals/search")) {
      const parsed = event.body ? JSON.parse(event.body) : {}
      parsed.filterGroups = [{
        filters: [{ propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID }]
      }]
      bodyToSend = JSON.stringify(parsed)
    }

    const options = {
      hostname: "api.hubapi.com",
      path: path,
      method: isSearch ? "POST" : "GET",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyToSend),
      },
    }

    const result = await makeRequest(options, bodyToSend)

    return {
      statusCode: result.status,
      headers: corsHeaders,
      body: result.body,
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
