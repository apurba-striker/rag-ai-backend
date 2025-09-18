const { DataTypes } = require("sequelize");

/**
 * Define Session model
 * @param {Sequelize} sequelize - Sequelize instance
 * @returns {Model} Session model
 */
const defineSessionModel = (sequelize) => {
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
        type: DataTypes.JSONB,
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
        validate: {
          min: 0,
        },
      },
      lastActivity: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      clientInfo: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
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
        { fields: ["sessionId"] },
        { fields: ["lastActivity"] },
        { fields: ["isActive"] },
        { fields: ["createdAt"] },
      ],
      hooks: {
        beforeSave: (session) => {
          session.messageCount = session.messages ? session.messages.length : 0;
          session.lastActivity = new Date();
        },
      },
    }
  );

  // Instance methods
  Session.prototype.addMessage = function (message) {
    this.messages = this.messages || [];
    this.messages.push(message);
    this.messageCount = this.messages.length;
    this.lastActivity = new Date();
    return this;
  };

  Session.prototype.clearMessages = function () {
    this.messages = [];
    this.messageCount = 0;
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
    };
  };

  // Class methods
  Session.findBySessionId = function (sessionId) {
    return this.findOne({ where: { sessionId } });
  };

  Session.getActiveSessions = function () {
    return this.findAll({ where: { isActive: true } });
  };

  Session.cleanupOldSessions = async function (daysOld = 7) {
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

  return Session;
};

module.exports = defineSessionModel;
