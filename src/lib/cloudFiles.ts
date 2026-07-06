// ─────────────────────────────────────────────────────────────────────────────
// cloudFiles.ts
//
// Standalone helper: fetches files uploaded to CloudFiles' connected cloud
// storage (OneDrive, Google Drive, SharePoint, etc.) for a deal. These files
// never touch HubSpot's Files API, so they're completely unaffected by
// HubSpot's sensitive-data restrictions.
//
// Intentionally isolated (same pattern as dealFiles.ts) so it can't break the
// existing note/upload file logic. Best-effort: on ANY failure it returns []
// rather than throwing. Deduping against existing files is the caller's job.
//
// Usage in ApplicationDetailPage (alongside fetchFiles / fetchDealAssociatedFiles):
//
//   import { fetchCloudFilesAttachments } from "../lib/cloudFiles"
//   ...
//   const [noteFiles, dealFiles, cfFiles] = await Promise.all([
//     fetchFiles(id),
//     fetchDealAssociatedFiles(id),
//     fetchCloudFilesAttachments(id),
//   ])
//   // merge + dedupe by id (see ApplicationDetailPage for the actual merge)
// ─────────────────────────────────────────────────────────────────────────────

export interface CloudFilesFile {
  name: string
  id: string
  url: string
  createdAt: number
}

/**
 * Fetch CloudFiles-native files (not native HubSpot attachments) associated
 * with a deal.
 * @param dealId  The HubSpot deal ID.
 * @returns       Array of files (may be empty). Never throws.
 */
export async function fetchCloudFilesAttachments(dealId: string): Promise<CloudFilesFile[]> {
  if (!dealId) return []

  try {
    const sessionToken = sessionStorage.getItem("holmes_session_token") || ""
    const url = `/.netlify/functions/cloudfiles-files?dealId=${encodeURIComponent(dealId)}${
      sessionToken ? `&sessionToken=${encodeURIComponent(sessionToken)}` : ""
    }`

    const res = await fetch(url, { headers: { "Content-Type": "application/json" } })
    if (!res.ok) return []

    const data = await res.json()
    if (!Array.isArray(data)) return []

    return data
  } catch {
    // Best-effort: never break the caller's file list.
    return []
  }
}
