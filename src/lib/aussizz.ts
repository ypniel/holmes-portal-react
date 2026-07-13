// ─────────────────────────────────────────────────────────────────────────────
// aussizz.ts
//
// Self-contained module for Aussizz Group's branch-based access control.
// Nothing here modifies any other part of the portal — this file is purely
// additive. It reuses fetchDealsByCompanyId() from hubspot.ts (unchanged) as
// its only dependency, so existing behavior for every other agent, staff
// member, and student is completely untouched.
//
// Rule being encoded:
//   - Each branch login sees ONLY the deals under its own dedicated company.
//   - The Master Account (onshoreapps@aussizzgroup.com) sees deals across
//     ALL Aussizz branches combined — nothing outside Aussizz.
//
// Wire-in point (the only change needed elsewhere): in ApplicationsPage.tsx,
// before falling back to the normal fetchDealsByCompanyId(companyId) call,
// check isAussizzEmail(user.email) first, and if true, call
// getAussizzDeals(user.email) instead. See bottom of this file for the
// exact snippet.
//
// To add, remove, or re-point a branch later, this is the ONLY file that
// needs editing — just update the map below.
// ─────────────────────────────────────────────────────────────────────────────

import { fetchDealsByCompanyId, type Deal } from "./hubspot"

// Each Aussizz branch login mapped to its dedicated HubSpot company ID.
// TODO: replace the placeholder IDs once the 6 branch companies are created
// in HubSpot — everything else in this file already works once these are filled in.
const AUSSIZZ_BRANCH_COMPANY_IDS: Record<string, string> = {
  "teamvic@aussizzgroup.com":            "REPLACE_WITH_VIC_COMPANY_ID",
  "admissions.sydney@aussizzgroup.com":  "REPLACE_WITH_NSW_COMPANY_ID",
  "admission.qld@aussizzgroup.com":      "REPLACE_WITH_QLD_COMPANY_ID",
  "teamwa@aussizz.com":                  "REPLACE_WITH_WA_COMPANY_ID",
  "tejas.patel@aussizzgroup.com":        "REPLACE_WITH_ADL_COMPANY_ID",
  "offshoreapps@aussizzgroup.com":       "REPLACE_WITH_OFFSHORE_COMPANY_ID",
}

// Master Account — the one login that sees every branch's deals combined.
const MASTER_ACCOUNT_EMAIL = "onshoreapps@aussizzgroup.com"

function normalize(email: string): string {
  return (email || "").trim().toLowerCase()
}

/**
 * True if this email belongs to ANY Aussizz login (a branch, or the Master
 * Account). The caller uses this to decide whether to route through
 * getAussizzDeals() at all, instead of the portal's normal per-company logic.
 */
export function isAussizzEmail(email: string): boolean {
  const e = normalize(email)
  return e === MASTER_ACCOUNT_EMAIL || e in AUSSIZZ_BRANCH_COMPANY_IDS
}

/**
 * Returns the deals this Aussizz email is allowed to see:
 *   - Master Account  -> deals from every branch, merged and deduplicated
 *   - A branch login   -> deals from ONLY that branch's own company
 *   - Anything else     -> empty array (shouldn't be called unless
 *                          isAussizzEmail() was true first)
 */
export async function getAussizzDeals(email: string): Promise<Deal[]> {
  const e = normalize(email)

  if (e === MASTER_ACCOUNT_EMAIL) {
    const allCompanyIds = Object.values(AUSSIZZ_BRANCH_COMPANY_IDS)
    const perBranchResults = await Promise.all(
      allCompanyIds.map(id => fetchDealsByCompanyId(id))
    )
    const seen = new Set<string>()
    const merged: Deal[] = []
    for (const branchDeals of perBranchResults) {
      for (const deal of branchDeals) {
        if (!seen.has(deal.id)) {
          seen.add(deal.id)
          merged.push(deal)
        }
      }
    }
    return merged
  }

  const companyId = AUSSIZZ_BRANCH_COMPANY_IDS[e]
  if (!companyId) return []
  return fetchDealsByCompanyId(companyId)
}

// ─────────────────────────────────────────────────────────────────────────────
// WIRE-IN SNIPPET for src/pages/ApplicationsPage.tsx — the only other file
// that needs a change. Add the import at the top:
//
//   import { isAussizzEmail, getAussizzDeals } from "../lib/aussizz"
//
// Then, wherever the page currently does something like:
//
//   const d = await fetchDealsByCompanyId(companyId)
//
// change it to:
//
//   const d = isAussizzEmail(user.email)
//     ? await getAussizzDeals(user.email)
//     : await fetchDealsByCompanyId(companyId)
//
// That's the entire integration — no other existing line needs to change.
// ─────────────────────────────────────────────────────────────────────────────
