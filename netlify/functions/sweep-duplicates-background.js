// Standalone duplicate sweep — no 0CodeTools, runs on Netlify.
// Scans ALL deals in the Australia pipeline, flags is_duplicate=true on any
// deal whose passport_number is shared by 2+ deals (across all agencies).
//
// Trigger options:
//   - Manual: visit /.netlify/functions/sweep-duplicates?key=YOUR_ADMIN_SECRET
//   - Scheduled: uncomment the exports.config schedule at the bottom
//
// Rate-limit friendly: paginates, batches PATCHes, small delays.

const https = require("https")

const TOKEN = process.env.HUBSPOT_TOKEN_WRITE || process.env.HUBSPOT_TOKEN
const ADMIN_SECRET = process.env.ADMIN_SECRET
const PIPELINE_ID = "789344406"

function hs(path, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : ""
    const req = https.request({
      hostname: "api.hubapi.com",
      path, method,
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      const chunks = []
      res.on("data", c => chunks.push(c))
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString() || "{}") }) }
        catch { resolve({ status: res.statusCode, body: {} }) }
      })
    })
    req.on("error", reject)
    if (data) req.write(data)
    req.end()
  })
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

exports.handler = async (event) => {
  // Simple auth for manual trigger
  const key = event.queryStringParameters?.key
  if (ADMIN_SECRET && key !== ADMIN_SECRET) {
    return { statusCode: 401, body: "Unauthorised" }
  }

  try {
    // 1. Page through ALL deals in the pipeline, collecting passport numbers
    const dealsByPassport = {}   // passport → [dealId, ...]
    const currentFlags = {}      // dealId → "true"/"false"/undefined
    let after = null
    let scanned = 0

    do {
      const res = await hs("/crm/v3/objects/deals/search", "POST", {
        filterGroups: [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID }] }],
        properties: ["passport_number", "is_duplicate"],
        limit: 100,
        after: after || undefined,
      })
      const results = res.body?.results || []
      for (const d of results) {
        scanned++
        const passport = (d.properties?.passport_number || "").trim().toLowerCase()
        currentFlags[d.id] = d.properties?.is_duplicate
        if (passport) {
          if (!dealsByPassport[passport]) dealsByPassport[passport] = []
          dealsByPassport[passport].push(d.id)
        }
      }
      after = res.body?.paging?.next?.after || null
      if (after) await sleep(200)  // gentle on rate limits
    } while (after)

    // 2. Determine desired flag for every deal
    const desired = {}  // dealId → "true"/"false"
    for (const [passport, ids] of Object.entries(dealsByPassport)) {
      const isDup = ids.length > 1 ? "true" : "false"
      ids.forEach(id => { desired[id] = isDup })
    }

    // 3. Patch only deals whose flag needs to change
    let updated = 0
    const toUpdate = Object.keys(desired).filter(id => currentFlags[id] !== desired[id])

    for (const id of toUpdate) {
      await hs(`/crm/v3/objects/deals/${id}`, "PATCH", {
        properties: { is_duplicate: desired[id] },
      })
      updated++
      if (updated % 10 === 0) await sleep(500)  // throttle every 10 writes
    }

    const summary = {
      ok: true,
      scanned,
      uniquePassports: Object.keys(dealsByPassport).length,
      duplicateGroups: Object.values(dealsByPassport).filter(ids => ids.length > 1).length,
      updated,
    }
    console.log("sweep-duplicates complete:", JSON.stringify(summary))
    return { statusCode: 200, body: JSON.stringify(summary) }
  } catch (err) {
    console.error("sweep-duplicates error:", err.message)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

// Optional: run automatically once a day (uncomment to enable)
// exports.config = { schedule: "0 2 * * *" }  // 2 AM daily
