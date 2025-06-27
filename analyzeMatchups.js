// backend/analyzeMatchups.js
import fetch from "node-fetch";
import {
  fetchMTGGoldfishMeta,
  fetchScryfallArchetypes,
  fetchMTGTop8Meta,
} from "./metaSources.js";

function similarityScore(deckA, deckB) {
  const intersection = deckA.filter((card) => deckB.includes(card));
  const union = new Set([...deckA, ...deckB]);
  return intersection.length / union.size; // Jaccard similarity
}

function computeCurve(cardData) {
  const curveDist = {};
  let creatures = 0;
  let nonCreatures = 0;

  cardData.forEach((card) => {
    if (!card || card.cmc === undefined || !card.type_line) return;
    curveDist[card.cmc] = (curveDist[card.cmc] || 0) + 1;
    if (card.type_line.includes("Creature")) creatures++;
    else nonCreatures++;
  });

  return { creatures, nonCreatures, curveDist };
}

function getColorIdentity(cardData) {
  const colors = new Set();
  cardData.forEach((card) => {
    if (card && Array.isArray(card.color_identity)) {
      card.color_identity.forEach((c) => colors.add(c));
    }
  });
  return [...colors];
}

function detectSynergies(cardData) {
  const textSnippets = cardData.map((card) => card.oracle_text || "").join(" ").toLowerCase();
  const synergies = [];

  if (textSnippets.includes("prowess")) synergies.push("Prowess");
  if (textSnippets.includes("sacrifice")) synergies.push("Sacrifice");
  if (textSnippets.includes("graveyard") || textSnippets.includes("return target creature")) synergies.push("Reanimator");
  if (textSnippets.includes("draw a card")) synergies.push("Cantrip");
  if (textSnippets.includes("double strike")) synergies.push("Combat Focused");

  return synergies;
}

function tagCardRoles(cardData) {
  const roleMap = {};
  cardData.forEach((card) => {
    if (!card || !card.oracle_text) return;
    const text = card.oracle_text.toLowerCase();
    const roles = [];
    if (text.includes("destroy target creature") || text.includes("deal damage")) roles.push("removal");
    if (text.includes("counter target spell")) roles.push("counter");
    if (text.includes("add {") && text.includes("mana")) roles.push("ramp");
    if (text.includes("draw a card")) roles.push("draw");
    if (text.includes("lifelink")) roles.push("lifegain");
    if (card.type_line && card.type_line.includes("Land")) roles.push("land");
    roleMap[card.name] = roles;
  });
  return roleMap;
}

function enhancedSimilarity(deckProfile, metaProfile) {
  let score = 0;
  if (!metaProfile || !metaProfile.profile) return score;

  const matchColors = deckProfile.colors.filter((c) => metaProfile.profile.colors.includes(c)).length;
  const matchSynergies = deckProfile.synergies.filter((s) => metaProfile.profile.synergies.includes(s)).length;

  const curveOverlap = Object.keys(deckProfile.curve).reduce((acc, cmc) => {
    return acc + Math.min(deckProfile.curve[cmc] || 0, metaProfile.profile.curve[cmc] || 0);
  }, 0);

  score += matchColors * 2;
  score += matchSynergies * 3;
  score += curveOverlap * 0.5;
  return score;
}

async function fetchCardData(cardName) {
  try {
    let res = await fetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`
    );
    if (!res.ok) {
      res = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`
      );
    }
    const data = await res.json();
    if (data.object === "error") throw new Error(data.details);
    return data;
  } catch (err) {
    console.warn(`Failed to fetch card: ${cardName}`, err.message);
    return null;
  }
}

async function analyzeMatchups(deckCards) {
  const [goldfish, scryfall, top8] = await Promise.all([
    fetchMTGGoldfishMeta(),
    fetchScryfallArchetypes(),
    fetchMTGTop8Meta(),
  ]);
  const metaDecks = [...goldfish, ...top8, ...scryfall];

  const cardsData = await Promise.all(deckCards.map(fetchCardData));
  const filteredCardsData = cardsData.filter(Boolean);

  const curve = computeCurve(filteredCardsData);
  const colors = getColorIdentity(filteredCardsData);
  const synergies = detectSynergies(filteredCardsData);
  const roles = tagCardRoles(filteredCardsData);

  const deckProfile = {
    colors,
    synergies,
    curve: curve.curveDist,
  };

  const matchupScores = metaDecks.map((meta) => {
    const score = enhancedSimilarity(deckProfile, meta);
    return { name: meta.name, score };
  });

  const favorable = matchupScores.filter((m) => m.score > 5).map((m) => m.name);
  const challenging = matchupScores.filter((m) => m.score < 1).map((m) => m.name);

  let bestArchetype = { name: "Unknown", score: 0 };
  matchupScores.forEach((m) => {
    if (m.score > bestArchetype.score) bestArchetype = m;
  });

  let recommendations = `Your deck is classified as "${bestArchetype.name}" with a mana curve distribution:\n`;
  for (const [cmc, count] of Object.entries(curve.curveDist)) {
    recommendations += ` - CMC ${cmc}: ${count} cards\n`;
  }
  recommendations += `It has ${curve.creatures} creatures and ${curve.nonCreatures} spells.\n`;
  if (synergies.length) {
    recommendations += `Detected synergies: ${synergies.join(", ")}.\n`;
  }
  recommendations += `Favorable matchups: ${favorable.length ? favorable.join(", ") : "None detected"}.\n`;
  recommendations += `Challenging matchups: ${challenging.length ? challenging.join(", ") : "None detected"}.\n`;
  recommendations += `You may want to improve matchups against ${challenging[0] || "common threats"} by refining your mana curve, reinforcing sideboard options, or integrating more efficient interactive spells.\n`;

  return {
    favorable,
    challenging,
    recommendations,
    archetype: bestArchetype.name,
    manaCurve: curve.curveDist,
    synergies,
    cardRoles: roles,
  };
}

export { analyzeMatchups, fetchCardData };
