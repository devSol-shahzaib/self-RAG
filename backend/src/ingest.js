import "./config/index.js"; // side effect: loads .env before clients construct
import { ingestDocuments } from "./services/ingestService.js";

/** One-off CLI: load, chunk, embed, and upsert everything in documents/. */
async function main() {
  const { files, chunks } = await ingestDocuments();
  if (chunks === 0) {
    console.log("No supported documents found in documents/ — nothing ingested.");
    return;
  }
  console.log(`Ingested ${chunks} chunks from ${files} files.`);
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
