import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { analyzeMatchups, analyzeSideboard } from "./analyzeMatchups.js";
import { enhanceWithScryfall, recommendReplacements } from "./enhancers.js";

const app = express();
const PORT = process.env.PORT || 3001;

// FIXED CORS Configuration - Add your frontend URL
app.use(cors({
  origin: [
    'http://localhost:3000',                                      // Local development
    'https://mtg-deck-analyzer-frontend.onrender.com',           // Your production frontend
    'https://mtg-deck-analyzer-frontend.onrender.com/'          // With trailing slash just in case
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    message: "MTG Deck Analyzer Backend is running",
    cors: "Configured for production frontend"
  });
});

// Main deck analysis endpoint
app.post("/api/analyze-deck", async (req, res) => {
  const { decklist } = req.body;
  
  console.log("Received analysis request from:", req.get('origin')); // Debug log
  
  if (!decklist) {
    return res.status(400).json({ 
      error: "Missing decklist",
      details: "Please provide a decklist in the request body"
    });
  }

  try {
    console.log("Processing decklist...");
    console.log("Decklist preview:", decklist.substring(0, 200) + (decklist.length > 200 ? "..." : ""));
    
    // Parse the decklist to extract main deck and sideboard
    const { mainDeck, sideboard } = parseDecklist(decklist);

    console.log(`Extracted ${mainDeck.length} main deck cards and ${sideboard.length} sideboard cards`);

    if (mainDeck.length === 0) {
      return res.status(400).json({ 
        error: "No valid cards found in main deck",
        details: "Please check your decklist format. Example: '4 Lightning Bolt' or 'Lightning Bolt'"
      });
    }

    // Analyze the main deck
    console.log("Starting main deck analysis...");
    const mainDeckAnalysis = await analyzeMatchups(mainDeck);
    console.log("Main deck analysis complete");
    
    // Analyze sideboard if it exists
    let sideboardAnalysis = null;
    if (sideboard.length > 0) {
      console.log("Starting sideboard analysis...");
      sideboardAnalysis = await analyzeSideboard(sideboard, mainDeckAnalysis);
      console.log("Sideboard analysis complete");
    }
    
    // Get enhanced card data for recommendations (main deck only)
    console.log("Getting card replacement suggestions...");
    const enhancedCards = await enhanceWithScryfall(mainDeck.slice(0, 20)); // Limit to first 20 for performance
    const replacements = await recommendReplacements(mainDeck.slice(0, 20), enhancedCards);
    console.log(`Found ${replacements.length} replacement suggestions`);

    // Build the response
    const response = {
      // Main deck analysis results
      archetype: mainDeckAnalysis.archetype,
      colors: mainDeckAnalysis.colors,
      manaCurve: mainDeckAnalysis.manaCurve,
      synergies: mainDeckAnalysis.synergies,
      cardTypes: mainDeckAnalysis.cardTypes,
      matchups: mainDeckAnalysis.matchups,
      recommendations: mainDeckAnalysis.recommendations,
      
      // Card counts
      totalCards: mainDeck.length + sideboard.length,
      creatureCount: mainDeckAnalysis.creatureCount,
      spellCount: mainDeckAnalysis.spellCount,
      landCount: mainDeckAnalysis.landCount,
      
      // Sideboard analysis (if exists)
      sideboard: sideboardAnalysis,
      
      // Card replacement suggestions
      replacementSuggestions: replacements,
      
      // Meta information
      analysisTimestamp: new Date().toISOString(),
      mainDeckSize: mainDeck.length,
      sideboardSize: sideboard.length
    };

    console.log("Analysis complete, sending response");
    res.json(response);
    
  } catch (err) {
    console.error("Error analyzing deck:", err);
    res.status(500).json({ 
      error: "Failed to analyze deck", 
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Utility function to parse decklist
function parseDecklist(decklist) {
  const lines = decklist.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const mainDeck = [];
  const sideboard = [];
  let inSideboard = false;

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;

    // Check if we've hit the sideboard section
    if (line.toLowerCase().includes('sideboard') || 
        line.toLowerCase().startsWith('sb:') ||
        line.toLowerCase() === 'sb' ||
        line.toLowerCase().includes('side board')) {
      inSideboard = true;
      // Skip the "Sideboard" header line if it's just the word "Sideboard"
      if (line.toLowerCase().trim() === 'sideboard' || 
          line.toLowerCase().trim() === 'sb' ||
          line.toLowerCase().trim() === 'side board') {
        continue;
      }
    }

    // Extract card name by removing quantity numbers and prefixes
    let cardName = line;
    
    // Remove quantity at the beginning (4x, 4 x, 4, etc.)
    cardName = cardName.replace(/^\d+[x\s]*\s*/i, "");
    
    // Remove SB: prefix
    cardName = cardName.replace(/^SB:\s*/i, "");
    
    // Remove other common prefixes
    cardName = cardName.replace(/^(SIDEBOARD|SIDE|SB):\s*/i, "");
    
    // Trim whitespace
    cardName = cardName.trim();
    
    if (cardName && cardName.length > 0) {
      if (inSideboard) {
        sideboard.push(cardName);
      } else {
        mainDeck.push(cardName);
      }
    }
  }

  return { mainDeck, sideboard };
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested endpoint does not exist'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`MTG Deck Analyzer Backend running on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/api/health`);
  console.log(`Deck analysis endpoint: http://localhost:${PORT}/api/analyze-deck`);
  console.log(`CORS configured for frontend: https://mtg-deck-analyzer-frontend.onrender.com`);
});
