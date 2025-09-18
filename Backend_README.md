# RAG News Chatbot - Backend

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![Express](https://img.shields.io/badge/Express-4.18-blue)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-purple)
![Redis](https://img.shields.io/badge/Redis-Required-red)
![Gemini AI](https://img.shields.io/badge/Gemini%20AI-1.5%20Flash-orange)

A production-ready Node.js backend for a RAG-powered news chatbot, built for the **Voosh Full Stack Developer Assignment**.

## 🎯 **Features**

- ✅ **RAG Pipeline**: Retrieval-Augmented Generation with vector search
- ✅ **Real-time Chat**: Socket.IO + REST API dual communication
- ✅ **Session Management**: Redis-based session storage with TTL
- ✅ **AI Integration**: Google Gemini AI with retry logic & fallbacks  
- ✅ **Vector Search**: Qdrant integration with mock data fallback
- ✅ **Smart Caching**: Redis caching for optimal performance
- ✅ **Error Handling**: Comprehensive error recovery & logging
- ✅ **Rate Limiting**: Built-in protection against abuse
- ✅ **Health Monitoring**: Service health check endpoints

## 🏗️ **Architecture**

```
Backend Structure:
├── src/
│   ├── app.js                    # Main application entry
│   ├── config/
│   │   ├── redis.js              # Redis connection & session management
│   │   └── logger.js             # Winston logging configuration
│   ├── controllers/
│   │   └── chatController.js     # Chat logic & Socket.IO handlers
│   ├── middleware/
│   │   ├── validation.js         # Request validation (Joi)
│   │   ├── rateLimiter.js        # Rate limiting middleware
│   │   └── errorHandler.js       # Global error handling
│   ├── routes/
│   │   ├── chat.js               # Chat API endpoints
│   │   ├── session.js            # Session management endpoints
│   │   └── health.js             # Health check endpoints
│   ├── services/
│   │   ├── ragService.js         # RAG pipeline orchestration
│   │   ├── jinaService.js        # Jina AI embeddings service
│   │   └── qdrantService.js      # Qdrant vector database service
│   └── utils/
│       └── constants.js          # Application constants
├── package.json
├── .env.example
└── README.md
```

## 🚀 **Quick Start**

### **Prerequisites**
- Node.js 18+ 
- Redis server (local or cloud)
- Google Gemini API key

### **Installation**

```bash
# Clone the repository
git clone <your-repo-url>
cd rag-news-chatbot/backend

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your configuration
```

### **Environment Setup**

Create a `.env` file with the following variables:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Redis Configuration (REQUIRED)
REDIS_URL=redis://localhost:6379
# OR for cloud Redis:
# REDIS_URL=redis://default:password@host:port

# AI Services (REQUIRED)
GEMINI_API_KEY=your_gemini_api_key_here

# Vector Services (Optional - uses mock data if not provided)
JINA_API_KEY=your_jina_api_key_here
QDRANT_URL=https://your-cluster.qdrant.tech
QDRANT_API_KEY=your_qdrant_api_key_here
QDRANT_COLLECTION=news_articles

# Session Configuration
SESSION_TTL=3600
MAX_SESSION_SIZE=100

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### **Getting API Keys**

#### **1. Google Gemini API (Required)**
```bash
# Visit: https://makersuite.google.com/app/apikey
# 1. Create Google AI Studio account
# 2. Generate API key
# 3. Add to .env: GEMINI_API_KEY=your_key_here
```

#### **2. Jina AI Embeddings (Optional)**
```bash
# Visit: https://jina.ai/embeddings/
# 1. Create free account
# 2. Get API key from dashboard  
# 3. Add to .env: JINA_API_KEY=your_key_here
# Note: Uses mock embeddings if not provided
```

#### **3. Qdrant Vector DB (Optional)**
```bash
# Visit: https://qdrant.tech/
# 1. Create free cluster
# 2. Get cluster URL and API key
# 3. Add to .env: QDRANT_URL=https://xyz.qdrant.tech
# Note: Uses mock news data if not provided
```

### **Redis Setup**

#### **Option 1: Local Redis**
```bash
# Install Redis
# macOS:
brew install redis
brew services start redis

# Ubuntu:
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server

# Windows:
# Download from: https://redis.io/download
```

#### **Option 2: Cloud Redis**
```bash
# Recommended services:
# - Redis Cloud (free tier): https://redis.com/
# - Upstash (serverless): https://upstash.com/
# - Railway: https://railway.app/

# Update REDIS_URL in .env with your cloud Redis URL
```

### **Run the Application**

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start

# With specific port
PORT=8000 npm start
```

The server will start on `http://localhost:5000` (or specified PORT).

## 📡 **API Documentation**

### **Health Endpoints**

```http
GET /health
# Returns: Server health status

GET /health/detailed  
# Returns: Detailed service health (Redis, AI services, etc.)
```

### **Session Management**

```http
POST /api/session/create
# Creates new chat session
# Returns: { sessionId, timestamp }

GET /api/session/:sessionId
# Get session details and message history
# Returns: { sessionId, messages[], statistics }

DELETE /api/session/:sessionId  
# Clear/delete session
# Returns: { message, sessionId, timestamp }

GET /api/session/:sessionId/stats
# Get session statistics
# Returns: { messageCount, session: {...} }

GET /api/session/:sessionId/export?format=json
# Export session data
# Returns: Session data in requested format
```

### **Chat API**

```http
POST /api/chat/send
# Send message and get RAG response
# Body: { sessionId, message }
# Returns: { answer, sources[], metadata }

GET /api/chat/history/:sessionId
# Get chat history for session  
# Returns: { messages[], messageCount, timestamp }
```

### **Example API Usage**

```javascript
// Create session
const session = await fetch('/api/session/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});
const { sessionId } = await session.json();

// Send message
const response = await fetch('/api/chat/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: sessionId,
    message: "What are the latest AI developments?"
  })
});

const { answer, sources, metadata } = await response.json();
```

## 🔌 **Socket.IO Events**

### **Client → Server**
```javascript
// Join session
socket.emit('join_session', sessionId);

// Send message
socket.emit('send_message', { sessionId, message });

// Clear session
socket.emit('clear_session', sessionId);
```

### **Server → Client**
```javascript
// Session history loaded
socket.on('session_history', (messages) => {...});

// New message received
socket.on('new_message', (message) => {...});

// Bot typing indicator
socket.on('bot_typing', (isTyping) => {...});

// Session cleared
socket.on('session_cleared', () => {...});

// Error occurred
socket.on('error', (errorMessage) => {...});
```

## 🧪 **Testing**

### **Health Check**
```bash
curl http://localhost:5000/health
```

### **Create Session**
```bash
curl -X POST http://localhost:5000/api/session/create \
  -H "Content-Type: application/json"
```

### **Send Message**
```bash
curl -X POST http://localhost:5000/api/chat/send \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"your-session-id","message":"What are the latest tech news?"}'
```

### **WebSocket Test**
```html
<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io('http://localhost:5000');
socket.emit('join_session', 'test-session-123');
socket.emit('send_message', { 
  sessionId: 'test-session-123', 
  message: 'Hello!' 
});
</script>
```

## 🚀 **Deployment**

### **Render.com Deployment**

1. **Create `render.yaml`:**
```yaml
services:
  - type: web
    name: rag-chatbot-backend
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
```

2. **Environment Variables:**
```bash
# Add in Render dashboard:
REDIS_URL=your_redis_cloud_url
GEMINI_API_KEY=your_gemini_key
JINA_API_KEY=your_jina_key (optional)
QDRANT_URL=your_qdrant_url (optional)
```

### **Railway Deployment**
```bash
# Connect your GitHub repo to Railway
# Set environment variables in Railway dashboard
# Deploy automatically on git push
```

### **Docker Deployment**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## 📊 **Monitoring & Logging**

### **Winston Logging**
- **Console**: Colored logs for development
- **File**: Production logs (if configured)
- **Levels**: error, warn, info, debug

### **Health Checks**
```http
GET /health/detailed
# Returns service status:
{
  "status": "healthy",
  "services": {
    "redis": "connected",
    "gemini": "operational", 
    "embedding": "healthy",
    "vectorDB": "healthy"
  },
  "uptime": 3600,
  "memory": { "used": "45MB", "free": "1.2GB" }
}
```

## 🔧 **Troubleshooting**

### **Common Issues**

#### **1. Redis Connection Failed**
```bash
# Error: connect ECONNREFUSED 127.0.0.1:6379
# Solution: Ensure Redis server is running
redis-cli ping  # Should return PONG

# For cloud Redis, check REDIS_URL format:
# redis://default:password@host:port
```

#### **2. Gemini API 503 Error**
```bash
# Error: [503 Service Unavailable] The model is overloaded
# Solution: The app handles this automatically with:
# - Retry logic (3 attempts with backoff)
# - Fallback responses with sources
# - Wait 2-3 minutes and try again
```

#### **3. Port Already in Use**
```bash
# Error: EADDRINUSE :::5000
# Solution: Change port or kill existing process
PORT=8000 npm start
# OR
lsof -ti:5000 | xargs kill -9
```

#### **4. Missing Environment Variables**
```bash
# Error: GEMINI_API_KEY is required
# Solution: Check .env file exists and has correct values
cp .env.example .env
# Edit .env with your actual values
```

### **Debug Mode**
```bash
DEBUG=* npm run dev
# OR
NODE_ENV=development DEBUG_LOGS=true npm run dev
```

## 📈 **Performance Optimization**

### **Redis Optimization**
```javascript
// Session TTL (Time To Live) 
SESSION_TTL=3600  // 1 hour

// Connection pooling
REDIS_POOL_SIZE=10

// Memory optimization
MAX_SESSION_SIZE=100  // messages per session
```

### **Rate Limiting**
```javascript
// Default limits (adjust in .env):
RATE_LIMIT_WINDOW_MS=60000     // 1 minute
RATE_LIMIT_MAX_REQUESTS=100    // 100 requests/minute
CHAT_RATE_LIMIT=30             // 30 chat messages/minute
```

### **Caching Strategy**
- **L1**: Redis (session data, chat history)
- **L2**: In-memory (embeddings, frequently accessed data) 
- **TTL**: Configurable expiration for all cached data

## 🔐 **Security Features**

- ✅ **Rate Limiting**: Prevents API abuse
- ✅ **Input Validation**: Joi schema validation
- ✅ **CORS Configuration**: Controlled cross-origin requests  
- ✅ **Error Sanitization**: No sensitive data in error responses
- ✅ **Session Security**: UUID-based session identifiers
- ✅ **Environment Variables**: Sensitive data in environment

## 📖 **Code Quality**

- ✅ **ESLint**: Code linting and formatting
- ✅ **Winston**: Structured logging
- ✅ **Error Handling**: Comprehensive error coverage
- ✅ **Validation**: Request/response validation
- ✅ **Documentation**: Inline code documentation
- ✅ **Separation of Concerns**: Clean architecture

## 🤝 **Contributing**

This is an assignment project for Voosh. The implementation demonstrates:
- **Production-ready code** with proper error handling
- **Scalable architecture** with separation of concerns  
- **Modern Node.js practices** with async/await
- **Comprehensive testing** capabilities
- **Documentation** and maintainability focus

## 📄 **License**

This project is part of a technical assignment for Voosh and is for demonstration purposes.

---

**Built with ❤️ for the Voosh Full Stack Developer Assignment**

For questions or issues, please refer to the troubleshooting section or contact the development team.
