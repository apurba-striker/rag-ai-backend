const Redis = require("ioredis");
const winston = require("winston");

const redisLogger = winston.createLogger({
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

let redisClient;

/**
 * Initialize Redis connection with proper TLS handling
 */
const initializeRedis = async () => {
  try {
    redisLogger.info("Initializing Redis connection...");

    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error("REDIS_URL environment variable is not set");
    }

    redisLogger.info("🌐 Connecting to Redis Cloud...", {
      url: redisUrl.substring(0, 30) + "...",
    });

    // Parse the Redis URL
    const url = new URL(redisUrl);
    const isRedisCloud =
      url.hostname.includes("redis-cloud.com") ||
      url.hostname.includes("redns.redis-cloud.com");

    let redisConfig = {
      connectTimeout: 20000, // Increased timeout
      commandTimeout: 10000,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 5, // Increased retries
      lazyConnect: true,
      family: 4,
      keepAlive: true,

      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        redisLogger.info(`Redis retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      },

      reconnectOnError: (err) => {
        redisLogger.warn("Redis reconnect on error:", err.message);
        return (
          err.message.includes("READONLY") || err.message.includes("ECONNRESET")
        );
      },
    };

    if (isRedisCloud) {
      // Redis Cloud connection - Try without TLS first (many Redis Cloud instances don't require TLS)
      redisLogger.info("Attempting Redis Cloud connection without TLS...");

      try {
        redisClient = new Redis(redisUrl, {
          ...redisConfig,
          // Try without TLS first
          tls: undefined,
        });

        // Test the connection
        await redisClient.ping();
        redisLogger.info("✅ Connected to Redis Cloud (no TLS)");
      } catch (noTlsError) {
        redisLogger.info("Non-TLS connection failed, trying with TLS...");

        // If non-TLS fails, try with TLS
        redisClient = new Redis(redisUrl, {
          ...redisConfig,
          tls: {
            servername: url.hostname,
            rejectUnauthorized: false, // Accept self-signed certificates
          },
        });

        await redisClient.ping();
        redisLogger.info("✅ Connected to Redis Cloud (with TLS)");
      }
    } else {
      // Local or other Redis connection
      redisClient = new Redis(redisUrl, redisConfig);
      await redisClient.ping();
      redisLogger.info("✅ Connected to Redis (local/other)");
    }

    // Event listeners
    redisClient.on("connect", () => {
      redisLogger.info("✅ Redis connected");
    });

    redisClient.on("ready", () => {
      redisLogger.info("✅ Redis ready");
    });

    redisClient.on("error", (err) => {
      redisLogger.error("❌ Redis error:", {
        error: err.message,
        code: err.code,
      });
    });

    redisClient.on("close", () => {
      redisLogger.warn("⚠️ Redis connection closed");
    });

    redisClient.on("reconnecting", () => {
      redisLogger.info("🔄 Redis reconnecting...");
    });

    // Get server info
    const info = await redisClient.info("server");
    const redisVersion =
      info.match(/redis_version:([^\r\n]+)/)?.[1] || "unknown";

    redisLogger.info("✅ Redis connection established", {
      version: redisVersion,
      mode: isRedisCloud ? "cloud" : "local",
      host: url.hostname,
      port: url.port,
      tls: redisClient.options.tls ? "enabled" : "disabled",
    });
  } catch (error) {
    redisLogger.error("❌ Failed to initialize Redis:", {
      error: error.message,
      stack: error.stack,
    });
    throw new Error(`Redis initialization failed: ${error.message}`);
  }
};

const getRedisClient = () => {
  if (!redisClient) {
    throw new Error(
      "Redis client not initialized. Call initializeRedis() first."
    );
  }
  return redisClient;
};

const saveSession = async (sessionId, messages) => {
  try {
    const client = getRedisClient();
    const ttl = parseInt(process.env.REDIS_TTL) || 3600;

    const sessionData = {
      sessionId,
      messages,
      lastUpdated: new Date().toISOString(),
      messageCount: messages.length,
    };

    const key = `session:${sessionId}`;
    await client.setex(key, ttl, JSON.stringify(sessionData));

    redisLogger.info(`Session saved: ${sessionId}`, {
      sessionId,
      messageCount: messages.length,
      ttl,
    });
  } catch (error) {
    redisLogger.error(`Error saving session ${sessionId}:`, {
      error: error.message,
      sessionId,
    });
    throw new Error(`Failed to save session: ${error.message}`);
  }
};

const getSession = async (sessionId) => {
  try {
    const client = getRedisClient();
    const key = `session:${sessionId}`;

    const data = await client.get(key);

    if (!data) {
      redisLogger.info(`Session not found: ${sessionId}`);
      return [];
    }

    const sessionData = JSON.parse(data);
    const messages = sessionData.messages || [];

    redisLogger.info(`Session retrieved: ${sessionId}`, {
      sessionId,
      messageCount: messages.length,
    });

    return messages;
  } catch (error) {
    redisLogger.error(`Error getting session ${sessionId}:`, {
      error: error.message,
      sessionId,
    });
    return [];
  }
};

const deleteSession = async (sessionId) => {
  try {
    const client = getRedisClient();
    const key = `session:${sessionId}`;

    const result = await client.del(key);
    const wasDeleted = result === 1;

    redisLogger.info(`Session deletion: ${sessionId}`, {
      sessionId,
      wasDeleted,
    });

    return wasDeleted;
  } catch (error) {
    redisLogger.error(`Error deleting session ${sessionId}:`, {
      error: error.message,
      sessionId,
    });
    throw new Error(`Failed to delete session: ${error.message}`);
  }
};

const extendSessionTTL = async (sessionId, ttl = null) => {
  try {
    const client = getRedisClient();
    const key = `session:${sessionId}`;
    const newTTL = ttl || parseInt(process.env.REDIS_TTL) || 3600;

    const result = await client.expire(key, newTTL);
    return result === 1;
  } catch (error) {
    redisLogger.error(`Error extending session TTL ${sessionId}:`, error);
    return false;
  }
};

const healthCheck = async () => {
  try {
    const client = getRedisClient();
    const start = Date.now();
    await client.ping();
    const responseTime = Date.now() - start;

    const redisUrl = process.env.REDIS_URL;
    const url = new URL(redisUrl);
    const isCloud =
      url.hostname.includes("redis-cloud.com") ||
      url.hostname.includes("redns.redis-cloud.com");

    return {
      status: "healthy",
      responseTime,
      connected: true,
      provider: isCloud ? "redis-cloud" : "local",
      host: url.hostname,
      port: url.port,
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

const closeRedisConnection = async () => {
  try {
    if (redisClient) {
      await redisClient.quit();
      redisLogger.info("✅ Redis connection closed gracefully");
    }
  } catch (error) {
    redisLogger.error("Error closing Redis connection:", error);
  }
};

module.exports = {
  initializeRedis,
  getRedisClient,
  saveSession,
  getSession,
  deleteSession,
  extendSessionTTL,
  healthCheck,
  closeRedisConnection,
};
