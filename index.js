import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { analyzeMatchups, analyzeSideboard } from "./analyzeMatchups.js";
import { enhanceWithScryfall, recommendReplacements } from "./enhancers.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

function parseDecklist(decklist) {
  const lines = decklist.split(/\n/).map(line => line.trim()).filter(Boolean);
  const mainDeck = [];
  const sideboard = [];
  let inSideboard = false;

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line || line.startsWith('//')) continue;
    
    // Check if we've hit the sideboard section
    if (line.toLowerCase().includes('sideboard') || 
        line.toLowerCase().startsWith('sb:') ||
        line.toLowerCase() === 'sideboard') {
      inSideboard = true;
      // Skip the "Sideboard" header line
      if (line.toLowerCase() === 'sideboard') continue;
    }

    // Parse quantity and card name
    let quantity = 1;
    let cardName = line;

    // Handle various quantity formats: "4x Card Name", "4 Card Name", "SB: 2 Card Name"
    const quantityMatch = line.match(/^(?:SB:\s*)?([0-9]+)[xX]?\s+(.+)$/i);
    if (quantityMatch) {
      quantity = parseInt(quantityMatch[1]);
      cardName = quantityMatch[2].trim();
    } else {
      // Remove SB: prefix if present
      cardName = cardName.replace(/^SB:\s*/i, "").trim();
    }

    if (cardName) {
      // Add the card the specified number of times
      for (let i = 0; i < quantity; i++) {
        if (inSideboard) {
          sideboard.push(cardName);
        } else {
          mainDeck.push(cardName);
        }
      }
    }
  }

  return { mainDeck, sideboard };
}

app.post("/api/analyze-deck", async (req, res) => {
  const { decklist } = req.body;
  if (!decklist) return res.status(400).json({ error: "Missing decklist" });

  try {
    console.log("Processing decklist...");
    
    // Parse the decklist to extract main deck and sideboard
    const { mainDeck, sideboard } = parseDecklist(decklist);

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
    const uniqueMainDeckCards = [...new Set(mainDeck)];
    const enhancedCards = await enhanceWithScryfall(uniqueMainDeckCards);
    const replacements = await recommendReplacements(uniqueMainDeckCards, enhancedCards);

    console.log("Analysis complete");

    const response = {
      // Main deck analysis (flattened for backward compatibility)
      ...mainDeckAnalysis,
      totalCards: mainDeck.length,
      
      // Sideboard analysis
      sideboard: sideboardAnalysis,
      
      // Replacement suggestions
      replacementSuggestions: replacements,
      
      // Additional metadata
      mainDeckCardCount: mainDeck.length,
      sideboardCardCount: sideboard.length,
      uniqueMainDeckCards: uniqueMainDeckCards.length
    };

    res.json(response);
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
