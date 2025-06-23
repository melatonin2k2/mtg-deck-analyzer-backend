// analyzeMatchups.js
import {
  fetchMTGGoldfishMeta,
  fetchScryfallArchetypes,
  fetchMTGTop8Meta,
} from "./metaSources.js";
import { enhanceWithScryfall } from "./enhancers.js";

/**
 * Calculate Jaccard similarity between two decks (arrays of card names)
 * @param {string[]} deckA
 * @param {string[]} deckB
 * @returns {number} similarity score between 0 and 1
 */
function similarityScore(deckA, deckB) {
  const intersection = deckA.filter((card) => deckB.includes(card));
  const union = new Set([...deckA, ...deckB]);
  return intersection.length / union.size;
}

/**
 * Compute simple mana curve stats based on card type lines
 * @param {string[]} typeLines - array of card type_line strings from Scryfall
 * @returns {{creatures:number, nonCreatures:number}}
 */
function computeCurve(typeLines) {
  return {
    creatures: typeLines.filter((t) => t.includes("Creature")).length,
    nonCreatures: typeLines.filter((t) => !t.includes("Creature")).length,
  };
}

/**
 * Analyze matchups for the user's deck against meta decks
 * @param {string[]} deckCards - array of card names in the user's deck
 * @returns {Promise<{favorable:string[], challenging:string[], recommendations:string}>}
 */
async function analyzeMatchups(deckCards) {
  // Fetch meta decks concurrently
  const [goldfish, scryfall, top8] = await Promise.all([
    fetchMTGGoldfishMeta(),
    fetchScryfallArchetypes(),
    fetchMTGTop8Meta(),
  ]);
  const metaDecks = [...goldfish, ...top8, ...scryfall];

  // Get card types for user's deck cards using Scryfall
  const types = await enhanceWithScryfall(deckCards);
  const curve = computeCurve(types);

  // Calculate similarity scores against meta decks
  const matchupScores = metaDecks.map((meta) => {
    const score = similarityScore(deckCards, meta.keyCards);
    return { name: meta.name, score };
  });

  // Determine favorable and challenging matchups by thresholds
  const favorable = matchupScores
    .filter((m) => m.score > 0.4)
    .map((m) => m.name);
  const challenging = matchupScores
    .filter((m) => m.score < 0.1)
    .map((m) => m.name);

  // Generate recommendations based on mana curve and matchups
  const recommendations = `This deck leans ${
    curve.creatures > curve.nonCreatures
      ? "aggressive (creature-heavy)"
      : "control (spell-heavy)"
  }. Consider teching against decks like ${
    challenging[0] || "unknown threats"
  }.`;

  return { favorable, challenging, recommendations };
}

export { analyzeMatchups };
