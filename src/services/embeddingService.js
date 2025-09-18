const axios = require("axios");
const winston = require("winston");

// Create dedicated logger for embedding service
const embeddingLogger = winston.createLogger({
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

const JINA_API_URL = "https://api.jina.ai/v1/embeddings";
const JINA_MODEL = "jina-embeddings-v2-base-en";
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

/**
 * Generate embedding for a single text using Jina AI
 * @param {string} text - Text to embed
 * @returns {Array} Embedding vector
 */
async function generateEmbedding(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Text must be a non-empty string");
  }

  if (!process.env.JINA_API_KEY) {
    throw new Error("JINA_API_KEY environment variable is not set");
  }

  const cleanText = text.trim().substring(0, 8000); // Limit text length

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      embeddingLogger.info(
        `Generating embedding (attempt ${attempt}/${MAX_RETRIES})`,
        {
          textLength: cleanText.length,
          model: JINA_MODEL,
        }
      );

      // Fixed: Remove encoding_format parameter
      const response = await axios.post(
        JINA_API_URL,
        {
          model: JINA_MODEL,
          input: [cleanText],
          // Removed encoding_format: 'float' - this was causing the 422 error
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.JINA_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      if (!response.data?.data?.[0]?.embedding) {
        throw new Error("Invalid response format from Jina API");
      }

      const embedding = response.data.data[0].embedding;

      embeddingLogger.info("Embedding generated successfully", {
        embeddingDimension: embedding.length,
        tokensUsed: response.data.usage?.total_tokens || "unknown",
      });

      return embedding;
    } catch (error) {
      embeddingLogger.error(
        `Embedding generation failed (attempt ${attempt}/${MAX_RETRIES}):`,
        {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
        }
      );

      if (attempt === MAX_RETRIES) {
        throw new Error(
          `Failed to generate embedding after ${MAX_RETRIES} attempts: ${error.message}`
        );
      }

      // Wait before retrying
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAY * attempt)
      );
    }
  }
}

/**
 * Generate embeddings for multiple texts in batch
 * @param {Array} texts - Array of texts to embed
 * @param {number} batchSize - Batch size for processing
 * @returns {Array} Array of embedding vectors
 */
async function generateBatchEmbeddings(texts, batchSize = 10) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error("Texts must be a non-empty array");
  }

  embeddingLogger.info(`Starting batch embedding generation`, {
    totalTexts: texts.length,
    batchSize,
    model: JINA_MODEL,
  });

  const allEmbeddings = [];
  let processedCount = 0;

  // Process in smaller batches to avoid rate limits
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const cleanBatch = batch.map((text) =>
      typeof text === "string"
        ? text.trim().substring(0, 8000)
        : String(text).substring(0, 8000)
    );

    try {
      embeddingLogger.info(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          texts.length / batchSize
        )}`,
        {
          batchStart: i,
          batchSize: batch.length,
        }
      );

      // Fixed: Remove encoding_format parameter
      const response = await axios.post(
        JINA_API_URL,
        {
          model: JINA_MODEL,
          input: cleanBatch,
          // Removed encoding_format: 'float'
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.JINA_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 60000,
        }
      );

      if (!response.data?.data || !Array.isArray(response.data.data)) {
        throw new Error("Invalid batch response format from Jina API");
      }

      const batchEmbeddings = response.data.data.map((item) => item.embedding);
      allEmbeddings.push(...batchEmbeddings);
      processedCount += batch.length;

      embeddingLogger.info(`Batch completed`, {
        processedCount,
        totalTexts: texts.length,
        tokensUsed: response.data.usage?.total_tokens || "unknown",
      });

      // Rate limiting delay between batches
      if (i + batchSize < texts.length) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Increased delay
      }
    } catch (error) {
      embeddingLogger.error(
        `Batch embedding failed for batch starting at index ${i}:`,
        {
          message: error.message,
          batchStart: i,
          batchSize: batch.length,
        }
      );

      // Try individual embeddings for failed batch
      embeddingLogger.info(
        "Attempting individual embeddings for failed batch..."
      );
      for (const text of batch) {
        try {
          const embedding = await generateEmbedding(text);
          allEmbeddings.push(embedding);
          processedCount++;

          // Delay between individual requests
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (individualError) {
          embeddingLogger.error(
            "Individual embedding also failed:",
            individualError.message
          );
          // Use zero vector as fallback
          allEmbeddings.push(new Array(768).fill(0));
          processedCount++;
        }
      }
    }
  }

  embeddingLogger.info(`Batch embedding generation completed`, {
    totalProcessed: processedCount,
    successfulEmbeddings: allEmbeddings.length,
    averageEmbeddingLength:
      allEmbeddings.length > 0 ? allEmbeddings[0].length : 0,
  });

  return allEmbeddings;
}

/**
 * Test Jina API connection
 */
async function testJinaConnection() {
  try {
    embeddingLogger.info("Testing Jina API connection...");

    const testEmbedding = await generateEmbedding("Hello world test");

    embeddingLogger.info("✅ Jina API connection successful", {
      embeddingDimension: testEmbedding.length,
      sampleValues: testEmbedding.slice(0, 5),
    });

    return true;
  } catch (error) {
    embeddingLogger.error("❌ Jina API connection failed:", error.message);
    return false;
  }
}

module.exports = {
  generateEmbedding,
  generateBatchEmbeddings,
  testJinaConnection,
  JINA_MODEL,
};
