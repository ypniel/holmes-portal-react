  // ── File download by ID ─────────────────────────────────────────────────────
  if (isDownload && fileId) {
    try {
      let meta = {}

      const metaResult = await makeRequest({
        hostname: "api.hubapi.com",
        path: `/files/v3/files/${fileId}`,
        method: "GET",
        headers: {
          "Authorization": `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      })

      if (metaResult.status >= 200 && metaResult.status < 300) {
        meta = JSON.parse(metaResult.body.toString())
      }

      // Use the official download endpoint first.
      // This is the important bit for HIDDEN_SENSITIVE CRM property files.
      let fileResult = await makeRequest({
        hostname: "api.hubapi.com",
        path: `/files/v3/files/${fileId}/download`,
        method: "GET",
        headers: {
          "Authorization": `Bearer ${TOKEN}`,
        },
      })

      // If HubSpot returns a redirect, follow it server-side.
      if (fileResult.status >= 300 && fileResult.status < 400 && fileResult.headers.location) {
        const redirectUrl = new URL(fileResult.headers.location)

        fileResult = await makeRequest({
          hostname: redirectUrl.hostname,
          path: `${redirectUrl.pathname}${redirectUrl.search}`,
          method: "GET",
          headers: {},
        })
      }

      // Fallback only if the official download endpoint fails.
      if ((fileResult.status < 200 || fileResult.status >= 300) && meta.url) {
        const parsedUrl = new URL(meta.url)

        fileResult = await makeRequest({
          hostname: parsedUrl.hostname,
          path: `${parsedUrl.pathname}${parsedUrl.search}`,
          method: "GET",
          headers: {
            "Authorization": `Bearer ${TOKEN}`,
          },
        })
      }

      if (fileResult.status < 200 || fileResult.status >= 300) {
        console.error("HubSpot file download failed", {
          fileId,
          status: fileResult.status,
          body: fileResult.body.toString(),
        })

        return {
          statusCode: fileResult.status || 500,
          headers: corsHeaders,
          body: "Unable to download file",
        }
      }

      const extension = meta.extension ? String(meta.extension) : ""
      const baseName = meta.name ? String(meta.name) : "document"
      const fileName =
        extension && !baseName.toLowerCase().endsWith(`.${extension.toLowerCase()}`)
          ? `${baseName}.${extension}`
          : baseName

      const contentType =
        fileResult.headers["content-type"] ||
        meta.mimeType ||
        (meta.encoding ? `image/${meta.encoding}` : null) ||
        "application/octet-stream"

      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
          "Cache-Control": "private, max-age=300",
        },
        body: fileResult.body.toString("base64"),
        isBase64Encoded: true,
      }
    } catch (err) {
      console.error("Download handler error", err)

      return {
        statusCode: 500,
        headers: corsHeaders,
        body: "Unable to download file",
      }
    }
  }
