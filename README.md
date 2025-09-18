# RAG News Chatbot - Backend

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![Express](https://img.shields.io/badge/Express-4.18-blue)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-purple)
![Redis](https://img.shields.io/badge/Redis-Required-red)
![Gemini AI](https://img.shields.io/badge/Gemini%20AI-1.5%20Flash-orange)

A production-ready Node.js backend for a RAG-powered news chatbot, built for the **Voosh Full Stack Developer Assignment**.

## **Features**

- **RAG Pipeline**: Retrieval-Augmented Generation with vector search
- **Real-time Chat**: Socket.IO + REST API dual communication
- **Session Management**: Redis-based session storage with TTL
- **AI Integration**: Google Gemini AI with retry logic & fallbacks
- **Vector Search**: Qdrant integration with mock data fallback
- **Smart Caching**: Redis caching for optimal performance
- **Error Handling**: Comprehensive error recovery & logging
- **Rate Limiting**: Built-in protection against abuse
- **Health Monitoring**: Service health check endpoints

## **Quick Start**

### **Prerequisites**

- Node.js 18+
- Redis server (local or cloud)
- Google Gemini API key

### **Installation**

```bash
# Clone the repository
git clone https://github.com/apurba-striker/rag-ai-backend
cd rag-ai-backend

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
const session = await fetch("/api/session/create", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
});
const { sessionId } = await session.json();

// Send message
const response = await fetch("/api/chat/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sessionId: sessionId,
    message: "What are the latest AI developments?",
  }),
});

const { answer, sources, metadata } = await response.json();
```

## 🔌 **Socket.IO Events**

### **Client → Server**

```javascript
// Join session
socket.emit("join_session", sessionId);

// Send message
socket.emit("send_message", { sessionId, message });

// Clear session
socket.emit("clear_session", sessionId);
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
  const socket = io("http://localhost:5000");
  socket.emit("join_session", "test-session-123");
  socket.emit("send_message", {
    sessionId: "test-session-123",
    message: "Hello!",
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

## **Monitoring & Logging**

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
SESSION_TTL = 3600; // 1 hour

// Connection pooling
REDIS_POOL_SIZE = 10;

// Memory optimization
MAX_SESSION_SIZE = 100; // messages per session
```

### **Rate Limiting**

```javascript
// Default limits (adjust in .env):
RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests/minute
```

### **Caching Strategy**

- **L1**: Redis (session data, chat history)
- **L2**: In-memory (embeddings, frequently accessed data)
- **TTL**: Configurable expiration for all cached data

## **Security Features**

- **Rate Limiting**: Prevents API abuse
- **Input Validation**: Joi schema validation
- **CORS Configuration**: Controlled cross-origin requests
- **Error Sanitization**: No sensitive data in error responses
- **Session Security**: UUID-based session identifiers
- **Environment Variables**: Sensitive data in environment

## **Code Quality**

- **ESLint**: Code linting and formatting
- **Winston**: Structured logging
- **Error Handling**: Comprehensive error coverage
- **Validation**: Request/response validation
- **Documentation**: Inline code documentation
- **Separation of Concerns**: Clean architecture

## Code Walkthrough (End‑to‑End Flow)

### 1) How embeddings are created, indexed, and stored

- **Collection and parsing**: `services/newsIngestService.js`

  - Pulls from curated RSS feeds (CNN/Reuters/BBC/etc.) via `rss-parser`.
  - Resolves article URLs and scrapes the main content using `axios` + `cheerio`, stripping ads, banners, and noisy DOM nodes. Ensures a minimum content length and caps content to avoid token bloat.
  - Produces normalized article objects: `{ id, title, content, url, publishedDate, source, description, categories }`.

- **Embeddings generation**: `services/embeddingService.js`

  - Uses Jina AI embeddings API (`jina-embeddings-v2-base-en`, 768‑dim) with retry/backoff.
  - Provides both `generateEmbedding(text)` and `generateBatchEmbeddings(texts, batchSize)`; the ingest pipeline uses batch mode for throughput and gracefully falls back to per‑item requests on batch errors. A zero‑vector is used as a last‑resort fallback to keep pipeline continuity.

- **Vector indexing/storage**: `services/vectorService.js`

  - Initializes Qdrant once at boot (`initializeQdrant`), creating the collection when missing with `size: 768`, `distance: Cosine`.
  - Upserts documents in batches with payload fields such as `title`, `content`, `url`, `publishedDate`, `source`, and `ingestionTimestamp`.
  - Exposes `searchSimilarDocuments(queryEmbedding, topK, filters)` for semantic retrieval and `getCollectionStats()` for visibility.

- **Ingestion orchestration**: `services/newsIngestService.js#ingestNewsFromRSS`
  - Orchestrates feeds → parse → embed (batch) → attach vectors → upsert to Qdrant.
  - Returns summary stats (counts, source/category distributions, timing).

Notes:

- The RAG answer-time path embeds the user query and performs a Qdrant similarity search over these stored vectors to build the context used by the LLM.

### 2) How Redis caching & session history works

- **Initialization**: `config/redis.js#initializeRedis`

  - Connects using `ioredis` with robust retry/backoff and optional TLS for cloud providers. Connection health is logged and monitored.

- **Session storage**:

  - `saveSession(sessionId, messages)`: Stores `{ sessionId, messages[], lastUpdated, messageCount }` as a JSON blob under key `session:<id>` with TTL (`REDIS_TTL`, default 3600s) via `SETEX`.
  - `getSession(sessionId)`: Fetches and parses the JSON; returns `[]` when absent/expired.
  - `extendSessionTTL(sessionId)`: Renews TTL during active use; `deleteSession(sessionId)` clears the key.

- **Usage**:
  - Session history is read/written by API and Socket handlers to preserve conversational context between messages and across reconnects.

#### TTL configuration & cache warming

- **Configure TTL**
  - Set `REDIS_TTL` in your environment (seconds). Example:

```env
REDIS_URL=redis://localhost:6379
REDIS_TTL=3600  # 1 hour
```

- The TTL is enforced during `saveSession(sessionId, messages)` via `SETEX` and can be renewed with `extendSessionTTL(sessionId)`.

- **Renew TTL on activity** (keeps active chats alive):

```js
// Example inside a message handler
const { saveSession, extendSessionTTL, getSession } = require("./config/redis");

const messages = await getSession(sessionId);
messages.push({ role: "user", content: userMessage, ts: Date.now() });
await saveSession(sessionId, messages);
await extendSessionTTL(sessionId); // bump expiry for active session
```

- **Cache warming on startup** (optional):
  - Preload frequently used metadata and hot queries after the server boots to reduce first-hit latency.

```js
// app startup (after Redis/Qdrant init)
const {
  getQdrantClient,
  getCollectionStats,
} = require("./services/vectorService");
const { saveSession } = require("./config/redis");

async function warmCaches() {
  // 1) Warm collection stats
  try {
    await getCollectionStats();
  } catch (_) {}

  // 2) Seed a demo session (optional UX improvement)
  await saveSession("demo-session", [
    { role: "system", content: "Welcome to RAG News!", ts: Date.now() },
  ]);

  // 3) Precompute hot query contexts (pseudo‑code)
  // const embedding = await generateEmbedding("latest ai news");
  // await searchSimilarDocuments(embedding, 5);
}

// In startServer(): await warmCaches();
```

### 3) How the frontend calls API/Socket and handles responses

- **HTTP API**: `src/app.js` mounts Express routers (`/api/chat`, `/api/session`). The frontend uses these endpoints to:

  - Create/fetch/delete sessions and statistics.
  - Send chat messages to the server for RAG answers.

- **WebSocket (Socket.IO)**: `app.js` wires Socket.IO and delegates to `controllers/chatController`.

  - Typical events: `join_session`, `send_message`, server emits `session_history`, `new_message`, `bot_typing`, and error notifications.
  - The frontend listens/emits accordingly to provide real‑time UX alongside REST fallbacks.

- **RAG response pipeline (request path)**: `services/ragService.js#generateRAGResponse`
  - Validates/cleans the user query.
  - Generates an embedding for the query (Jina), then searches Qdrant for top results and filters by a relevance score threshold.
  - Builds a concise context from the matched payloads and prompts Gemini (`gemini-1.5-flash`) with clear instructions to remain grounded in sources.
  - Returns `{ answer, sources[], metadata }`; on Gemini overload/errors, uses a content‑aware fallback template while still returning sources.

### 4) Noteworthy design decisions and potential improvements

- **Decisions**:

  - Qdrant with cosine distance and 768‑dim Jina embeddings for balanced recall/precision and cost.
  - Batch embeddings with graceful degradation to individual calls on error; conservative rate limiting delays.
  - Redis sessions with TTL for memory hygiene and simple stateless scaling across instances.
  - Explicit logging via Winston per subsystem (app, Redis, embeddings, vector DB, RAG) to avoid circular deps and to simplify troubleshooting.

- **Improvements**:
  - Add payload fields for extractive snippets and per‑chunk indexing; consider chunking long articles and storing tokenized snippets for tighter grounding.
  - Implement hybrid retrieval: keyword/BM25 filter + vector search; add metadata filters (date/source/category) surfaced to the UI.
  - Cache hot embeddings and recent search results in Redis to reduce latency on repeated queries.
  - Add rate limiter/middleware per IP/session for `/api/chat/send` and Socket events; currently app has scaffolding but can be tightened.
  - Introduce background re‑ingestion jobs and freshness windows (e.g., last 24–72 hours) with periodic cleanups.
  - Observability: structured tracing (OpenTelemetry) and per‑request correlation IDs across services.
  - Improve LLM prompting with citations formatting and JSON‑structured answers to ease UI rendering.
