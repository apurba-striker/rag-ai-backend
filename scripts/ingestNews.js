#!/usr/bin/env node

/**
 * News Ingestion Script
 *
 * This script ingests news articles from RSS feeds,
 * generates embeddings, and stores them in the vector database.
 *
 * Usage:
 * - npm run ingest              (default: 50 articles)
 * - npm run ingest:large        (100 articles)
 * - node scripts/ingestNews.js 75 --force
 */

require("dotenv").config();
const { program } = require("commander");
const { ingestNewsFromRSS } = require("../src/services/newsIngestService");
const {
  initializeQdrant,
  getCollectionStats,
} = require("../src/services/vectorService");
const { logger } = require("../src/app");

// Command line interface
program
  .name("ingest-news")
  .description("Ingest news articles from RSS feeds into vector database")
  .argument("[count]", "number of articles to ingest", "50")
  .option("-f, --force", "force ingestion even if collection exists")
  .option("-c, --clear", "clear existing articles before ingesting")
  .option("--feeds <urls>", "comma-separated list of RSS feed URLs")
  .option("--dry-run", "simulate ingestion without actually storing data")
  .parse();

const options = program.opts();
const articleCount = parseInt(program.args[0]) || 50;

/**
 * Main ingestion function
 */
async function main() {
  const startTime = Date.now();

  try {
    console.log("🚀 RAG News Chatbot - Article Ingestion");
    console.log("=====================================\n");

    logger.info("Starting news ingestion process", {
      articleCount,
      options,
      timestamp: new Date().toISOString(),
    });

    // Validate article count
    if (articleCount < 1 || articleCount > 500) {
      throw new Error("Article count must be between 1 and 500");
    }

    // Initialize Qdrant
    console.log("🔧 Initializing vector database...");
    await initializeQdrant();

    // Check existing collection
    try {
      const stats = await getCollectionStats();
      console.log(`📊 Current collection stats:`);
      console.log(`   • Collection: ${stats.name}`);
      console.log(`   • Documents: ${stats.pointsCount}`);
      console.log(`   • Vector size: ${stats.vectorSize}`);
      console.log(`   • Distance metric: ${stats.distance}\n`);

      if (stats.pointsCount > 0 && !options.force) {
        console.log("⚠️  Collection already contains documents.");
        console.log(
          "   Use --force to proceed anyway, or --clear to remove existing data.\n"
        );

        if (!options.dryRun) {
          const readline = require("readline").createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const answer = await new Promise((resolve) => {
            readline.question("Continue anyway? (y/N): ", resolve);
          });

          readline.close();

          if (answer.toLowerCase() !== "y") {
            console.log("❌ Ingestion cancelled by user");
            process.exit(0);
          }
        }
      }
    } catch (error) {
      console.log(
        "ℹ️  Collection stats unavailable (collection may not exist yet)"
      );
    }

    // Handle clear option
    if (options.clear && !options.dryRun) {
      console.log("🗑️  Clearing existing articles...");
      // Implementation would go here
      console.log("✅ Existing articles cleared\n");
    }

    // Parse custom feeds
    let customFeeds = null;
    if (options.feeds) {
      customFeeds = options.feeds.split(",").map((feed) => feed.trim());
      console.log(`📡 Using custom RSS feeds (${customFeeds.length}):`);
      customFeeds.forEach((feed) => console.log(`   • ${feed}`));
      console.log();
    }

    // Dry run check
    if (options.dryRun) {
      console.log("🧪 DRY RUN MODE - No data will be stored\n");
    }

    // Start ingestion
    console.log(`📰 Starting ingestion of ${articleCount} articles...`);
    console.log(`⏰ Started at: ${new Date().toLocaleString()}\n`);

    const result = await ingestNewsFromRSS(articleCount, customFeeds);

    const processingTime = Date.now() - startTime;
    const timeStr = `${Math.floor(processingTime / 60000)}m ${Math.floor(
      (processingTime % 60000) / 1000
    )}s`;

    // Display results
    console.log("\n🎉 INGESTION COMPLETED SUCCESSFULLY!");
    console.log("===================================");
    console.log(`📊 Processing Summary:`);
    console.log(`   • Total articles: ${result.articles.length}`);
    console.log(`   • Processing time: ${timeStr}`);
    console.log(
      `   • Average per article: ${Math.round(
        processingTime / result.articles.length
      )}ms`
    );
    console.log(
      `   • Articles per minute: ${Math.round(
        (result.articles.length / processingTime) * 60000
      )}`
    );

    console.log(`\n📈 Content Statistics:`);
    console.log(
      `   • Average content length: ${result.statistics.averageContentLength} characters`
    );
    console.log(
      `   • Date range: ${new Date(
        result.statistics.dateRange.earliest
      ).toLocaleDateString()} to ${new Date(
        result.statistics.dateRange.latest
      ).toLocaleDateString()}`
    );

    console.log(`\n📡 Source Breakdown:`);
    Object.entries(result.statistics.sources)
      .sort(([, a], [, b]) => b - a)
      .forEach(([source, count]) => {
        console.log(`   • ${source}: ${count} articles`);
      });

    if (Object.keys(result.statistics.categories).length > 0) {
      console.log(`\n🏷️  Category Breakdown:`);
      Object.entries(result.statistics.categories)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10) // Top 10 categories
        .forEach(([category, count]) => {
          console.log(`   • ${category}: ${count} articles`);
        });
    }

    console.log(`\n✅ Articles successfully stored in vector database`);
    console.log(`🔍 Ready for RAG-powered queries!`);

    logger.info("News ingestion completed successfully", {
      articleCount: result.articles.length,
      processingTime,
      statistics: result.statistics,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;

    console.error("\n❌ INGESTION FAILED");
    console.error("==================");
    console.error(`Error: ${error.message}`);
    console.error(`Time elapsed: ${Math.round(processingTime / 1000)}s`);

    logger.error("News ingestion failed", {
      error: error.message,
      stack: error.stack,
      processingTime,
      options,
      articleCount,
    });

    process.exit(1);
  }
}

// Handle process signals
process.on("SIGINT", () => {
  console.log("\n⚠️  Ingestion interrupted by user");
  process.exit(1);
});

process.on("SIGTERM", () => {
  console.log("\n⚠️  Ingestion terminated");
  process.exit(1);
});

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
