const { v4: uuidv4 } = require("uuid");
const {
  saveSession,
  getSession,
  deleteSession,
  extendSessionTTL,
} = require("../config/redis");

const createSession = async (req, res) => {
  try {
    const sessionId = uuidv4();
    const initialMessages = [];

    // Save empty session to Redis
    await saveSession(sessionId, initialMessages);

    console.log(`New session created: ${sessionId}`);

    res.status(201).json({
      sessionId,
      message: "Session created successfully",
      timestamp: new Date().toISOString(),
      expiresIn: parseInt(process.env.REDIS_TTL) || 3600,
    });
  } catch (error) {
    console.error("Error creating session:", error);
    res.status(500).json({
      error: "Failed to create session",
      timestamp: new Date().toISOString(),
    });
  }
};

const getSessionHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const messages = await getSession(sessionId);

    // Calculate session statistics
    const userMessages = messages.filter((m) => m.type === "user");
    const botMessages = messages.filter((m) => m.type === "bot");

    const sessionStats = {
      totalMessages: messages.length,
      userMessages: userMessages.length,
      botMessages: botMessages.length,
      createdAt: messages.length > 0 ? messages[0].timestamp : null,
      lastActivity:
        messages.length > 0 ? messages[messages.length - 1].timestamp : null,
      sessionAge:
        messages.length > 0
          ? Date.now() - new Date(messages[0].timestamp).getTime()
          : 0,
    };

    // Extend session TTL for active sessions
    if (messages.length > 0) {
      await extendSessionTTL(sessionId);
    }

    console.log(`Session history retrieved: ${sessionId}`);

    res.json({
      sessionId,
      messages,
      statistics: sessionStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error getting session ${req.params.sessionId}:`, error);
    res.status(500).json({
      error: "Failed to retrieve session",
      timestamp: new Date().toISOString(),
    });
  }
};

const clearSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Check if session exists before clearing
    const messages = await getSession(sessionId);
    const messageCount = messages.length;

    await deleteSession(sessionId);

    console.log(`Session cleared: ${sessionId}`);

    res.json({
      message: "Session cleared successfully",
      sessionId,
      clearedMessages: messageCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error clearing session ${req.params.sessionId}:`, error);
    res.status(500).json({
      error: "Failed to clear session",
      timestamp: new Date().toISOString(),
    });
  }
};

const getSessionStats = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const messages = await getSession(sessionId);

    if (messages.length === 0) {
      return res.json({
        sessionId,
        exists: false,
        message: "Session not found or empty",
        timestamp: new Date().toISOString(),
      });
    }

    // Calculate detailed statistics
    const userMessages = messages.filter((m) => m.type === "user");
    const botMessages = messages.filter((m) => m.type === "bot");

    // Calculate session activity timeline
    const timeline = messages.map((m) => ({
      timestamp: m.timestamp,
      type: m.type,
      hasSources: m.sources && m.sources.length > 0,
    }));

    const stats = {
      sessionId,
      exists: true,
      messageCount: {
        total: messages.length,
        user: userMessages.length,
        bot: botMessages.length,
      },
      session: {
        createdAt: messages[0].timestamp,
        lastActivity: messages[messages.length - 1].timestamp,
        duration: Date.now() - new Date(messages[0].timestamp).getTime(),
        isActive:
          Date.now() -
            new Date(messages[messages.length - 1].timestamp).getTime() <
          300000, // 5 minutes
      },
      performance: {
        responsesWithSources: botMessages.filter(
          (m) => m.sources && m.sources.length > 0
        ).length,
        totalSources: botMessages.reduce(
          (sum, m) => sum + (m.sources?.length || 0),
          0
        ),
      },
      timeline: timeline.slice(-10), // Last 10 messages
    };

    res.json({
      ...stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      `Error getting session stats ${req.params.sessionId}:`,
      error
    );
    res.status(500).json({
      error: "Failed to get session statistics",
      timestamp: new Date().toISOString(),
    });
  }
};

const exportSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { format = "json" } = req.query;
    const messages = await getSession(sessionId);

    if (messages.length === 0) {
      return res.status(404).json({
        error: "Session not found or empty",
        sessionId,
        timestamp: new Date().toISOString(),
      });
    }

    const exportData = {
      sessionId,
      exportedAt: new Date().toISOString(),
      messageCount: messages.length,
      messages: messages.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        timestamp: m.timestamp,
        sources: m.sources || [],
      })),
    };

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="session-${sessionId}.json"`
      );
      res.json(exportData);
    } else {
      res.status(400).json({
        error: "Unsupported format. Use format=json",
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`Session exported: ${sessionId}`);
  } catch (error) {
    console.error(`Error exporting session ${req.params.sessionId}:`, error);
    res.status(500).json({
      error: "Failed to export session",
      timestamp: new Date().toISOString(),
    });
  }
};

// Make sure ALL functions are exported
module.exports = {
  createSession,
  getSessionHistory,
  clearSession,
  getSessionStats,
  exportSession,
};
