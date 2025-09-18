const Parser = require("rss-parser");
const axios = require("axios");
const cheerio = require("cheerio");
const { v4: uuidv4 } = require("uuid");
const { generateBatchEmbeddings } = require("./embeddingService");
const { insertDocuments } = require("./vectorService");
const { logger } = require("../app");

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; RAG-NewsBot/1.0; +https://example.com/bot)",
  },
});

// Default RSS feeds - high quality news sources
const DEFAULT_RSS_FEEDS = [
  "https://rss.cnn.com/rss/edition.rss",
  "https://feeds.reuters.com/reuters/topNews",
  "https://feeds.bbci.co.uk/news/world/rss.xml",
  "https://feeds.npr.org/1001/rss.xml",
  "https://feeds.washingtonpost.com/rss/world",
  "https://feeds.nbcnews.com/nbcnews/public/world",
  "https://feeds.abcnews.com/abcnews/topstories",
];

const RSS_FEEDS = process.env.RSS_FEEDS
  ? process.env.RSS_FEEDS.split(",").map((feed) => feed.trim())
  : DEFAULT_RSS_FEEDS;

/**
 * Extract main content from article URL
 * @param {string} url - Article URL
 * @returns {string|null} Extracted content or null if failed
 */
async function extractContentFromUrl(url) {
  try {
    logger.info(`Extracting content from: ${url}`);

    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RAG-NewsBot/1.0)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      maxRedirects: 3,
    });

    if (response.status !== 200) {
      logger.warn(`Non-200 status for ${url}: ${response.status}`);
      return null;
    }

    const $ = cheerio.load(response.data);

    // Remove unwanted elements
    $(
      "script, style, nav, header, footer, aside, .ad, .advertisement, .sidebar, .related-articles"
    ).remove();
    $('[class*="ad"], [id*="ad"], [class*="banner"], [id*="banner"]').remove();

    // Try multiple content selectors in order of preference
    const contentSelectors = [
      'article[role="main"]',
      "main article",
      '[role="main"]',
      ".article-content",
      ".post-content",
      ".story-body",
      ".content",
      "article",
      "main",
    ];

    let content = "";
    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        content = element.text().trim();
        if (content.length > 200) {
          // Minimum content length
          break;
        }
      }
    }

    // Fallback: get all paragraph text
    if (content.length < 200) {
      content = $("p")
        .map((i, el) => $(el).text().trim())
        .get()
        .join(" ");
    }

    // Clean and validate content
    content = content.replace(/\s+/g, " ").replace(/\n+/g, " ").trim();

    if (content.length < 100) {
      logger.warn(`Content too short for ${url}: ${content.length} characters`);
      return null;
    }

    // Limit content length to avoid token limits
    content = content.substring(0, 3000);

    logger.info(`Content extracted from ${url}`, {
      contentLength: content.length,
      url: url.substring(0, 100) + "...",
    });

    return content;
  } catch (error) {
    logger.error(`Failed to extract content from ${url}:`, {
      error: error.message,
      url,
    });
    return null;
  }
}

/**
 * Parse RSS feed and extract articles
 * @param {string} feedUrl - RSS feed URL
 * @param {number} maxArticles - Maximum articles to extract per feed
 * @returns {Array} Array of article objects
 */
async function parseRSSFeed(feedUrl, maxArticles = 10) {
  try {
    logger.info(`Parsing RSS feed: ${feedUrl}`);

    const feed = await parser.parseURL(feedUrl);
    const articles = [];

    logger.info(`RSS feed parsed: ${feed.title}`, {
      totalItems: feed.items.length,
      feedUrl,
    });

    for (const item of feed.items.slice(0, maxArticles)) {
      try {
        // Skip items without proper links
        if (!item.link || typeof item.link !== "string") {
          continue;
        }

        // Extract content from article URL
        const content = await extractContentFromUrl(item.link);

        if (content && content.length > 100) {
          const article = {
            id: uuidv4(),
            title: item.title || "Untitled",
            content: content,
            url: item.link,
            publishedDate:
              item.pubDate || item.isoDate || new Date().toISOString(),
            source: feed.title || feedUrl,
            description: item.contentSnippet || item.summary || "",
            categories: item.categories || [],
            guid: item.guid || item.link,
          };

          articles.push(article);

          logger.info(
            `Article processed: ${article.title.substring(0, 50)}...`,
            {
              contentLength: content.length,
              source: article.source,
            }
          );
        }

        // Rate limiting between requests
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        logger.error(`Error processing article from ${feedUrl}:`, {
          error: error.message,
          itemTitle: item.title,
          itemLink: item.link,
        });
        continue;
      }
    }

    logger.info(`RSS feed processing completed: ${feedUrl}`, {
      articlesExtracted: articles.length,
      feedTitle: feed.title,
    });

    return articles;
  } catch (error) {
    logger.error(`Failed to parse RSS feed ${feedUrl}:`, {
      error: error.message,
      feedUrl,
    });
    return [];
  }
}

