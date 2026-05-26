const https = require("https")

exports.handler = async (event) => {
  const token = process.env.HUBSPOT_TOKEN || process.env.VITE_HUBSPOT_TOKEN
  const path = event.queryStringParameters?.path || ""
  const method = event.httpMethod === "POST" ? "POST" : "GET"
  
  // Parse body and inject pipeline filter for deal searches
  let body = event.body
  if (method === "POST" && path.includes("/deals/search") && body) {
    try {
      const parsed = JSON.parse(body)
      const PIPELINE_ID = process.env.VITE_PIPELINE_ID || "789344406"
      // Ensure pipeline filter is always applied
      parsed.filterGroups = [{
        filters: [{ propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID }]
      }]
      body = JSON.stringify(parsed)
    } catch(e) {}
  }

  return new Promise((resolve) => {
    const options = {
      hostname: "api.hubapi.com",
      path: path,
      method: method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }

    const req = https.request(options, (res) => {
      let data = ""
      res.on("data", (chunk) => { data += chunk })
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Content-Type": "application/json",
          },
          body: data,
        })
      })
    })

    req.on("error", (err) => {
      resolve({ statusCode: 500, body: JSON.stringify({ error: err.message }) })
    })

    if (body) req.write(body)
    req.end()
  })
}
