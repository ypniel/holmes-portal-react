// ─────────────────────────────────────────────────────────────────────────────
// aussizz.ts
//
// Self-contained module for Aussizz Group's branch-based access control.
// Nothing here modifies any other part of the portal, and — importantly —
// nothing here requires any changes in HubSpot itself (no new companies, no
// re-associating contacts or deals). It works entirely off the `agent_email`
// property that already exists directly on every deal.
//
// Rule being encoded: each branch login sees ONLY the deals whose agent_email
// property exactly matches its own login email.
//
// Wire-in point (the only change needed elsewhere): in ApplicationsPage.tsx
// and HomePage.tsx, before falling back to the normal company-based lookup,
// check isAussizzEmail(user.email) first, and if true, call
// getAussizzDeals(user.email) instead. See bottom of this file for the
// exact snippet.
//
// To add or remove a branch later, this is the ONLY file that needs editing —
// just update the list below.
// ─────────────────────────────────────────────────────────────────────────────

import { fetchDealsByAgentEmail, type Deal } from "./hubspot"

// Every Aussizz branch login this module handles. Add/remove emails here only.
const AUSSIZZ_BRANCH_EMAILS = [
  "teamvic@aussizzgroup.com",
  "admissions.sydney@aussizzgroup.com",
  "admission.qld@aussizzgroup.com",
]

function normalize(email: string): string {
  return (email || "").trim().toLowerCase()
}

/**
 * True if this email is one of the Aussizz branch logins handled here.
 * The caller uses this to decide whether to route through getAussizzDeals()
 * at all, instead of the portal's normal company-based logic.
 */
export function isAussizzEmail(email: string): boolean {
  return AUSSIZZ_BRANCH_EMAILS.includes(normalize(email))
}

/**
 * Returns only the deals whose agent_email property matches this branch
 * login's own email exactly — i.e. only applications lodged under that
 * specific email address.
 */
export async function getAussizzDeals(email: string): Promise<Deal[]> {
  const e = normalize(email)
  if (!AUSSIZZ_BRANCH_EMAILS.includes(e)) return []
  return fetchDealsByAgentEmail(e)
}

// ─────────────────────────────────────────────────────────────────────────────
// WIRE-IN SNIPPET for src/pages/ApplicationsPage.tsx and src/pages/HomePage.tsx
// — the only other files that need a change. Add the import at the top:
//
//   import { isAussizzEmail, getAussizzDeals } from "../lib/aussizz"
//
// Then, right before the normal agent company-lookup logic runs, add:
//
//   if (isAussizzEmail(user.email)) {
//     const d = await getAussizzDeals(user.email)
//     setDeals(d)
//     return
//   }
//
// That's the entire integration — no other existing line needs to change.
// ─────────────────────────────────────────────────────────────────────────────
