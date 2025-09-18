const Joi = require("joi");
const winston = require("winston");

// Create dedicated logger
const validationLogger = winston.createLogger({
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

// Validation schemas
const messageSchema = Joi.object({
  sessionId: Joi.string().uuid().required().messages({
    "string.empty": "Session ID is required",
    "string.uuid": "Session ID must be a valid UUID",
    "any.required": "Session ID is required",
  }),
  message: Joi.string().min(1).max(1000).required().messages({
    "string.empty": "Message cannot be empty",
    "string.min": "Message is too short (minimum 1 character)",
    "string.max": "Message is too long (maximum 1000 characters)",
    "any.required": "Message is required",
  }),
});

const sessionSchema = Joi.object({
  userId: Joi.string().optional(),
  metadata: Joi.object().optional(),
});

/**
 * Validate chat message middleware
 */
const validateMessage = (req, res, next) => {
  try {
    validationLogger.info("Validating message request", {
      body: req.body,
      method: req.method,
      url: req.originalUrl,
    });

    // FIXED: Check if req.body exists
    if (!req.body) {
      validationLogger.error("Request body is missing");
      return res.status(400).json({
        error: "Request body is required",
        timestamp: new Date().toISOString(),
      });
    }

    // Validate the request body
    const validation = messageSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    // FIXED: Check validation result properly
    if (validation.error) {
      const errorDetails = validation.error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
        value: detail.context?.value,
      }));

      validationLogger.error("Message validation failed", {
        errors: errorDetails,
        body: req.body,
      });

      return res.status(400).json({
        error: "Invalid message data",
        details: errorDetails,
        timestamp: new Date().toISOString(),
      });
    }

    // Add validated data to request
    req.validatedData = validation.value;

    validationLogger.info("Message validation successful", {
      sessionId: req.validatedData.sessionId,
      messageLength: req.validatedData.message.length,
    });

    next();
  } catch (error) {
    validationLogger.error("Validation middleware error:", {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: "Internal validation error",
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Validate session creation middleware
 */
const validateSession = (req, res, next) => {
  try {
    validationLogger.info("Validating session request", {
      body: req.body || {},
      method: req.method,
    });

    // Session creation is optional, so empty body is OK
    const bodyToValidate = req.body || {};

    const validation = sessionSchema.validate(bodyToValidate, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (validation.error) {
      const errorDetails = validation.error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      validationLogger.error("Session validation failed", {
        errors: errorDetails,
        body: bodyToValidate,
      });

      return res.status(400).json({
        error: "Invalid session data",
        details: errorDetails,
        timestamp: new Date().toISOString(),
      });
    }

    req.validatedData = validation.value;
    next();
  } catch (error) {
    validationLogger.error("Session validation middleware error:", {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: "Internal validation error",
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Validate UUID parameter middleware
 */
const validateUUID = (paramName = "id") => {
  return (req, res, next) => {
    try {
      const uuid = req.params[paramName];

      if (!uuid) {
        return res.status(400).json({
          error: `${paramName} parameter is required`,
          timestamp: new Date().toISOString(),
        });
      }

      const uuidSchema = Joi.string().uuid().required();
      const validation = uuidSchema.validate(uuid);

      if (validation.error) {
        validationLogger.error(`Invalid ${paramName} format`, {
          [paramName]: uuid,
          error: validation.error.message,
        });

        return res.status(400).json({
          error: `Invalid ${paramName} format`,
          timestamp: new Date().toISOString(),
        });
      }

      next();
    } catch (error) {
      validationLogger.error(`UUID validation error for ${paramName}:`, {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        error: "Internal validation error",
        timestamp: new Date().toISOString(),
      });
    }
  };
};

/**
 * General request validation middleware
 */
const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      const validation = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (validation.error) {
        const errorDetails = validation.error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
        }));

        return res.status(400).json({
          error: "Validation failed",
          details: errorDetails,
          timestamp: new Date().toISOString(),
        });
      }

      req.validatedData = validation.value;
      next();
    } catch (error) {
      validationLogger.error("Request validation error:", {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        error: "Internal validation error",
        timestamp: new Date().toISOString(),
      });
    }
  };
};

/**
 * Error handling for validation
 */
const handleValidationError = (error, req, res, next) => {
  if (error.isJoi) {
    const errorDetails = error.details.map((detail) => ({
      field: detail.path.join("."),
      message: detail.message,
    }));

    return res.status(400).json({
      error: "Validation error",
      details: errorDetails,
      timestamp: new Date().toISOString(),
    });
  }

  next(error);
};

module.exports = {
  validateMessage,
  validateSession,
  validateUUID,
  validateRequest,
  handleValidationError,
  messageSchema,
  sessionSchema,
};
