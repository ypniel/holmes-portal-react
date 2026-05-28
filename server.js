/**
 * Holmes Institute Australia — Admissions Portal
 * HubSpot API Proxy Server (Express.js)
 *
 * This server acts as a secure proxy between the React frontend
 * and the HubSpot API. It keeps API tokens server-side so they
 * are never exposed to the browser.
 *
 * Usage:
 *   npm install express node-fetch cors dotenv
 *   node server.js
 *
 * Environment variables (set on server or in .env file):
 *   HUBSPOT_TOKEN              — HubSpot Private App service key
 *   HUBSPOT_PERSONAL_ACCESS_KEY — Personal access key for company records
 *   VITE_PIPELINE_ID           — Australia Admissions Pipeline ID
 *   PORT                       — Server port (default: 3001)
 *   ALLOWED_ORIGIN             — Frontend URL for CORS (default: *)
 */

require('dotenv').config()
const express = require('express')
const https = require('https')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 3001
const TOKEN = process.env.HUBSPOT_TOKEN
const COMPANY_TOKEN = process.env.HUBSPOT_PERSONAL_ACCESS_KEY || TOKEN
const PIPELINE_ID = process.env.VITE_PIPELINE_ID || "789344406"
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*"

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: ALLOWED_ORIGIN }))
app.use(express.json())

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── HubSpot proxy ─────────────────────────────────────────────────────────────
app.all('/hubspot', async (req, res) => {
  const path = req.query.path
  const isRedirect = req.query.redirect === 'true'
  const useCompanyToken = req.query.useCompanyToken === 'true'

  if (!path) {
    return res.status(400).json({ error: 'No path provided' })
  }

  const token = useCompanyToken ? COMPANY_TOKEN : TOKEN
  const method = req.method === 'POST' ? 'POST' : 'GET'

  let bodyToSend = ''

  // Inject pipeline filter for deal searches
  if (method === 'POST' && path.includes('/deals/search')) {
    const parsed = req.body || {}
    parsed.filterGroups = [{
      filters: [{ propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID }]
    }]
    bodyToSend = JSON.stringify(parsed)
  } else if (req.body) {
    bodyToSend = JSON.stringify(req.body)
  }

  const bodyBuf = Buffer.from(bodyToSend || '', 'utf8')

  const options = {
    hostname: 'api.hubapi.com',
    path: path,
    method: method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': bodyBuf.length,
    },
  }

  try {
    const result = await new Promise((resolve, reject) => {
      const proxyReq = https.request(options, (proxyRes) => {
        // Handle redirects (for signed file URLs)
        if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
          resolve({ status: 302, location: proxyRes.headers.location, body: '' })
          return
        }
        let data = ''
        proxyRes.on('data', chunk => { data += chunk })
        proxyRes.on('end', () => resolve({ status: proxyRes.statusCode, body: data }))
      })
      proxyReq.on('error', reject)
      if (bodyBuf.length > 0) proxyReq.write(bodyToSend)
      proxyReq.end()
    })

    // Handle file download redirects
    if (isRedirect && result.status === 302 && result.location) {
      return res.redirect(result.location)
    }

    res.status(result.status).send(result.body)

  } catch (err) {
    console.error('Proxy error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Holmes Admissions Portal proxy running on port ${PORT}`)
  console.log(`HubSpot Pipeline: ${PIPELINE_ID}`)
  console.log(`CORS origin: ${ALLOWED_ORIGIN}`)
})
