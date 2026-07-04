// ─────────────────────────────────────────────────────────────────────────────
// dealFiles.ts
//
// Standalone helper: fetches files DIRECTLY ASSOCIATED with a deal in HubSpot
// (the CRM file associations behind the `HubSpot-Deals/{dealId}` File Manager
// folder — form uploads, staff-added files, script imports).
//
// This is intentionally isolated from hubspot.ts so it can't break the existing
// note/upload file logic. It is best-effort: on ANY failure it returns [] rather
// than throwing, and it never redirects to /login (uses a plain proxy fetch, not
// the redirecting hsFetch). Deduping against existing files is the caller's job.
//
// Usage in ApplicationDetailPage (or wherever fetchFiles is called):
//
//   import { fetchDealAssociatedFiles } from "../lib/dealFiles"
//   ...
//   const [noteFiles, dealFiles] = await Promise.all([
//     fetchFiles(id),
//     fetchDealAssociatedFiles(id),
//   ])
//   // merge + dedupe by fileId:
//   const seen = new Set(noteFiles.map(f => f.id))
//   const merged = [...noteFiles, ...dealFiles.filter(f => !seen.has(f.id))]
//   setFiles(merged)
// ─────────────────────────────────────────────────────────────────────────────

export interface DealFile {
  name: string
  id: string
  url: string
  createdAt: number
}

/**
 * Fetch files directly associated with a deal.
 * @param dealId  The HubSpot deal ID.
 * @returns       Array of files (may be empty). Never throws.
 */
export async function fetchDealAssociatedFiles(dealId: string): Promise<DealFile[]> {
  if (!dealId) return []

  try {
    const sessionToken = sessionStorage.getItem("holmes_session_token") || ""
    const q = (path: string) =>
      `/.netlify/functions/hubspot?path=${encodeURIComponent(path)}${
        sessionToken ? `&sessionToken=${encodeURIComponent(sessionToken)}` : ""
      }`

    // 1. Which files are associated to this deal? (per-deal — no cross-agency leak)
    const assocRes = await fetch(q(`/crm/v3/objects/deals/${dealId}/associations/files`), {
      headers: { "Content-Type": "application/json" },
    })
    if (!assocRes.ok) return []

    const assocData = await assocRes.json()
    const fileIds: string[] = (assocData?.results || [])
      .map((r: any) => String(r?.id || r?.toObjectId || ""))
      .filter((id: string) => !!id)

    if (fileIds.length === 0) return []

    // 2. Fetch each file's metadata for a display name (cap to avoid huge deals).
    const files = await Promise.all(
      fileIds.slice(0, 100).map(async (fid: string): Promise<DealFile> => {
        const fallback: DealFile = {
          name: "Document",
          id: fid,
          url: `/.netlify/functions/download-file?fileId=${fid}&dealId=${dealId}`,
          createdAt: Date.now(),
        }
        try {
          const metaRes = await fetch(q(`/files/v3/files/${fid}`), {
            headers: { "Content-Type": "application/json" },
          })
          if (!metaRes.ok) return fallback
          const fd = await metaRes.json()
          let name = fd?.name || "Document"
          const ext = fd?.extension ? String(fd.extension).toLowerCase() : ""
          if (ext && !name.toLowerCase().endsWith("." + ext)) name = name + "." + fd.extension
          return {
            name,
            id: fid,
            url: `/.netlify/functions/download-file?fileId=${fid}&dealId=${dealId}`,
            createdAt: fd?.createdAt ? new Date(fd.createdAt).getTime() : Date.now(),
          }
        } catch {
          return fallback
        }
      })
    )

    return files
  } catch {
    // Best-effort: never break the caller's file list.
    return []
  }
}
