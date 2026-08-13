import crypto from "node:crypto";
import { Document } from "@langchain/core/documents";
import { getVectorStore } from "../models/pineconeStore.js";
import { loadDocs } from "../models/documentLoader.js";

const md5 = (value) => crypto.createHash("md5").update(value).digest("hex");

/**
 * Ingestion business logic: load + chunk documents/, embed, and upsert to
 * Pinecone using deterministic IDs so re-running overwrites existing chunks
 * instead of creating duplicates.
 *
 * Shared by the CLI (ingest.js) and the POST /api/ingest controller.
 *
 * @returns {Promise<{ files: number, chunks: number }>}
 */
export async function ingestDocuments() {
  const { chunks, fileCount } = await loadDocs();

  if (chunks.length === 0) {
    return { files: fileCount, chunks: 0 };
  }

  const documents = chunks.map(
    ({ pageContent, metadata }) => new Document({ pageContent, metadata })
  );
  // Deterministic id: md5(source)-chunkIndex -> stable across re-ingests.
  const ids = chunks.map(
    ({ metadata }) => `${md5(metadata.source)}-${metadata.chunkIndex}`
  );

  const store = await getVectorStore();
  await store.addDocuments(documents, { ids });

  return { files: fileCount, chunks: chunks.length };
}
