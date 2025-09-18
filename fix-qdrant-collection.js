const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const { QdrantClient } = require("@qdrant/js-client-rest");

async function fixQdrantCollection() {
  try {
    console.log("🔧 Fixing Qdrant collection dimension mismatch...");

    // Validate environment variables
    if (!process.env.QDRANT_URL) {
      console.error("QDRANT_URL is not set in backend/.env");
      return;
    }

    const client = new QdrantClient({
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
      checkCompatibility: false,
    });

    const collectionName =
      process.env.QDRANT_COLLECTION_NAME || "news_articles";

    console.log(`📋 Checking collection: ${collectionName}`);
    console.log(`🌐 Qdrant URL: ${process.env.QDRANT_URL}`);

    // Check if collection exists
    try {
      const collection = await client.getCollection(collectionName);
      console.log(`❌ Found existing collection with WRONG dimensions:`);
      console.log(`   Expected: 768 (Jina embeddings)`);
      console.log(`   Current: ${collection.config.params.vectors.size}`);
      console.log(`   Points count: ${collection.points_count}`);

      // Delete the existing collection
      console.log(`🗑️ Deleting existing collection...`);
      await client.deleteCollection(collectionName);
      console.log(`✅ Collection "${collectionName}" deleted successfully`);
    } catch (error) {
      if (error.message.includes("Not found")) {
        console.log(
          `ℹ️ Collection "${collectionName}" doesn't exist - will create new one`
        );
      } else {
        console.error("Error checking collection:", error.message);
        throw error;
      }
    }

    // Create new collection with correct dimensions
    console.log(`🆕 Creating new collection with CORRECT dimensions...`);
    await client.createCollection(collectionName, {
      vectors: {
        size: 768, // Jina embeddings dimension
        distance: "Cosine",
      },
      optimizers_config: {
        default_segment_number: 2,
      },
      replication_factor: 1,
    });

    // Verify the new collection
    const newCollection = await client.getCollection(collectionName);
    console.log(`✅ NEW collection created successfully:`);
    console.log(`   Name: ${collectionName}`);
    console.log(`   Vector size: ${newCollection.config.params.vectors.size}`);
    console.log(`   Distance: ${newCollection.config.params.vectors.distance}`);
    console.log(`   Points: ${newCollection.points_count}`);

    console.log("\n🎉 QDRANT COLLECTION FIXED!");
    console.log("📋 Next steps:");
    console.log("   1. Run: npm run ingest");
    console.log("   2. Test your chat API again");
    console.log("   3. Your RAG chatbot should work now!");
  } catch (error) {
    console.error("❌ Failed to fix Qdrant collection:", error.message);
    console.error("\n💡 Alternative solutions:");
    console.error(
      "   1. Go to Qdrant Cloud dashboard and delete the collection manually"
    );
    console.error("   2. Or change QDRANT_COLLECTION_NAME in your .env file");
    console.error("   3. Check your QDRANT_API_KEY is correct");
  }
}

// Run the fix
fixQdrantCollection();
