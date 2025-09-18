require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const winston = require("winston");

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "rag-chatbot-backend" },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

const app = express();
const server = http.createServer(app);

// Socket.IO configuration
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import routes
const chatRoutes = require("./routes/chat");
const sessionRoutes = require("./routes/session");

// API Routes
app.use("/api/chat", chatRoutes);
app.use("/api/session", sessionRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    name: "RAG-Powered News Chatbot API",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/health",
      chat: "/api/chat",
      session: "/api/session",
    },
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
  });
});

// Socket.IO handling
const { handleChatSocket } = require("./controllers/chatController");
io.on("connection", (socket) => {
  logger.info(`Socket connected: ${socket.id}`);
  handleChatSocket(io, socket);

  socket.on("disconnect", () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error("Global error:", err);
  res.status(500).json({
    error: "Something went wrong!",
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
  });
});

// Start server function
async function startServer() {
  try {
    logger.info("🚀 Starting RAG News Chatbot Backend...");

    // Import services here to avoid circular dependency
    const { initializeRedis } = require("./config/redis");
    const { initializeQdrant } = require("./services/vectorService");

    // Initialize Redis
    await initializeRedis();
    logger.info("✅ Redis initialized");

    // Initialize Qdrant
    await initializeQdrant();
    logger.info("✅ Qdrant initialized");

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      logger.info(`🎉 Server running on port ${PORT}`);
      console.log(`\n🚀 RAG News Chatbot Backend is running!`);
      console.log(`📍 Server: http://localhost:${PORT}`);
      console.log(`🔍 Health: http://localhost:${PORT}/health`);
      console.log(`📚 API: http://localhost:${PORT}/`);
    });
  } catch (error) {
    logger.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Start the server only when this file is run directly (not when imported)
if (require.main === module) {
  startServer();
}

// Export for testing
module.exports = { app, server, io, logger };
