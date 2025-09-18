const { QdrantClient } = require("@qdrant/js-client-rest");
const winston = require("winston");

// Create dedicated logger for Qdrant (avoid circular dependency)
const qdrantLogger = winston.createLogger({
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

let qdrantClient;
const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || "news_articles";

/**
 * Initialize Qdrant vector database
 */
const initializeQdrant = async () => {
  try {
    qdrantLogger.info("Initializing Qdrant client...");

    qdrantClient = new QdrantClient({
      url: process.env.QDRANT_URL || "http://localhost:6333",
      apiKey: process.env.QDRANT_API_KEY,
      timeout: 30000,
    });

    // Test connection
    await qdrantClient.getCollections();
    qdrantLogger.info("✅ Connected to Qdrant successfully");

    // Check if collection exists
    try {
      const collection = await qdrantClient.getCollection(COLLECTION_NAME);
      qdrantLogger.info(`✅ Collection '${COLLECTION_NAME}' exists`, {
        pointsCount: collection.points_count,
        vectorSize: collection.config.params.vectors.size,
        distance: collection.config.params.vectors.distance,
      });
    } catch (error) {
      if (error.message.includes("Not found")) {
        qdrantLogger.info(`Creating new collection '${COLLECTION_NAME}'...`);

        await qdrantClient.createCollection(COLLECTION_NAME, {
          vectors: {
            size: 768, // Jina embeddings dimension
            distance: "Cosine", // Cosine similarity for semantic search
          },
          optimizers_config: {
            default_segment_number: 2,
          },
          replication_factor: 1,
        });

        qdrantLogger.info(`✅ Collection '${COLLECTION_NAME}' created`);
      } else {
        throw error;
      }
    }
  } catch (error) {
    qdrantLogger.error("Failed to initialize Qdrant:", error);
    throw new Error(`Qdrant initialization failed: ${error.message}`);
  }
};

/**
 * Insert documents into vector database
 */
const insertDocuments = async (documents) => {
  try {
    qdrantLogger.info(`Inserting ${documents.length} documents into Qdrant...`);

    // Prepare points for insertion
    const points = documents.map((doc, index) => ({
      id: doc.id || `doc_${Date.now()}_${index}`,
      vector: doc.embedding,
      payload: {
        title: doc.title,
        content: doc.content,
        url: doc.url,
        publishedDate: doc.publishedDate,
        source: doc.source,
        ingestionTimestamp: new Date().toISOString(),
        contentLength: doc.content.length,
      },
    }));

    // Insert in batches to avoid memory issues
    const batchSize = 100;
    let insertedCount = 0;

    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);

      await qdrantClient.upsert(COLLECTION_NAME, {
        wait: true,
        points: batch,
      });

      insertedCount += batch.length;
      qdrantLogger.info(
        `Inserted batch: ${insertedCount}/${points.length} documents`
      );
    }

    // Get collection info after insertion
    const collection = await qdrantClient.getCollection(COLLECTION_NAME);

    qdrantLogger.info(`✅ Successfully inserted ${insertedCount} documents`, {
      totalPointsInCollection: collection.points_count,
      collectionStatus: collection.status,
    });

    return {
      inserted: insertedCount,
      totalInCollection: collection.points_count,
    };
  } catch (error) {
    qdrantLogger.error("Failed to insert documents:", error);
    throw new Error(`Document insertion failed: ${error.message}`);
  }
};

/**
 * Search for similar documents using vector similarity
 */
const searchSimilarDocuments = async (
  queryEmbedding,
  topK = 5,
  filters = null
) => {
  try {
    qdrantLogger.info(`Searching for ${topK} similar documents...`);

    const searchParams = {
      vector: queryEmbedding,
      limit: topK,
      with_payload: true,
      with_vector: false,
      score_threshold: 0.3, // Minimum similarity threshold
    };

    // Add filters if provided
    if (filters) {
      searchParams.filter = filters;
    }

    const searchResult = await qdrantClient.search(
      COLLECTION_NAME,
      searchParams
    );

    qdrantLogger.info(`Found ${searchResult.length} documents`, {
      topK,
      actualResults: searchResult.length,
      scoreRange:
        searchResult.length > 0
          ? `${Math.min(...searchResult.map((r) => r.score)).toFixed(
              3
            )} - ${Math.max(...searchResult.map((r) => r.score)).toFixed(3)}`
          : "N/A",
    });

    return searchResult;
  } catch (error) {
    qdrantLogger.error("Search failed:", error);
    throw new Error(`Vector search failed: ${error.message}`);
  }
};

/**
 * Get collection statistics
 */
const getCollectionStats = async () => {
  try {
    const collection = await qdrantClient.getCollection(COLLECTION_NAME);

    return {
      name: COLLECTION_NAME,
      pointsCount: collection.points_count,
      status: collection.status,
      vectorSize: collection.config.params.vectors.size,
      distance: collection.config.params.vectors.distance,
      indexes: collection.payload_schema || {},
    };
  } catch (error) {
    qdrantLogger.error("Failed to get collection stats:", error);
    throw error;
  }
};

/**
 * Get Qdrant client instance
 */
const getQdrantClient = () => {
  if (!qdrantClient) {
    throw new Error(
      "Qdrant client not initialized. Call initializeQdrant() first."
    );
  }
  return qdrantClient;
};

module.exports = {
  initializeQdrant,
  insertDocuments,
  searchSimilarDocuments,
  getCollectionStats,
  getQdrantClient,
};
