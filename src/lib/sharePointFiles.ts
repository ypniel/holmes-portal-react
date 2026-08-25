// ─────────────────────────────────────────────────────────────────────────────
// sharePointFiles.ts
//
// Standalone helper: fetches files stored directly in SharePoint (via our own
// Microsoft Graph API connection) for a deal, keyed by its Application
// Reference. These files never touch HubSpot's Files API or CloudFiles, so
// they're completely unaffected by HubSpot's sensitive-data restrictions.
//
// Intentionally isolated (same pattern as dealFiles.ts / cloudFiles.ts) so it
// can't break the existing note/upload/CloudFiles file logic. Best-effort: on
// ANY failure it returns [] rather than throwing. Deduping against existing
// files is the caller's job.
//
// Usage in ApplicationDetailPage (alongside the other file sources):
//
//   import { fetchSharePointFiles } from "../lib/sharePointFiles"
//   ...
//   const [noteFiles, dealFiles, cfFiles, spFiles] = await Promise.all([
//     fetchFiles(id),
//     fetchDealAssociatedFiles(id),
//     fetchCloudFilesAttachments(id),
//     fetchSharePointFiles(applicationReference),
//   ])
// ─────────────────────────────────────────────────────────────────────────────

export interface SharePointFile {
  name: string
  id: string
  url: string
  createdAt: number
}

/**
 * Fetch files stored in SharePoint for a deal, keyed by Application Reference
 * (e.g. "HIA-38471") rather than dealId, since that's the folder-naming
 * convention used by sharepoint-upload.js / the migration script.
 * @param applicationReference  The deal's portal_application_reference.
 * @returns                     Array of files (may be empty). Never throws.
 */
export async function fetchSharePointFiles(
  applicationReference: string | undefined | null,
  dealId?: string | undefined | null
): Promise<SharePointFile[]> {
  // Deals with no real Application Reference had their files migrated under
  // Holmes-Deals/DEAL-{dealId}/ instead (matches the migration script's own
  // fallback). Without this same fallback here, migrated files for those
  // deals would never be found by the portal.
  const ref = (applicationReference && applicationReference.trim())
    ? applicationReference.trim()
    : (dealId ? `DEAL-${dealId}` : null)

  if (!ref) return []

  try {
    const url = `/.netlify/functions/sharepoint-files?action=list&applicationRef=${encodeURIComponent(ref)}`
    const res = await fetch(url, { headers: { "Content-Type": "application/json" } })
    if (!res.ok) return []

    const data = await res.json()
    if (!Array.isArray(data.files)) return []

    return data.files.map((f: any) => ({
      name: f.name || "Document",
      id: String(f.id),
      url: f.url,
      createdAt: f.createdAt ? new Date(f.createdAt).getTime() : Date.now(),
    }))
  } catch {
    // Best-effort: never break the caller's file list.
    return []
  }
}
