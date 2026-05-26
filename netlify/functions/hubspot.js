const https = require("https")

exports.handler = async (event) => {
const token = process.env.HUBSPOT_TOKEN || process.env.VITE_HUBSPOT_TOKEN
  const path = event.queryStringParameters?.path || ""
  const method = event.httpMethod
  const body = event.body

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
            "Content-Type": "application/json",
          },
          body: data,
        })
      })
    })

    req.on("error", (err) => {
      resolve({
        statusCode: 500,
        body: JSON.stringify({ error: err.message }),
      })
    })

    if (body) req.write(body)
    req.end()
  })
}
