const { Sequelize, DataTypes } = require("sequelize");

let sequelize;
let logger;

// Use dynamic import for logger to avoid circular dependency
const getLogger = () => {
  if (!logger) {
    const winston = require("winston");
    logger = winston.createLogger({
      level: "info",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: "logs/database.log" }),
      ],
    });
  }
  return logger;
};

/**
 * Initialize Neon PostgreSQL database connection
 */
const initializeDatabase = async () => {
  try {
    const log = getLogger();

    // Check if database URL is provided
    const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DB_URL;

    if (!databaseUrl && !process.env.DB_HOST) {
      log.info(
        "⚠️ No database configuration found, skipping database initialization"
      );
      return null;
    }

    log.info("Initializing Neon PostgreSQL database...");

    // Neon-optimized configuration
    const sequelizeConfig = {
      dialect: "postgres",
      logging: (msg) => log.debug("Database Query:", msg),

      // Connection pool configuration optimized for Neon
      pool: {
        max: 10, // Maximum connections
        min: 2, // Minimum connections
        acquire: 60000, // Max time to get connection (60s)
        idle: 45000, // Max idle time (45s)
        evict: 30000, // Evict idle connections after 30s
      },

      // Neon-specific SSL and connection options
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
        // Connection timeout
        connectTimeout: 60000,
        // Command timeout
        commandTimeout: 60000,
        // Keep alive settings
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
      },

      // Additional Sequelize options for Neon
      retry: {
        match: [
          /ConnectionError/,
          /ConnectionRefusedError/,
          /ConnectionTimedOutError/,
          /TimeoutError/,
          /PROTOCOL_CONNECTION_LOST/,
          /ENOTFOUND/,
          /ENETUNREACH/,
          /ETIMEDOUT/,
        ],
        max: 3, // Maximum retry attempts
        backoffBase: 1000, // Initial backoff delay
        backoffExponent: 1.5, // Backoff multiplier
      },

      // Query options
      define: {
        timestamps: true,
        underscored: false,
        freezeTableName: true,
      },

      // Neon connection hooks
      hooks: {
        beforeConnect: async (config) => {
          log.info("Connecting to Neon database...", {
            host: config.host,
            database: config.database,
            ssl: !!config.dialectOptions?.ssl,
          });
        },
        afterConnect: async (connection, config) => {
          log.info("Successfully connected to Neon database", {
            host: config.host,
            database: config.database,
          });
        },
      },
    };

    // Create Sequelize instance with Neon URL
    if (databaseUrl) {
      sequelize = new Sequelize(databaseUrl, sequelizeConfig);
      log.info("Using Neon database URL connection");
    } else {
      // Fallback to individual connection parameters
      sequelize = new Sequelize({
        database: process.env.DB_NAME || "neondb",
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 5432,
        ...sequelizeConfig,
      });
      log.info("Using individual Neon database parameters");
    }

    // Test the connection
    log.info("Testing Neon database connection...");
    await sequelize.authenticate();
    log.info("✅ Neon database connection established successfully");

    // Define models
    defineModels();
    log.info("Database models defined");

    // Sync models with Neon database
    const syncOptions = {
      alter: process.env.NODE_ENV === "development",
      force: false, // Never force in production
    };

    await sequelize.sync(syncOptions);
    log.info("✅ Database models synchronized with Neon");

    // Create indexes for performance
    await createIndexes();
    log.info("✅ Database indexes created/updated");

    // Log connection info (without sensitive data)
    const connectionInfo = {
      dialect: sequelize.getDialect(),
      database: sequelize.config.database,
      host: sequelize.config.host,
      port: sequelize.config.port,
      ssl: !!sequelize.config.dialectOptions?.ssl,
      poolMax: sequelize.config.pool?.max,
      poolMin: sequelize.config.pool?.min,
    };

    log.info("Neon database configuration:", connectionInfo);

    return sequelize;
  } catch (error) {
    const log = getLogger();
    log.error("❌ Neon database initialization failed:", {
      error: error.message,
      stack: error.stack,
      code: error.code,
      host: process.env.DB_HOST || "from_url",
    });

    // In development, continue without database
    if (process.env.NODE_ENV === "development") {
      log.warn("⚠️ Continuing without database in development mode");
      return null;
    }

    throw error;
  }
};

/**
 * Define Sequelize models optimized for Neon
 */
