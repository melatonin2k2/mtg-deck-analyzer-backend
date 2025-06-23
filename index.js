// backend/index.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

import { analyzeMatchups } from "./analyzeMatchups.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

function parseDeck(deckListText) {
  const lines = deckListText.split(/\r?\n/);
  const cards = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(\d+)\s+(.+)$/);
    if (match) {
      const count = parseInt(match[1], 10);
      const cardName = match[2].trim();

      for (let i = 0; i < count; i++) {
        cards.push(cardName);
      }
    } else {
      cards.push(trimmed);
    }
  }

  return cards;
}

app.post("/api/analyze-deck", async (req, res) => {
  const { decklist } = req.body;
  if (!decklist) {
    return res.status(400).json({ error: "Missing decklist in request body" });
  }

  try {
    const deckCards = parseDeck(decklist);
    const analysis = await analyzeMatchups(deckCards);
    res.json(analysis);
  } catch (error) {
    console.error("Error analyzing deck:", error);
    res.status(500).json({ error: "Failed to analyze deck" });
  }
});

app.listen(PORT, () => {
  console.log(`MTG Deck Analyzer backend running on port ${PORT}`);
});
