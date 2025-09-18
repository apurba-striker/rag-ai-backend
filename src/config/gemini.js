const { GoogleGenerativeAI } = require("@google/generative-ai");
const { logger } = require("../app");

let genAI;
let model;

/**
 * Initialize Gemini AI client
 */
const initializeGemini = () => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }

    logger.info("Initializing Gemini AI client...");

    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Initialize the model with configuration
    model = genAI.getGenerativeModel({
      model: "gemini-pro",
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
        stopSequences: [],
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

    logger.info("✅ Gemini AI client initialized successfully");

    return { genAI, model };
  } catch (error) {
    logger.error("❌ Failed to initialize Gemini AI:", error);
    throw error;
  }
};

/**
 * Get Gemini model instance
 */
const getGeminiModel = () => {
  if (!model) {
    initializeGemini();
  }
  return model;
};

/**
 * Health check for Gemini API
 */
const geminiHealthCheck = async () => {
  try {
    if (!model) {
      initializeGemini();
    }

    // Simple test query
    const result = await model.generateContent(
      "Say 'OK' if you are working properly"
    );
    const response = await result.response;
    const text = response.text();

    return {
      status: "healthy",
      connected: true,
      testResponse: text,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
      connected: false,
      timestamp: new Date().toISOString(),
    };
  }
};

module.exports = {
  initializeGemini,
  getGeminiModel,
  geminiHealthCheck,
};