const defineModels = () => {
  const log = getLogger();

  try {
    // Session model for persistent storage
    const Session = sequelize.define(
      "Session",
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        sessionId: {
          type: DataTypes.UUID,
          allowNull: false,
          unique: true,
          index: true,
          validate: {
            isUUID: 4,
          },
        },
        messages: {
          type: DataTypes.JSONB, // JSONB is perfect for Neon
          allowNull: false,
          defaultValue: [],
          validate: {
            isValidMessages(value) {
              if (!Array.isArray(value)) {
                throw new Error("Messages must be an array");
              }
            },
          },
        },
        messageCount: {
          type: DataTypes.INTEGER,
          defaultValue: 0,
          validate: { min: 0 },
        },
        lastActivity: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
          index: true,
        },
        clientInfo: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: {},
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          defaultValue: true,
          index: true,
        },
        metadata: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: {},
        },
      },
      {
        tableName: "sessions",
        indexes: [
          { fields: ["sessionId"], unique: true },
          { fields: ["lastActivity"] },
          { fields: ["isActive"] },
          { fields: ["createdAt"] },
          { fields: ["messageCount"] },
          // Composite indexes for common queries
          { fields: ["isActive", "lastActivity"] },
          { fields: ["sessionId", "isActive"] },
        ],
        hooks: {
          beforeSave: (session) => {
            session.messageCount = session.messages
              ? session.messages.length
              : 0;
            session.lastActivity = new Date();
          },
        },
      }
    );

    // ChatMessage model for individual message storage
    const ChatMessage = sequelize.define(
      "ChatMessage",
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        messageId: {
          type: DataTypes.UUID,
          allowNull: false,
          unique: true,
          index: true,
        },
        sessionId: {
          type: DataTypes.UUID,
          allowNull: false,
          index: true,
          references: {
            model: Session,
            key: "sessionId",
          },
        },
        type: {
          type: DataTypes.ENUM("user", "bot", "system"),
          allowNull: false,
          index: true,
        },
        content: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        sources: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        metadata: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: {},
        },
        timestamp: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
          index: true,
        },
        processingTime: {
          type: DataTypes.INTEGER, // milliseconds
          allowNull: true,
        },
        tokenCount: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
      },
      {
        tableName: "chat_messages",
        indexes: [
          { fields: ["sessionId"] },
          { fields: ["type"] },
          { fields: ["timestamp"] },
          { fields: ["messageId"], unique: true },
          // Composite indexes for performance
          { fields: ["sessionId", "timestamp"] },
          { fields: ["sessionId", "type"] },
          { fields: ["type", "timestamp"] },
        ],
      }
    );

    // Analytics model for tracking usage
    const Analytics = sequelize.define(
      "Analytics",
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        eventType: {
          type: DataTypes.STRING(50),
          allowNull: false,
          index: true,
        },
        sessionId: {
          type: DataTypes.UUID,
          allowNull: true,
          index: true,
        },
        data: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        timestamp: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
          index: true,
        },
      },
      {
        tableName: "analytics",
        indexes: [
          { fields: ["eventType"] },
          { fields: ["timestamp"] },
          { fields: ["sessionId"] },
          { fields: ["eventType", "timestamp"] },
        ],
      }
    );

    // Define associations
    Session.hasMany(ChatMessage, {
      foreignKey: "sessionId",
      sourceKey: "sessionId",
      as: "messages",
      onDelete: "CASCADE",
    });

    ChatMessage.belongsTo(Session, {
      foreignKey: "sessionId",
      targetKey: "sessionId",
      as: "session",
    });

    Session.hasMany(Analytics, {
      foreignKey: "sessionId",
      sourceKey: "sessionId",
      as: "analytics",
    });

    // Add instance methods
    addInstanceMethods(Session, ChatMessage, Analytics);

    // Export models
    sequelize.models = {
      Session,
      ChatMessage,
      Analytics,
    };

    log.info("✅ All models defined successfully");
  } catch (error) {
    log.error("Error defining models:", error);
    throw error;
  }
};

/**
 * Add instance methods to models
 */
