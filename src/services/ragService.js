const { GoogleGenerativeAI } = require("@google/generative-ai");
const winston = require("winston");

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Create dedicated logger
const ragLogger = winston.createLogger({
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

// Import services
const { searchVectors } = require("./qdrantService");
const { generateEmbedding } = require("./jinaService");

/**
 * Validate and clean user query
 */
const validateQuery = (query) => {
  if (!query || typeof query !== "string") {
    return {
      valid: false,
      error: "Query must be a non-empty string",
    };
  }

  const cleanQuery = query.trim();

  if (cleanQuery.length < 3) {
    return {
      valid: false,
      error: "Query is too short (minimum 3 characters)",
    };
  }

  if (cleanQuery.length > 1000) {
    return {
      valid: false,
      error: "Query is too long (maximum 1000 characters)",
    };
  }

  return {
    valid: true,
    query: cleanQuery,
  };
};

/**
 * Enhanced Gemini generation with retry logic and fallbacks
 */
const generateWithGemini = async (
  prompt,
  maxRetries = 3,
  retryDelay = 2000
) => {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
    },
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
    ],
  });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      ragLogger.info(`Gemini generation attempt ${attempt}/${maxRetries}`);

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      if (text && text.length > 10) {
        ragLogger.info(`Gemini generation successful on attempt ${attempt}`);
        return text;
      } else {
        throw new Error("Empty or invalid response from Gemini");
      }
    } catch (error) {
      ragLogger.error(`Gemini attempt ${attempt} failed:`, {
        error: error.message,
        code: error.code || "UNKNOWN",
        status: error.status || "UNKNOWN",
      });

      // Check if it's a rate limit or overload error
      if (
        error.message.includes("503") ||
        error.message.includes("overloaded") ||
        error.message.includes("quota") ||
        error.message.includes("rate limit")
      ) {
        if (attempt < maxRetries) {
          const delay = retryDelay * attempt; // Exponential backoff
          ragLogger.info(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }

      // If it's the last attempt or non-retryable error, throw
      if (attempt === maxRetries) {
        throw error;
      }
    }
  }
};

/**
 * Generate fallback response when Gemini fails
 */
const generateFallbackResponse = (query, documents) => {
  const fallbackTemplates = [
    {
      keywords: ["yesterday", "recent", "latest", "today", "news"],
      template: `I apologize, but I'm currently experiencing high load and cannot generate a detailed response. However, based on your query about "${query}", here are some relevant sources I found:

{sources}

For the most up-to-date information, I recommend checking these news sources directly. Please try your question again in a moment when the system load is lighter.`,
    },
    {
      keywords: ["technology", "tech", "ai", "artificial intelligence"],
      template: `I'm currently experiencing high demand and cannot provide a full analysis. Your question about "${query}" relates to technology news. Here are relevant sources I found:

{sources}

These sources contain the latest information on your topic. Please try again shortly for a more detailed AI-generated response.`,
    },
    {
      keywords: ["business", "market", "finance", "economic"],
      template: `Due to high system load, I cannot provide a detailed business analysis right now. However, I found relevant sources for your query "${query}":

{sources}

For current business and financial news, please check these sources directly. Try asking again in a few moments.`,
    },
  ];

  // Find matching template
  const matchedTemplate = fallbackTemplates.find((template) =>
    template.keywords.some((keyword) =>
      query.toLowerCase().includes(keyword.toLowerCase())
    )
  );

  const selectedTemplate = matchedTemplate || {
    template: `I apologize, but due to high system demand, I cannot generate a detailed response for "${query}" right now. Here are relevant sources I found:

{sources}

Please check these sources for information and try your question again shortly.`,
  };

  // Format sources
  let sourcesText = "";
  if (documents && documents.length > 0) {
    sourcesText = documents
      .map(
        (doc, index) =>
          `${index + 1}. ${doc.payload.title} (${doc.payload.source})\n   ${
            doc.payload.snippet || "No preview available"
          }`
      )
      .join("\n\n");
  } else {
    sourcesText =
      "No specific sources found, but you can check major news outlets for the latest information.";
  }

  return selectedTemplate.template.replace("{sources}", sourcesText);
};

/**
 * Main RAG response generation with enhanced error handling
 */
