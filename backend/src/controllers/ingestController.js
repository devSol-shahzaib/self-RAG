import { ingestDocuments } from "../services/ingestService.js";

/** POST /api/ingest — re-run ingestion over documents/. */
export async function runIngest(_req, res) {
  try {
    const { files, chunks } = await ingestDocuments();
    return res.json({ files, chunks });
  } catch (err) {
    console.error("Error handling /api/ingest:", err);
    return res.status(500).json({ error: "Ingestion failed." });
  }
}
