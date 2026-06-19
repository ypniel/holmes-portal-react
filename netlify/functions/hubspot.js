if (isDownload && fileId) {
  try {
    // Step 1: Get file metadata
    const metaRes = await fetch(
      `https://api.hubapi.com/files/v3/files/${fileId}`,
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
        },
      }
    );

    if (!metaRes.ok) {
      const error = await metaRes.text();
      console.error("HubSpot metadata error:", error);

      return {
        statusCode: metaRes.status,
        body: JSON.stringify({
          error: "Unable to retrieve file metadata",
        }),
      };
    }

    const meta = await metaRes.json();

    console.log("File metadata:", {
      id: meta.id,
      name: meta.name,
      access: meta.access,
    });

    // Step 2: Download file using the official endpoint
    let fileRes = await fetch(
      `https://api.hubapi.com/files/v3/files/${fileId}/download`,
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
        },
        redirect: "follow",
      }
    );

    // Fallback for older file types
    if (!fileRes.ok && meta.url) {
      console.log("Download endpoint failed, falling back to proxy URL");

      fileRes = await fetch(meta.url, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
        },
        redirect: "follow",
      });
    }

    if (!fileRes.ok) {
      const error = await fileRes.text();
      console.error("HubSpot file download failed:", error);

      return {
        statusCode: fileRes.status,
        body: JSON.stringify({
          error: "Unable to download file",
          details: error,
        }),
      };
    }

    const buffer = Buffer.from(await fileRes.arrayBuffer());

    return {
      statusCode: 200,
      headers: {
        "Content-Type":
          fileRes.headers.get("content-type") ||
          "application/octet-stream",

        "Content-Disposition": `inline; filename="${meta.name}.${meta.extension}"`,

        "Cache-Control": "private, max-age=3600",
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error("Download handler error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Unable to download file",
        details: error.message,
      }),
    };
  }
}
