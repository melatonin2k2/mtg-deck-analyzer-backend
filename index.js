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
  return deckListText
    .split(/\n|\r/)
    .map(line => line.replace(/^[0-9xX]+\s*/, "").trim())
    .filter(Boolean);
}

app.post("/api/analyze-deck", async (req, res) => {
  const { decklist } = req.body;
  if (!decklist) return res.status(400).json({ error: "Missing decklist" });

  try {
    const deckCards = parseDeck(decklist);
    const analysis = await analyzeMatchups(deckCards);
    res.json(analysis);
  } catch (err) {
    console.error("Error in /api/analyze-deck:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`MTG Deck Analyzer backend running on http://localhost:${PORT}`);
});
