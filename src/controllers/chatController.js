const { v4: uuidv4 } = require("uuid");
const {
  generateRAGResponse,
  validateQuery,
} = require("../services/ragService");
const {
  saveSession,
  getSession,
  extendSessionTTL,
  deleteSession,
} = require("../config/redis");
const Joi = require("joi");
const winston = require("winston");

// Create dedicated logger for chat controller
const chatLogger = winston.createLogger({
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

// Validation schema for chat messages
const messageSchema = Joi.object({
  sessionId: Joi.string().uuid().required(),
  message: Joi.string().min(1).max(1000).required(),
});

/**
 * Handle Socket.IO connections and chat events
 */
const handleChatSocket = (io, socket) => {
  chatLogger.info(`New socket connection: ${socket.id}`);

  // Join session event
  socket.on("join_session", async (sessionId) => {
    try {
      if (!sessionId || typeof sessionId !== "string") {
        socket.emit("error", "Invalid session ID");
        return;
      }

      socket.join(sessionId);
      chatLogger.info(`Socket joined session: ${sessionId}`);

      // Load and send session history
      const messages = await getSession(sessionId);
      socket.emit("session_history", messages);

      // Extend session TTL if messages exist
      if (messages.length > 0) {
        await extendSessionTTL(sessionId);
      }
    } catch (error) {
      chatLogger.error(`Error joining session ${sessionId}:`, error);
      socket.emit("error", "Failed to join session");
    }
  });

  // Send message event
  socket.on("send_message", async (data) => {
    const startTime = Date.now();
    const { sessionId, message } = data;

    try {
      // Validate input data
      const { error } = messageSchema.validate(data);
      if (error) {
        socket.emit("error", `Invalid input: ${error.details[0].message}`);
        return;
      }

      // Additional query validation
      const queryValidation = validateQuery(message);
      if (!queryValidation.valid) {
        socket.emit("error", queryValidation.error);
        return;
      }

      chatLogger.info(`Processing socket message from session ${sessionId}`);

      // Get current session messages
      const messages = await getSession(sessionId);

      // Create and store user message
      const userMessage = {
        id: uuidv4(),
        type: "user",
        content: queryValidation.query,
        timestamp: new Date().toISOString(),
        metadata: {
          socketId: socket.id,
          ipAddress: socket.handshake.address,
        },
      };

      messages.push(userMessage);
      await saveSession(sessionId, messages);
      io.to(sessionId).emit("new_message", userMessage);

      // Show typing indicator
      io.to(sessionId).emit("bot_typing", true);

      // Generate bot response using RAG pipeline
      const ragResponse = await generateRAGResponse(
        queryValidation.query,
        sessionId
      );

      const botMessage = {
        id: uuidv4(),
        type: "bot",
        content: ragResponse.answer,
        sources: ragResponse.sources || [],
        metadata: ragResponse.metadata || {},
        timestamp: new Date().toISOString(),
      };

      messages.push(botMessage);
      await saveSession(sessionId, messages); // FIXED: Save updated messages

      // Hide typing indicator and send response
      io.to(sessionId).emit("bot_typing", false);
      io.to(sessionId).emit("new_message", botMessage);

      const processingTime = Date.now() - startTime;
      chatLogger.info(`Socket message processed successfully`, {
        sessionId,
        processingTime,
        totalMessages: messages.length,
      });
    } catch (error) {
      io.to(sessionId).emit("bot_typing", false);

      chatLogger.error(`Error processing socket message:`, {
        error: error.message,
        sessionId,
        socketId: socket.id,
      });

      const errorMessage = {
        id: uuidv4(),
        type: "bot",
        content:
          "I apologize, but I encountered an error while processing your question. Please try again.",
        timestamp: new Date().toISOString(),
        isError: true,
      };

      socket.emit("new_message", errorMessage);
    }
  });

  // Other socket events...
  socket.on("clear_session", async (sessionId) => {
    try {
      await deleteSession(sessionId);
      io.to(sessionId).emit("session_cleared");
      chatLogger.info(`Session cleared via socket: ${sessionId}`);
    } catch (error) {
      chatLogger.error(`Error clearing session via socket:`, error);
      socket.emit("error", "Failed to clear session");
    }
  });

  socket.on("disconnect", () => {
    chatLogger.info(`Socket disconnected: ${socket.id}`);
  });
};

/**
 * REST API endpoint to get chat history
 */
const getChatHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        error: "Session ID is required",
        timestamp: new Date().toISOString(),
      });
    }

    const messages = await getSession(sessionId);

    chatLogger.info(`Chat history retrieved for session ${sessionId}`, {
      sessionId,
      messageCount: messages.length,
    });

    res.json({
      sessionId,
      messages,
      messageCount: messages.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    chatLogger.error("Error getting chat history:", error);
    res.status(500).json({
      error: "Failed to retrieve chat history",
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * REST API endpoint to send message - FIXED VERSION
 */
const sendMessage = async (req, res) => {
  const startTime = Date.now();

  try {
    const { sessionId, message } = req.body;

    chatLogger.info(`Processing REST message from session ${sessionId}`, {
      sessionId,
      messageLength: message?.length,
    });

    // Validate input
    const { error } = messageSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: `Invalid input: ${error.details[0].message}`,
        timestamp: new Date().toISOString(),
      });
    }

    // Additional query validation
    const queryValidation = validateQuery(message);
    if (!queryValidation.valid) {
      return res.status(400).json({
        error: queryValidation.error,
        timestamp: new Date().toISOString(),
      });
    }

    // FIXED: Get current session messages and update them properly
    const currentMessages = await getSession(sessionId);
    chatLogger.info(
      `Retrieved ${currentMessages.length} existing messages for session ${sessionId}`
    );

    // Create user message
    const userMessage = {
      id: uuidv4(),
      type: "user",
      content: queryValidation.query,
      timestamp: new Date().toISOString(),
      metadata: {
        method: "REST",
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      },
    };

    // Add user message to session
    currentMessages.push(userMessage);

    // Generate RAG response
    const ragResponse = await generateRAGResponse(
      queryValidation.query,
      sessionId
    );

    // Create bot message
    const botMessage = {
      id: uuidv4(),
      type: "bot",
      content: ragResponse.answer,
      sources: ragResponse.sources || [],
      metadata: {
        ...ragResponse.metadata,
        processingTime: Date.now() - startTime,
      },
      timestamp: new Date().toISOString(),
    };

    // Add bot message to session
    currentMessages.push(botMessage);

    // FIXED: Save updated messages back to Redis
    await saveSession(sessionId, currentMessages);

    chatLogger.info(`REST message processed and saved successfully`, {
      sessionId,
      totalMessagesNow: currentMessages.length,
      processingTime: Date.now() - startTime,
      sourcesFound: ragResponse.sources?.length || 0,
    });

    // Return the RAG response
    res.json({
      answer: ragResponse.answer,
      sources: ragResponse.sources || [],
      metadata: {
        ...ragResponse.metadata,
        totalSessionMessages: currentMessages.length,
        processingTime: Date.now() - startTime,
      },
      sessionId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    chatLogger.error("Error in REST API sendMessage:", {
      error: error.message,
      stack: error.stack,
      sessionId: req.body?.sessionId,
      processingTime: Date.now() - startTime,
    });

    res.status(500).json({
      error: "Failed to process message",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
      timestamp: new Date().toISOString(),
    });
  }
};

module.exports = {
  handleChatSocket,
  getChatHistory,
  sendMessage,
};
