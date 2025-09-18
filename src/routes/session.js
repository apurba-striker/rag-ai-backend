const express = require("express");
const rateLimit = require("express-rate-limit");
const { v4: uuidv4 } = require("uuid");
const { validateSession, validateUUID } = require("../middleware/validation");
const { saveSession, getSession, deleteSession } = require("../config/redis");

const router = express.Router();

// Rate limiting for session endpoints
const sessionRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute (more lenient for sessions)
  message: {
    error: "Too many session requests, please slow down",
    retryAfter: "1 minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn("Session rate limit exceeded", {
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      path: req.path,
    });
    res.status(429).json({
      error: "Too many session requests, please slow down",
      retryAfter: "1 minute",
      timestamp: new Date().toISOString(),
    });
  },
});

// Apply rate limiting
router.use(sessionRateLimit);

/**
 * POST /api/session/create
 * Create a new chat session
 */
router.post("/create", validateSession, async (req, res) => {
  try {
    const sessionId = uuidv4();
    const metadata = req.validatedData?.metadata || {};

    // Initialize empty session
    await saveSession(sessionId, []);

    console.log("New session created:", sessionId);

    res.status(201).json({
      sessionId,
      message: "Session created successfully",
      metadata,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error creating session:", error);
    res.status(500).json({
      error: "Failed to create session",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/session/:sessionId
 * Get session details and message history
 */
router.get("/:sessionId", validateUUID("sessionId"), async (req, res) => {
  try {
    const { sessionId } = req.params;

    const messages = await getSession(sessionId);

    // Calculate statistics
    const statistics = {
      totalMessages: messages.length,
      userMessages: messages.filter((m) => m.type === "user").length,
      botMessages: messages.filter((m) => m.type === "bot").length,
    };

    res.json({
      sessionId,
      messages,
      statistics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting session:", error);
    res.status(500).json({
      error: "Failed to retrieve session",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * DELETE /api/session/:sessionId
 * Clear/delete a session
 */
router.delete("/:sessionId", validateUUID("sessionId"), async (req, res) => {
  try {
    const { sessionId } = req.params;

    const wasDeleted = await deleteSession(sessionId);

    if (wasDeleted) {
      res.json({
        message: "Session cleared successfully",
        sessionId,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(404).json({
        error: "Session not found",
        sessionId,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error deleting session:", error);
    res.status(500).json({
      error: "Failed to delete session",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/session/:sessionId/stats
 * Get session statistics
 */
router.get("/:sessionId/stats", validateUUID("sessionId"), async (req, res) => {
  try {
    const { sessionId } = req.params;

    const messages = await getSession(sessionId);
    const exists = messages.length >= 0; // getSession returns [] for non-existent sessions

    const stats = {
      sessionId,
      exists,
      messageCount: {
        total: messages.length,
        user: messages.filter((m) => m.type === "user").length,
        bot: messages.filter((m) => m.type === "bot").length,
      },
      session: {
        createdAt: messages.length > 0 ? messages[0].timestamp : null,
        lastActivity:
          messages.length > 0 ? messages[messages.length - 1].timestamp : null,
        isActive: messages.length > 0,
      },
      timestamp: new Date().toISOString(),
    };

    res.json(stats);
  } catch (error) {
    console.error("Error getting session stats:", error);
    res.status(500).json({
      error: "Failed to retrieve session statistics",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/session/:sessionId/export
 * Export session data
 */
router.get(
  "/:sessionId/export",
  validateUUID("sessionId"),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const format = req.query.format || "json";

      const messages = await getSession(sessionId);

      const exportData = {
        sessionId,
        exportedAt: new Date().toISOString(),
        messageCount: messages.length,
        messages: messages.map((msg) => ({
          type: msg.type,
          content: msg.content,
          timestamp: msg.timestamp,
          sources: msg.sources || [],
        })),
      };

      if (format === "json") {
        res.json(exportData);
      } else {
        res.status(400).json({
          error: "Unsupported export format",
          supportedFormats: ["json"],
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Error exporting session:", error);
      res.status(500).json({
        error: "Failed to export session",
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/session
 * Health check for session service
 */
router.get("/", (req, res) => {
  res.json({
    status: "healthy",
    service: "session",
    timestamp: new Date().toISOString(),
    endpoints: [
      "POST /api/session/create",
      "GET /api/session/:sessionId",
      "DELETE /api/session/:sessionId",
      "GET /api/session/:sessionId/stats",
      "GET /api/session/:sessionId/export",
      "GET /api/session",
    ],
  });
});

module.exports = router;
