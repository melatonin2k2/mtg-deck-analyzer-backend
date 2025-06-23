// analyzeMatchups.js
import { fetchMTGGoldfishMeta, fetchScryfallArchetypes, fetchMTGTop8Meta } from "./metaSources.js";
import { enhanceWithScryfall } from "./enhancers.js";

function similarityScore(deckA, deckB) {
  const intersection = deckA.filter(card => deckB.includes(card));
  const union = new Set([...deckA, ...deckB]);
  return intersection.length / union.size; // Jaccard similarity
}

function computeCurve(typeLines) {
  return {
    creatures: typeLines.filter(t => t.includes("Creature")).length,
    nonCreatures: typeLines.filter(t => !t.includes("Creature")).length,
  };
}

async function analyzeMatchups(deckCards) {
  const [goldfish, scryfall, top8] = await Promise.all([
    fetchMTGGoldfishMeta(),
    fetchScryfallArchetypes(),
    fetchMTGTop8Meta(),
  ]);
  const metaDecks = [...goldfish, ...top8, ...scryfall];

  const types = await enhanceWithScryfall(deckCards);
  const curve = computeCurve(types);

  const matchupScores = metaDecks.map(meta => {
    const score = similarityScore(deckCards, meta.keyCards);
    return { name: meta.name, score };
  });

  const favorable = matchupScores.filter(m => m.score > 0.4).map(m => m.name);
  const challenging = matchupScores.filter(m => m.score < 0.1).map(m => m.name);

  const recommendations = `This deck leans ${
    curve.creatures > curve.nonCreatures ? "aggressive (creature-heavy)" : "control (spell-heavy)"
  }. Consider teching against decks like ${challenging[0] || "unknown threats"}.`;

  return { favorable, challenging, recommendations };
}

export { analyzeMatchups };
