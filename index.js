// backend/index.js
// Node.js + Express backend for MTG Deck Analyzer with live meta and Scryfall analysis

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

async function fetchMetaDecks() {
  // Simulated meta decks (replace with actual MTGGoldfish scraping logic or API)
  return [
    {
      name: "Mono-Red Aggro",
      keyCards: ["Play with Fire", "Kumano Faces Kakkazan", "Furnace Punisher"]
    },
    {
      name: "Esper Control",
      keyCards: ["Sunfall", "The Wandering Emperor", "Disdainful Stroke"]
    },
    {
      name: "Domain Ramp",
      keyCards: ["Herd Migration", "Topiary Stomper", "The Kami War"]
    },
    {
      name: "Dimir Midrange",
      keyCards: ["Go for the Throat", "Faerie Mastermind", "Sheoldred, the Apocalypse"]
    }
  ];
}

function parseDeck(deckListText) {
  return deckListText
    .split(/\n|\r/)
    .map(line => line.replace(/^[0-9xX]+\s*/, "").trim())
    .filter(Boolean);
}

async function enhanceWithScryfall(cards) {
  const results = await Promise.all(
    cards.map(async card => {
      try {
        const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card)}`);
        const data = await res.json();
        return data.type_line || "";
      } catch {
        return "";
      }
    })
  );
  return results;
}

async function analyzeMatchups(deckCards) {
  const metaDecks = await fetchMetaDecks();
  const favorable = [];
  const challenging = [];

  for (const meta of metaDecks) {
    const overlap = meta.keyCards.filter(c => deckCards.includes(c)).length;
    if (overlap >= 2) favorable.push(meta.name);
    else if (overlap <= 0) challenging.push(meta.name);
  }

  const types = await enhanceWithScryfall(deckCards);
  const countCreatures = types.filter(t => t.includes("Creature")).length;
  const countSpells = types.length - countCreatures;

  const recommendations = `Your deck has ${countCreatures} creatures and ${countSpells} non-creature spells. ` +
    `Consider teching against ${challenging[0] || "common threats"} with better answers or sideboard cards.`;

  return { favorable, challenging, recommendations };
}

app.post("/api/analyze-deck", async (req, res) => {
  const { decklist } = req.body;
  if (!decklist) return res.status(400).json({ error: "Missing decklist" });

  const deckCards = parseDeck(decklist);
  const analysis = await analyzeMatchups(deckCards);
  res.json(analysis);
});

app.listen(PORT, () => {
  console.log(`MTG Deck Analyzer backend running on http://localhost:${PORT}`);
});
