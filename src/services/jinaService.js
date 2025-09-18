const axios = require("axios");
const winston = require("winston");

// Create dedicated logger
const jinaLogger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// Jina AI configuration
const JINA_CONFIG = {
  apiKey: process.env.JINA_API_KEY,
  baseURL: "https://api.jina.ai/v1/embeddings",
  model: "jina-embeddings-v2-base-en",
  timeout: 15000,
};

/**
 * Create Jina API client
 */
const createJinaClient = () => {
  return axios.create({
    baseURL: JINA_CONFIG.baseURL,
    timeout: JINA_CONFIG.timeout,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${JINA_CONFIG.apiKey}`,
    },
  });
};

/**
 * Generate embedding using Jina AI
 */
const generateEmbedding = async (text, maxRetries = 2) => {
  try {
    jinaLogger.info("Generating embedding", {
      textLength: text?.length,
      model: JINA_CONFIG.model,
    });

    // Check if Jina API is configured
    if (!JINA_CONFIG.apiKey) {
      jinaLogger.warn("Jina API key not configured, using mock embedding");
      return generateMockEmbedding(text);
    }

    const client = createJinaClient();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await client.post("", {
          model: JINA_CONFIG.model,
          input: [text.substring(0, 8192)], // Limit input length
          encoding_format: "float",
        });

        if (response.data && response.data.data && response.data.data[0]) {
          const embedding = response.data.data[0].embedding;
          jinaLogger.info("Embedding generated successfully", {
            embeddingLength: embedding.length,
            attempt,
          });
          return embedding;
        }

        throw new Error("Invalid response format from Jina API");
      } catch (error) {
        jinaLogger.error(`Jina embedding attempt ${attempt} failed:`, {
          error: error.message,
          status: error.response?.status,
        });

        if (
          attempt === maxRetries ||
          (error.response?.status && error.response.status < 500)
        ) {
          throw error;
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  } catch (error) {
    jinaLogger.error("Jina embedding generation failed:", {
      error: error.message,
      textLength: text?.length,
    });

    // Return mock embedding on error
    jinaLogger.info("Returning mock embedding due to Jina error");
    return generateMockEmbedding(text);
  }
};

/**
 * Generate mock embedding for development/fallback
 */
const generateMockEmbedding = (text) => {
  jinaLogger.info("Generating mock embedding", {
    textLength: text?.length,
  });

  // Create a deterministic but varied embedding based on text content
  const hash = simpleHash(text);
  const embedding = [];

  for (let i = 0; i < 768; i++) {
    // Standard embedding size
    const seed = hash + i;
    const value =
      (Math.sin(seed) * Math.cos(seed * 0.7) + Math.sin(seed * 1.3)) / 2;
    embedding.push(value);
  }

  return embedding;
};

/**
 * Simple hash function for consistent mock embeddings
 */
const simpleHash = (str) => {
  let hash = 0;
  if (str.length === 0) return hash;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash);
};

/**
 * Generate embeddings for multiple texts
 */
const generateBatchEmbeddings = async (texts, batchSize = 10) => {
  try {
    jinaLogger.info(`Generating embeddings for ${texts.length} texts`);

    const embeddings = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchPromises = batch.map((text) => generateEmbedding(text));
      const batchEmbeddings = await Promise.all(batchPromises);
      embeddings.push(...batchEmbeddings);

      jinaLogger.info(
        `Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          texts.length / batchSize
        )}`
      );

      // Small delay to avoid rate limiting
      if (i + batchSize < texts.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return embeddings;
  } catch (error) {
    jinaLogger.error("Batch embedding generation failed:", error.message);
    throw error;
  }
};

/**
 * Health check for Jina service
 */
const healthCheck = async () => {
  try {
    if (!JINA_CONFIG.apiKey) {
      return {
        status: "not_configured",
        message: "Jina API key not configured",
      };
    }

    // Test with a simple embedding
    const testEmbedding = await generateEmbedding("test", 1);

    return {
      status: testEmbedding ? "healthy" : "error",
      model: JINA_CONFIG.model,
      embeddingSize: testEmbedding?.length || 0,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
    };
  }
};

/**
 * Calculate cosine similarity between two embeddings
 */
const cosineSimilarity = (embedding1, embedding2) => {
  if (embedding1.length !== embedding2.length) {
    throw new Error("Embeddings must have the same length");
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  const magnitude1 = Math.sqrt(norm1);
  const magnitude2 = Math.sqrt(norm2);

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
};

module.exports = {
  generateEmbedding,
  generateBatchEmbeddings,
  generateMockEmbedding,
  healthCheck,
  cosineSimilarity,
};