const generateRAGResponse = async (query, sessionId) => {
  const startTime = Date.now();

  try {
    ragLogger.info("Starting RAG response generation", {
      query: query.substring(0, 100),
      sessionId,
      timestamp: new Date().toISOString(),
    });

    // Validate query
    const validation = validateQuery(query);
    if (!validation.valid) {
      throw new Error(`Invalid query: ${validation.error}`);
    }

    // Generate embedding
    ragLogger.info("Generating embedding for query");
    const embedding = await generateEmbedding(validation.query);

    if (!embedding || !Array.isArray(embedding)) {
      throw new Error("Failed to generate embedding for query");
    }

    // Search for relevant documents
    ragLogger.info("Searching for relevant documents");
    const searchResults = await searchVectors(embedding, 5); // Get top 5 results

    let relevantDocs = [];
    if (searchResults && searchResults.length > 0) {
      relevantDocs = searchResults.filter((result) => result.score > 0.7); // Filter by relevance
      ragLogger.info(`Found ${relevantDocs.length} relevant documents`);
    }

    // Prepare context from documents
    let context = "";
    let sources = [];

    if (relevantDocs.length > 0) {
      context = relevantDocs
        .map((doc, index) => {
          const payload = doc.payload || {};
          sources.push({
            title: payload.title || "Untitled",
            source: payload.source || "Unknown Source",
            url: payload.url || "#",
            snippet:
              payload.snippet || payload.content?.substring(0, 150) || "",
            relevanceScore: doc.score || 0,
            publishedAt: payload.publishedAt || null,
          });

          return `Source ${index + 1}: ${payload.title || "Untitled"}
Content: ${payload.content || payload.snippet || "No content available"}
Published: ${payload.publishedAt || "Unknown date"}`;
        })
        .join("\n\n");
    }

    // Create enhanced prompt
    const systemPrompt = `You are a helpful news assistant that provides accurate, up-to-date information based on reliable sources. 
    
Instructions:
- Answer the user's question using only the provided context
- Be informative and comprehensive
- If the context doesn't fully answer the question, acknowledge this
- Maintain a professional, journalistic tone
- Focus on factual information
- Don't make up information not in the sources

Context from news sources:
${context || "No specific recent news found for this query."}

User Question: ${validation.query}

Please provide a helpful response based on the available information:`;

    try {
      // Try to generate response with Gemini (with retries)
      ragLogger.info("Generating response with Gemini");
      const aiResponse = await generateWithGemini(systemPrompt);

      const processingTime = Date.now() - startTime;

      ragLogger.info("RAG response generated successfully", {
        processingTime,
        sourcesCount: sources.length,
        responseLength: aiResponse?.length || 0,
      });

      return {
        answer: aiResponse,
        sources: sources,
        metadata: {
          processingTime,
          documentsFound: relevantDocs.length,
          sourcesUsed: sources.length,
          queryLength: validation.query.length,
          modelUsed: "gemini-1.5-flash",
          timestamp: new Date().toISOString(),
        },
      };
    } catch (geminiError) {
      // Gemini failed, use fallback response
      ragLogger.error("Gemini generation failed, using fallback", {
        error: geminiError.message,
        query: validation.query.substring(0, 50),
      });

      const fallbackResponse = generateFallbackResponse(
        validation.query,
        relevantDocs
      );
      const processingTime = Date.now() - startTime;

      return {
        answer: fallbackResponse,
        sources: sources,
        metadata: {
          processingTime,
          documentsFound: relevantDocs.length,
          sourcesUsed: sources.length,
          modelUsed: "fallback-template",
          error: "AI model temporarily unavailable",
          timestamp: new Date().toISOString(),
        },
      };
    }
  } catch (error) {
    const processingTime = Date.now() - startTime;

    ragLogger.error("RAG generation failed completely", {
      error: error.message,
      stack: error.stack,
      processingTime,
      query: query.substring(0, 50),
      sessionId,
    });

    // Return generic fallback
    return {
      answer: `I apologize, but I'm currently experiencing technical difficulties and cannot provide a detailed response to your question "${query}". This might be due to:

• High system load on AI services
• Temporary API limitations  
• Network connectivity issues

Please try:
1. Asking a simpler or different question
2. Trying again in a few minutes
3. Checking major news websites directly for the latest information

Thank you for your patience!`,
      sources: [],
      metadata: {
        processingTime,
        error: error.message,
        modelUsed: "error-fallback",
        timestamp: new Date().toISOString(),
      },
    };
  }
};

/**
 * Health check for RAG services
 */
const healthCheck = async () => {
  try {
    // Test embedding generation
    const testEmbedding = await generateEmbedding("test query");

    // Test Gemini (with shorter timeout)
    let geminiStatus = "healthy";
    try {
      await generateWithGemini("Hello", 1, 1000); // Single retry, short delay
    } catch (error) {
      geminiStatus = error.message.includes("503") ? "overloaded" : "error";
    }

    return {
      status: "operational",
      services: {
        embedding: testEmbedding ? "healthy" : "error",
        vectorSearch: "healthy", // Assume healthy if no error
        gemini: geminiStatus,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "degraded",
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};

module.exports = {
  generateRAGResponse,
  validateQuery,
  healthCheck,
};
