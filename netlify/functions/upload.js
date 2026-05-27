const https = require("https")
const TOKEN = process.env.HUBSPOT_TOKEN || process.env.VITE_HUBSPOT_TOKEN

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" }

  // Note: File uploads via Netlify Functions are complex due to multipart parsing
  // For now, return a helpful message directing to HubSpot
  // In production, use a backend service or HubSpot's file upload API directly
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ 
      message: "File upload noted. For full file sync, please upload directly in HubSpot and refresh the Documents tab.",
      success: false
    })
  }
}
