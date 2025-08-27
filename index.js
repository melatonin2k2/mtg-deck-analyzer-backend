import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { analyzeMatchups } from "./analyzeMatchups.js";
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
    
    // Parse the decklist to extract card names
    const deckCards = decklist
      .split(/\n/)
      .map((line) => {
        // Remove quantity numbers and trim whitespace
        const cleaned = line.replace(/^[0-9xX]+\s*/, "").trim();
        // Remove sideboard indicators
        return cleaned.replace(/^(SB:\s*)?/, "").trim();
      })
      .filter(Boolean);

    console.log(`Extracted ${deckCards.length} cards from decklist`);

    if (deckCards.length === 0) {
      return res.status(400).json({ error: "No valid cards found in decklist" });
    }

    // Analyze the deck
    const analysis = await analyzeMatchups(deckCards);
    
    // Get enhanced card data for recommendations
    const enhancedCards = await enhanceWithScryfall(deckCards);
    const replacements = await recommendReplacements(deckCards, enhancedCards);

    console.log("Analysis complete");

    res.json({ 
      ...analysis, 
      replacementSuggestions: replacements,
      totalCards: deckCards.length
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