/**
 * Ingest news articles from RSS feeds
 * @param {number} maxArticles - Maximum total articles to ingest
 * @param {Array} customFeeds - Custom RSS feeds to use (optional)
 * @returns {Array} Array of ingested articles with embeddings
 */
async function ingestNewsFromRSS(maxArticles = 50, customFeeds = null) {
  const startTime = Date.now();

  try {
    logger.info("🚀 Starting news ingestion process...", {
      maxArticles,
      feedCount: (customFeeds || RSS_FEEDS).length,
    });

    const feeds = customFeeds || RSS_FEEDS;
    const allArticles = [];
    const articlesPerFeed = Math.ceil(maxArticles / feeds.length);

    // Process each RSS feed
    for (const feedUrl of feeds) {
      if (allArticles.length >= maxArticles) {
        break;
      }

      try {
        const feedArticles = await parseRSSFeed(feedUrl, articlesPerFeed);
        allArticles.push(...feedArticles);

        logger.info(`Feed processed: ${feedUrl}`, {
          articlesFromFeed: feedArticles.length,
          totalArticles: allArticles.length,
        });

        // Rate limiting between feeds
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(`Feed processing failed: ${feedUrl}`, error);
        continue;
      }
    }

    // Limit total articles
    const finalArticles = allArticles.slice(0, maxArticles);

    logger.info(`Article collection completed`, {
      totalCollected: finalArticles.length,
      uniqueSources: [...new Set(finalArticles.map((a) => a.source))].length,
      averageContentLength: Math.round(
        finalArticles.reduce((sum, a) => sum + a.content.length, 0) /
          finalArticles.length
      ),
    });

    if (finalArticles.length === 0) {
      throw new Error("No articles were successfully collected from RSS feeds");
    }

    // Generate embeddings for all articles
    logger.info("📊 Generating embeddings for articles...");
    const texts = finalArticles.map(
      (article) => `${article.title} ${article.content}`
    );

    const embeddings = await generateBatchEmbeddings(texts, 10); // Smaller batches for stability

    // Attach embeddings to articles
    finalArticles.forEach((article, index) => {
      article.embedding = embeddings[index];
      article.ingestionTimestamp = new Date().toISOString();
    });

    logger.info("✅ Embeddings generated successfully", {
      embeddingCount: embeddings.length,
      embeddingDimension: embeddings[0]?.length || "unknown",
    });

    // Insert articles into vector database
    logger.info("💾 Inserting articles into vector database...");
    const insertResult = await insertDocuments(finalArticles);

    const processingTime = Date.now() - startTime;

    logger.info("🎉 News ingestion completed successfully!", {
      totalArticles: finalArticles.length,
      insertedDocuments: insertResult.inserted,
      totalInDatabase: insertResult.totalInCollection,
      processingTime: `${Math.round(processingTime / 1000)}s`,
      averageTimePerArticle: `${Math.round(
        processingTime / finalArticles.length
      )}ms`,
    });

    // Generate summary statistics
    const sourceStats = {};
    const categoryStats = {};

    finalArticles.forEach((article) => {
      sourceStats[article.source] = (sourceStats[article.source] || 0) + 1;
      article.categories.forEach((cat) => {
        categoryStats[cat] = (categoryStats[cat] || 0) + 1;
      });
    });

    return {
      articles: finalArticles,
      statistics: {
        totalArticles: finalArticles.length,
        processingTime,
        sources: sourceStats,
        categories: categoryStats,
        averageContentLength: Math.round(
          finalArticles.reduce((sum, a) => sum + a.content.length, 0) /
            finalArticles.length
        ),
        dateRange: {
          earliest: finalArticles.reduce(
            (earliest, article) =>
              !earliest || new Date(article.publishedDate) < new Date(earliest)
                ? article.publishedDate
                : earliest,
            null
          ),
          latest: finalArticles.reduce(
            (latest, article) =>
              !latest || new Date(article.publishedDate) > new Date(latest)
                ? article.publishedDate
                : latest,
            null
          ),
        },
      },
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error("❌ News ingestion failed:", {
      error: error.message,
      stack: error.stack,
      processingTime,
    });

    throw new Error(
      `News ingestion failed after ${Math.round(processingTime / 1000)}s: ${
        error.message
      }`
    );
  }
}

/**
 * Validate article data
 * @param {Object} article - Article object to validate
 * @returns {boolean} True if valid
 */
function validateArticle(article) {
  return (
    article &&
    typeof article.title === "string" &&
    typeof article.content === "string" &&
    typeof article.url === "string" &&
    article.title.length > 0 &&
    article.content.length > 100 &&
    article.url.startsWith("http")
  );
}

module.exports = {
  ingestNewsFromRSS,
  parseRSSFeed,
  extractContentFromUrl,
  validateArticle,
  DEFAULT_RSS_FEEDS,
};
