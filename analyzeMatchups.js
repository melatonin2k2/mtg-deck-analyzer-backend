// backend/analyzeMatchups.js
import fetch from "node-fetch";
import { fetchMTGGoldfishMeta, fetchScryfallArchetypes, fetchMTGTop8Meta } from "./metaSources.js";

function similarityScore(deckA, deckB) {
  const intersection = deckA.filter(card => deckB.includes(card));
  const union = new Set([...deckA, ...deckB]);
  return intersection.length / union.size; // Jaccard similarity
}

function computeCurve(typeLines, cmcs) {
  const curveDist = {};
  cmcs.forEach(cmc => {
    curveDist[cmc] = (curveDist[cmc] || 0) + 1;
  });

  return {
    creatures: typeLines.filter(t => t.includes("Creature")).length,
    nonCreatures: typeLines.filter(t => !t.includes("Creature")).length,
    curveDist,
  };
}

function detectWinConditions(cards, cardData) {
  const winConditions = [];

  if (cards.includes("Embercleave")) winConditions.push("Embercleave combo");
  if (cards.includes("Approach of the Second Sun")) winConditions.push("Approach of the Second Sun combo");
  if (cards.includes("Chandra, Torch of Defiance")) winConditions.push("Planeswalker-based control");

  // Add more logic or rules here as needed

  return winConditions;
}

function categorizeDeck(metaDecks, deckCards) {
  let bestMatch = { score: 0, name: "Unknown" };
  metaDecks.forEach(meta => {
    const score = similarityScore(deckCards, meta.keyCards);
    if (score > bestMatch.score) bestMatch = { score, name: meta.name };
  });
  return bestMatch;
}

async function analyzeMatchups(deckCards) {
  const [goldfish, scryfall, top8] = await Promise.all([
    fetchMTGGoldfishMeta(),
    fetchScryfallArchetypes(),
    fetchMTGTop8Meta(),
  ]);
  const metaDecks = [...goldfish, ...top8, ...scryfall];

  const cardsData = await Promise.all(
    deckCards.map(async (card) => {
      try {
        const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card)}`);
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    })
  );

  const filteredCardsData = cardsData.filter(Boolean);
  const typeLines = filteredCardsData.map(c => c.type_line || "");
  const cmcs = filteredCardsData.map(c => c.cmc || 0);

  const curve = computeCurve(typeLines, cmcs);
  const winConditions = detectWinConditions(deckCards, filteredCardsData);

  const matchupScores = metaDecks.map(meta => {
    const score = similarityScore(deckCards, meta.keyCards);
    return { name: meta.name, score };
  });

  const favorable = matchupScores.filter(m => m.score > 0.4).map(m => m.name);
  const challenging = matchupScores.filter(m => m.score < 0.1).map(m => m.name);

  const archetypeMatch = categorizeDeck(metaDecks, deckCards);

  let recommendations = `Your deck is classified as "${archetypeMatch.name}" with a mana curve distribution:\n`;
  for (const [cmc, count] of Object.entries(curve.curveDist)) {
    recommendations += ` - CMC ${cmc}: ${count} cards\n`;
  }
  recommendations += `It has ${curve.creatures} creatures and ${curve.nonCreatures} spells.\n`;
  if (winConditions.length) {
    recommendations += `Detected win conditions: ${winConditions.join(", ")}.\n`;
  }
  recommendations += `Favorable matchups: ${favorable.length ? favorable.join(", ") : "None detected"}.\n`;
  recommendations += `Challenging matchups: ${challenging.length ? challenging.join(", ") : "None detected"}.\n`;
  recommendations += `Consider sideboarding against decks like ${challenging[0] || "common meta threats"}.\n`;

  return {
    favorable,
    challenging,
    recommendations,
    archetype: archetypeMatch.name,
    manaCurve: curve.curveDist,
    winConditions,
  };
}
async function fetchCardData(cardName) {
  try {
    let res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`);
    if (!res.ok) {
      res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`);
    }
    const data = await res.json();
    if (data.object === "error") throw new Error(data.details);
    return data;
  } catch (err) {
    console.warn(`Failed to fetch card: ${cardName}`, err.message);
    return null;
  }
}

export { analyzeMatchups };
