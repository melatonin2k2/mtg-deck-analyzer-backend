// index.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { analyzeMatchups } from "./analyzeMatchups.js";
import { learnClusters, classifyDeck } from "./mlCluster.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

app.post("/api/analyze-deck", async (req, res) => {
  const { decklist } = req.body;
  if (!decklist) return res.status(400).json({ error: "Missing decklist" });

  try {
    const deckCards = decklist.split(/\n/).map(line => line.replace(/^[0-9xX]+\s*/, "").trim()).filter(Boolean);
    const analysis = await analyzeMatchups(deckCards);
    const cluster = classifyDeck(deckCards);
    res.json({ ...analysis, learnedCluster: cluster });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to analyze deck" });
  }
});

app.post("/api/learn-archetypes", async (req, res) => {
  const { decks } = req.body;
  try {
    const result = await learnClusters(decks);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Learning failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
