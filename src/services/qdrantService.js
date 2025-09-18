const axios = require("axios");
const winston = require("winston");

// Create dedicated logger
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

// Qdrant configuration
const QDRANT_CONFIG = {
  url: process.env.QDRANT_URL || "https://your-qdrant-cluster.qdrant.tech",
  apiKey: process.env.QDRANT_API_KEY,
  collectionName: process.env.QDRANT_COLLECTION || "news_articles",
  timeout: 10000,
};

/**
 * Create Qdrant HTTP client
 */
const createQdrantClient = () => {
  const headers = {
    "Content-Type": "application/json",
  };

  if (QDRANT_CONFIG.apiKey) {
    headers["api-key"] = QDRANT_CONFIG.apiKey;
  }

  return axios.create({
    baseURL: QDRANT_CONFIG.url,
    timeout: QDRANT_CONFIG.timeout,
    headers,
  });
};

/**
 * Search vectors in Qdrant
 */
const searchVectors = async (queryVector, limit = 5, scoreThreshold = 0.7) => {
  try {
    qdrantLogger.info("Searching vectors in Qdrant", {
      limit,
      scoreThreshold,
      vectorLength: queryVector?.length,
    });

    // Check if Qdrant is configured
    if (!QDRANT_CONFIG.url || !QDRANT_CONFIG.apiKey) {
      qdrantLogger.warn("Qdrant not configured, using mock data");
      return getMockSearchResults();
    }

    const client = createQdrantClient();

    const searchPayload = {
      vector: queryVector,
      limit: limit,
      score_threshold: scoreThreshold,
      with_payload: true,
      with_vector: false,
    };

    const response = await client.post(
      `/collections/${QDRANT_CONFIG.collectionName}/points/search`,
      searchPayload
    );

    if (response.data && response.data.result) {
      qdrantLogger.info(
        `Found ${response.data.result.length} matching documents`
      );

      // Transform results to expected format
      return response.data.result.map((result) => ({
        id: result.id,
        score: result.score,
        payload: result.payload || {},
      }));
    }

    return [];
  } catch (error) {
    qdrantLogger.error("Qdrant search failed:", {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });

    // Return mock data on error
    qdrantLogger.info("Returning mock search results due to Qdrant error");
    return getMockSearchResults();
  }
};

/**
 * Mock search results for development/fallback
 */
const getMockSearchResults = () => {
  const mockArticles = [
    {
      id: "mock-1",
      score: 0.85,
      payload: {
        title: "Flying cars crash into each other at Chinese air show",
        source: "BBC News",
        url: "https://www.bbc.com/news/technology-flying-cars",
        content:
          "Two flying cars collided during a demonstration at an air show in China, raising concerns about the safety and regulation of flying car technology. The incident occurred during a rehearsal for an air show, with both vehicles crashing to the ground. No injuries were reported, but the accident has prompted calls for stricter safety protocols in the emerging flying car industry.",
        snippet:
          "Two flying cars collided during a demonstration at an air show in China...",
        publishedAt: "2025-09-17T10:30:00Z",
        category: "technology",
      },
    },
    {
      id: "mock-2",
      score: 0.82,
      payload: {
        title: "US tennis star sorry for offensive comments on Chinese food",
        source: "BBC News",
        url: "https://www.bbc.com/sport/tennis-controversy",
        content:
          "A prominent US tennis player has issued a public apology after making controversial comments about Chinese food during a press conference. The remarks, which were widely criticized as culturally insensitive, sparked outrage on social media and prompted calls for the player to be sanctioned.",
        snippet:
          "A prominent US tennis player has issued a public apology after making controversial comments...",
        publishedAt: "2025-09-17T14:20:00Z",
        category: "sports",
      },
    },
    {
      id: "mock-3",
      score: 0.79,
      payload: {
        title: "Madeleine McCann suspect freed from German prison",
        source: "BBC News",
        url: "https://www.bbc.com/news/uk-madeleine-mccann",
        content:
          "Christian Brückner, the prime suspect in the Madeleine McCann disappearance case, has been released from a German prison after serving his sentence for an unrelated rape conviction. His release has reignited public interest in the long-unsolved case.",
        snippet:
          "Christian Brückner, the prime suspect in the Madeleine McCann disappearance case...",
        publishedAt: "2025-09-17T16:45:00Z",
        category: "crime",
      },
    },
    {
      id: "mock-4",
      score: 0.76,
      payload: {
        title: "AI can forecast your future health – just like the weather",
        source: "BBC News",
        url: "https://www.bbc.com/news/technology-ai-health",
        content:
          "Researchers have developed an AI system that can predict future health conditions with accuracy similar to weather forecasting. The system analyzes various health indicators and lifestyle factors to provide personalized health predictions.",
        snippet:
          "Researchers have developed an AI system that can predict future health conditions...",
        publishedAt: "2025-09-17T12:15:00Z",
        category: "technology",
      },
    },
    {
      id: "mock-5",
      score: 0.73,
      payload: {
        title:
          "Search for ancient Egyptian gold bracelet missing from Cairo museum",
        source: "BBC News",
        url: "https://www.bbc.com/news/world-middle-east-egypt",
        content:
          "Egyptian authorities have launched an investigation after a 3,000-year-old gold bracelet went missing from the Egyptian Museum in Cairo. The artifact, dating back to the reign of King Amenemhope, vanished from the museum's restoration laboratory.",
        snippet:
          "Egyptian authorities have launched an investigation after a 3,000-year-old gold bracelet...",
        publishedAt: "2025-09-17T09:30:00Z",
        category: "culture",
      },
    },
  ];

  return mockArticles;
};

/**
 * Insert documents into Qdrant (for data ingestion)
 */
const insertDocuments = async (documents) => {
  try {
    if (!QDRANT_CONFIG.url || !QDRANT_CONFIG.apiKey) {
      qdrantLogger.warn("Qdrant not configured, skipping document insertion");
      return { success: false, message: "Qdrant not configured" };
    }

    const client = createQdrantClient();

    const points = documents.map((doc) => ({
      id: doc.id || Date.now() + Math.random(),
      vector: doc.vector,
      payload: doc.payload,
    }));

    const response = await client.put(
      `/collections/${QDRANT_CONFIG.collectionName}/points`,
      {
        points: points,
      }
    );

    qdrantLogger.info(`Inserted ${points.length} documents into Qdrant`);
    return { success: true, inserted: points.length };
  } catch (error) {
    qdrantLogger.error("Failed to insert documents:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Health check for Qdrant service
 */
const healthCheck = async () => {
  try {
    if (!QDRANT_CONFIG.url) {
      return {
        status: "not_configured",
        message: "Qdrant URL not configured",
      };
    }

    const client = createQdrantClient();
    const response = await client.get("/");

    return {
      status: "healthy",
      version: response.data?.version || "unknown",
      collections: await getCollectionInfo(),
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
    };
  }
};

/**
 * Get collection information
 */
const getCollectionInfo = async () => {
  try {
    const client = createQdrantClient();
    const response = await client.get(
      `/collections/${QDRANT_CONFIG.collectionName}`
    );

    return {
      name: QDRANT_CONFIG.collectionName,
      status: response.data?.result?.status || "unknown",
      points_count: response.data?.result?.points_count || 0,
    };
  } catch (error) {
    return {
      name: QDRANT_CONFIG.collectionName,
      status: "error",
      error: error.message,
    };
  }
};

module.exports = {
  searchVectors,
  insertDocuments,
  healthCheck,
  getCollectionInfo,
  getMockSearchResults,
};
