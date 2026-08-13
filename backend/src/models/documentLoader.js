import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { config } from "../config/index.js";

/**
 * Data-access layer for the document corpus: reads files from documents/ and
 * turns them into chunks with metadata. No embedding or Pinecone concerns here.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCUMENTS_DIR = path.join(__dirname, "..", "..", "documents");

/** Map a filename to a coarse section label used as chunk metadata. */
function sectionFor(filename) {
  const name = filename.toLowerCase();
  if (name.includes("cv")) return "experience";
  if (name.includes("project")) return "projects";
  if (name.includes("skill")) return "skills";
  return "general";
}

/** Read one file's full text, dispatching by extension. Returns null to skip. */
async function readDocumentText(filePath, ext) {
  if (ext === ".md" || ext === ".txt") {
    return readFile(filePath, "utf-8");
  }
  if (ext === ".pdf") {
    const loader = new PDFLoader(filePath);
    const pages = await loader.load();
    return pages.map((p) => p.pageContent).join("\n\n");
  }
  return null; // unsupported extension
}

/**
 * Load every supported file in documents/, split into overlapping chunks, and
 * attach { source, section, chunkIndex } metadata to each chunk.
 *
 * @returns {Promise<{ chunks: Array<{ pageContent: string, metadata: object }>, fileCount: number }>}
 */
export async function loadDocs() {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap,
  });

  const entries = await readdir(DOCUMENTS_DIR, { withFileTypes: true });
  const chunks = [];
  let fileCount = 0;

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue;

    const ext = path.extname(entry.name).toLowerCase();
    const filePath = path.join(DOCUMENTS_DIR, entry.name);

    const text = await readDocumentText(filePath, ext);
    if (text === null) continue; // skip unsupported types

    const trimmed = text.trim();
    if (!trimmed) continue; // skip empty files

    fileCount += 1;
    const section = sectionFor(entry.name);
    const pieces = await splitter.splitText(trimmed);

    pieces.forEach((pageContent, chunkIndex) => {
      chunks.push({
        pageContent,
        metadata: { source: entry.name, section, chunkIndex },
      });
    });
  }

  return { chunks, fileCount };
}