const addInstanceMethods = (Session, ChatMessage, Analytics) => {
  // Session methods
  Session.prototype.addMessage = function (messageData) {
    this.messages = this.messages || [];
    this.messages.push(messageData);
    this.messageCount = this.messages.length;
    this.lastActivity = new Date();
    return this;
  };

  Session.prototype.getStatistics = function () {
    const messages = this.messages || [];
    const userMessages = messages.filter((m) => m.type === "user");
    const botMessages = messages.filter((m) => m.type === "bot");

    return {
      totalMessages: messages.length,
      userMessages: userMessages.length,
      botMessages: botMessages.length,
      sessionAge: this.createdAt
        ? Date.now() - new Date(this.createdAt).getTime()
        : 0,
      lastActivity: this.lastActivity,
      isActive: this.isActive,
      avgProcessingTime:
        botMessages
          .filter((m) => m.processingTime)
          .reduce((sum, m) => sum + m.processingTime, 0) /
        Math.max(botMessages.length, 1),
    };
  };

  // Class methods
  Session.findBySessionId = function (sessionId) {
    return this.findOne({
      where: { sessionId },
      include: [
        {
          model: ChatMessage,
          as: "messages",
          order: [["timestamp", "ASC"]],
        },
      ],
    });
  };

  Session.cleanup = async function (daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return this.update(
      { isActive: false },
      {
        where: {
          lastActivity: { [DataTypes.Op.lt]: cutoffDate },
          isActive: true,
        },
      }
    );
  };
};

/**
 * Create additional indexes for performance
 */
const createIndexes = async () => {
  const log = getLogger();

  try {
    // Create JSONB indexes for better query performance
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_messages_gin 
      ON sessions USING gin (messages)
    `);

    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_sources_gin 
      ON chat_messages USING gin (sources)
    `);

    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_data_gin 
      ON analytics USING gin (data)
    `);

    // Partial indexes for active sessions
    await sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_active_last_activity 
      ON sessions (last_activity) WHERE is_active = true
    `);

    log.info("✅ Additional indexes created");
  } catch (error) {
    log.warn("⚠️ Some indexes may already exist:", error.message);
  }
};

/**
 * Get database instance
 */
const getDatabase = () => {
  return sequelize;
};

/**
 * Health check for Neon database
 */
const databaseHealthCheck = async () => {
  try {
    if (!sequelize) {
      return {
        status: "disabled",
        message: "Database not initialized",
        provider: "neon",
        timestamp: new Date().toISOString(),
      };
    }

    const startTime = Date.now();
    await sequelize.authenticate();
    const responseTime = Date.now() - startTime;

    // Get connection info
    const connectionInfo = {
      status: "healthy",
      connected: true,
      provider: "neon",
      database: sequelize.config.database,
      host: sequelize.config.host,
      ssl: !!sequelize.config.dialectOptions?.ssl,
      responseTime: `${responseTime}ms`,
      poolSize: {
        max: sequelize.config.pool?.max,
        min: sequelize.config.pool?.min,
        active: sequelize.connectionManager?.pool?.size || "unknown",
      },
      timestamp: new Date().toISOString(),
    };

    return connectionInfo;
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
      code: error.code,
      connected: false,
      provider: "neon",
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Get database statistics
 */
const getDatabaseStats = async () => {
  try {
    if (!sequelize) return null;

    const [sessionCount, messageCount, activeSessionCount] = await Promise.all([
      sequelize.models.Session?.count() || 0,
      sequelize.models.ChatMessage?.count() || 0,
      sequelize.models.Session?.count({ where: { isActive: true } }) || 0,
    ]);

    return {
      sessions: {
        total: sessionCount,
        active: activeSessionCount,
        inactive: sessionCount - activeSessionCount,
      },
      messages: {
        total: messageCount,
        averagePerSession:
          sessionCount > 0 ? Math.round(messageCount / sessionCount) : 0,
      },
      database: {
        tables: Object.keys(sequelize.models).length,
        provider: "neon",
        uptime:
          sequelize.connectionManager?.pool?.options?.acquireTimeout ||
          "unknown",
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const log = getLogger();
    log.error("Error getting database stats:", error);
    return { error: error.message };
  }
};

/**
 * Close Neon database connection
 */
const closeDatabaseConnection = async () => {
  try {
    if (sequelize) {
      const log = getLogger();
      log.info("Closing Neon database connection...");

      await sequelize.close();
      log.info("✅ Neon database connection closed gracefully");
    }
  } catch (error) {
    const log = getLogger();
    log.error("Error closing Neon database connection:", error);
  }
};

module.exports = {
  initializeDatabase,
  getDatabase,
  databaseHealthCheck,
  getDatabaseStats,
  closeDatabaseConnection,
};
