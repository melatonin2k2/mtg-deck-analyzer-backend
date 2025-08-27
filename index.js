import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { analyzeMatchups, analyzeSideboard } from "./analyzeMatchups.js";
import { enhanceWithScryfall, recommendReplacements } from "./enhancers.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

app.post("/api/analyze-deck", async (req, res) => {
  const { decklist } = req.body;
  if (!decklist) return res.status(400).json({ error: "Missing decklist" });

  try {
    console.log("Processing decklist...");
    
    // Parse the decklist to extract main deck and sideboard
    const lines = decklist.split(/\n/).map(line => line.trim()).filter(Boolean);
    const mainDeck = [];
    const sideboard = [];
    let inSideboard = false;

    for (const line of lines) {
      // Check if we've hit the sideboard section
      if (line.toLowerCase().includes('sideboard') || line.toLowerCase().startsWith('sb:')) {
        inSideboard = true;
        // Skip the "Sideboard" header line
        if (line.toLowerCase() === 'sideboard') continue;
      }

      // Extract card name by removing quantity numbers and SB: prefix
      let cardName = line.replace(/^[0-9xX]+\s*/, "").trim();
      cardName = cardName.replace(/^SB:\s*/i, "").trim();
      
      if (cardName) {
        if (inSideboard) {
          sideboard.push(cardName);
        } else {
          mainDeck.push(cardName);
        }
      }
    }

    console.log(`Extracted ${mainDeck.length} main deck cards and ${sideboard.length} sideboard cards`);

    if (mainDeck.length === 0) {
      return res.status(400).json({ error: "No valid cards found in main deck" });
    }

    // Analyze the main deck
    const mainDeckAnalysis = await analyzeMatchups(mainDeck);
    
    // Analyze sideboard if it exists
    let sideboardAnalysis = null;
    if (sideboard.length > 0) {
      sideboardAnalysis = await analyzeSideboard(sideboard, mainDeckAnalysis);
    }
    
    // Get enhanced card data for recommendations (main deck only)
    const enhancedCards = await enhanceWithScryfall(mainDeck);
    const replacements = await recommendReplacements(mainDeck, enhancedCards);

    console.log("Analysis complete");

    res.json({ 
      mainDeck: {
        ...mainDeckAnalysis,
        cardCount: mainDeck.length
      },
      sideboard: sideboardAnalysis,
      replacementSuggestions: replacements,
      totalCards: mainDeck.length + sideboard.length,
      // Legacy fields for backward compatibility
      ...mainDeckAnalysis,
      totalCards: mainDeck.length
    });
  } catch (err) {
    console.error("Error analyzing deck:", err);
    res.status(500).json({ 
      error: "Failed to analyze deck", 
      details: err.message 
    });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`MTG Deck Analyzer Backend running on port ${PORT}`);
});
