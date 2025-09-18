const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  getChatHistory,
  sendMessage,
} = require("../controllers/chatController");
const { validateMessage } = require("../middleware/validation");

const router = express.Router();

// Rate limiting for chat endpoints
const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: {
    error: "Too many chat requests, please slow down",
    retryAfter: "1 minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn("Chat rate limit exceeded", {
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      path: req.path,
    });
    res.status(429).json({
      error: "Too many chat requests, please slow down",
      retryAfter: "1 minute",
      timestamp: new Date().toISOString(),
    });
  },
});

// Apply rate limiting
router.use(chatRateLimit);

/**
 * GET /api/chat/history/:sessionId
 * Retrieve chat history for a session
 */
router.get("/history/:sessionId", getChatHistory);

/**
 * POST /api/chat/send
 * Send a message and get RAG response
 */
router.post("/send", validateMessage, sendMessage);

/**
 * GET /api/chat (without trailing slash)
 * Health check for chat service
 */
router.get("/", (req, res) => {
  res.json({
    status: "healthy",
    service: "chat",
    timestamp: new Date().toISOString(),
    endpoints: [
      "GET /api/chat/history/:sessionId",
      "POST /api/chat/send",
      "GET /api/chat",
    ],
  });
});

module.exports = router;
