import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import { config } from "../config/index.js";

/**
 * Data-access layer for the vector store. Owns the Pinecone client and exposes
 * a ready-to-use PineconeStore for both ingestion (upsert) and retrieval.
 *
 * The embedding model is fixed to text-embedding-3-small (1536 dims), so the
 * Pinecone index must be created with 1536 dimensions and the cosine metric.
 */

let pineconeClient;

function getPineconeClient() {
  if (!pineconeClient) {
    if (!config.pineconeApiKey) throw new Error("PINECONE_API_KEY is not set");
    pineconeClient = new Pinecone({ apiKey: config.pineconeApiKey });
  }
  return pineconeClient;
}

function getEmbeddings() {
  return new OpenAIEmbeddings({ model: config.embeddingModel });
}

function getIndex() {
  if (!config.pineconeIndex) throw new Error("PINECONE_INDEX is not set");
  return getPineconeClient().Index(config.pineconeIndex);
}

/** Vector store bound to the configured index, for search + upsert. */
export async function getVectorStore() {
  return PineconeStore.fromExistingIndex(getEmbeddings(), {
    pineconeIndex: getIndex(),
  });
}
