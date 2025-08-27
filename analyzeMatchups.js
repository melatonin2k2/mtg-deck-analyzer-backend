import fetch from "node-fetch";

// Cache for card data to avoid repeated API calls
const cardCache = new Map();

async function fetchCardData(cardName) {
  if (cardCache.has(cardName)) {
    return cardCache.get(cardName);
  }

  try {
    // First try exact match
    let res = await fetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`
    );
    
    if (!res.ok) {
      // If exact fails, try fuzzy search
      res = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`
      );
    }
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    
    if (data.object === "error") {
      throw new Error(data.details || "Card not found");
    }

    cardCache.set(cardName, data);
    return data;
  } catch (err) {
    console.warn(`Failed to fetch card: ${cardName} - ${err.message}`);
    cardCache.set(cardName, null);
    return null;
  }
}

function computeManaCurve(cardData) {
  const curveDist = {};
  let creatures = 0;
  let nonCreatures = 0;
  let lands = 0;

  cardData.forEach((card) => {
    if (!card) return;
    
    const cmc = Math.min(card.cmc || 0, 7); // bucket 7+ mana costs
    curveDist[cmc] = (curveDist[cmc] || 0) + 1;
    
    if (card.type_line) {
      if (card.type_line.includes("Land")) {
        lands++;
      } else if (card.type_line.includes("Creature")) {
        creatures++;
      } else {
        nonCreatures++;
      }
    }
  });

  return { creatures, nonCreatures, lands, curveDist };
}

function getColorIdentity(cardData) {
  const colors = new Set();
  cardData.forEach((card) => {
    if (card && Array.isArray(card.color_identity)) {
      card.color_identity.forEach((c) => colors.add(c));
    }
  });
  return [...colors].sort();
}

function detectSynergies(cardData) {
  const allText = cardData
    .map((card) => (card?.oracle_text || "").toLowerCase())
    .join(" ");
    
  const synergies = [];

  // Lifegain synergies
  if (allText.includes("lifelink") || allText.includes("gain") && allText.includes("life")) {
    synergies.push("Lifegain");
  }
  
  // Prowess/Spells matter
  if (allText.includes("prowess") || allText.includes("noncreature spell")) {
    synergies.push("Prowess/Spells Matter");
  }
  
  // Sacrifice themes
  if (allText.includes("sacrifice") || allText.includes("dies")) {
    synergies.push("Sacrifice");
  }
  
  // Graveyard synergies
  if (allText.includes("graveyard") || allText.includes("return") && allText.includes("battlefield")) {
    synergies.push("Graveyard");
  }
  
  // Card advantage
  if (allText.includes("draw") && allText.includes("card")) {
    synergies.push("Card Draw");
  }
  
  // Aggro themes
  if (allText.includes("haste") || allText.includes("double strike") || allText.includes("trample")) {
    synergies.push("Aggro");
  }
  
  // +1/+1 counters
  if (allText.includes("+1/+1 counter")) {
    synergies.push("Counters");
  }
  
  // Artifacts matter
  if (allText.includes("artifact") && cardData.some(c => c?.type_line?.includes("Artifact"))) {
    synergies.push("Artifacts");
  }

  return synergies;
}

function analyzeCardTypes(cardData) {
  const types = {
    creatures: 0,
    instants: 0,
    sorceries: 0,
    enchantments: 0,
    artifacts: 0,
    planeswalkers: 0,
    lands: 0
  };

  cardData.forEach(card => {
    if (!card?.type_line) return;
    
    const typeLine = card.type_line.toLowerCase();
    if (typeLine.includes("creature")) types.creatures++;
    if (typeLine.includes("instant")) types.instants++;
    if (typeLine.includes("sorcery")) types.sorceries++;
    if (typeLine.includes("enchantment")) types.enchantments++;
    if (typeLine.includes("artifact")) types.artifacts++;
    if (typeLine.includes("planeswalker")) types.planeswalkers++;
    if (typeLine.includes("land")) types.lands++;
  });

  return types;
}

function determineArchetype(colors, synergies, curve, cardTypes) {
  const colorCount = colors.length;
  const avgCMC = Object.entries(curve.curveDist)
    .reduce((sum, [cmc, count]) => sum + (parseInt(cmc) * count), 0) / 
    Object.values(curve.curveDist).reduce((sum, count) => sum + count, 1);

  // Aggro decks: low mana curve, lots of creatures
  if (avgCMC <= 2.5 && cardTypes.creatures >= cardTypes.instants + cardTypes.sorceries) {
    if (colorCount === 1) {
      if (colors.includes("R")) return "Mono-Red Aggro";
      if (colors.includes("W")) return "Mono-White Aggro";
      if (colors.includes("G")) return "Mono-Green Stompy";
    }
    if (colors.includes("R") && colors.includes("W")) return "Boros Aggro";
    if (colors.includes("R") && colors.includes("G")) return "Gruul Aggro";
    return "Aggro";
  }

  // Control decks: high instant/sorcery count, card draw
  if (cardTypes.instants + cardTypes.sorceries > cardTypes.creatures && 
      synergies.includes("Card Draw")) {
    if (colors.includes("U") && colors.includes("W") && colors.includes("B")) {
      return "Esper Control";
    }
    if (colors.includes("U") && colors.includes("W")) return "Azorius Control";
    if (colors.includes("U") && colors.includes("B")) return "Dimir Control";
    return "Control";
  }

  // Midrange: balanced creatures and spells
  if (avgCMC >= 2.5 && avgCMC <= 4 && cardTypes.creatures > 0) {
    if (colors.includes("B") && colors.includes("G")) return "Golgari Midrange";
    if (colors.includes("R") && colors.includes("G")) return "Gruul Midrange";
    return "Midrange";
  }

  // Combo/synergy based
  if (synergies.includes("Graveyard")) return "Graveyard Combo";
  if (synergies.includes("Artifacts")) return "Artifacts";
  if (synergies.includes("Lifegain")) return "Lifegain";

  // Default classification
  if (colorCount === 1) return `Mono-${colors[0]} Deck`;
  if (colorCount >= 3) return "Multicolor Deck";
  
  return "Unknown Archetype";
}

function generateMatchupAnalysis(archetype, colors, synergies) {
  const favorable = [];
  const challenging = [];

  // Simple heuristic-based matchup analysis
  if (archetype.includes("Aggro")) {
    favorable.push("Control", "Combo", "Slow Midrange");
    challenging.push("Lifegain", "Fast Aggro", "Removal-Heavy Decks");
  } else if (archetype.includes("Control")) {
    favorable.push("Aggro", "Midrange", "Fair Decks");
    challenging.push("Combo", "Fast Combo", "Counterspell Wars");
  } else if (archetype.includes("Combo")) {
    favorable.push("Fair Decks", "Creature-based", "Slow Control");
    challenging.push("Counterspells", "Hand Disruption", "Fast Aggro");
  } else if (archetype.includes("Midrange")) {
    favorable.push("Aggro", "Some Control");
    challenging.push("Combo", "Faster Midrange", "Card Advantage");
  }

  return { favorable, challenging };
}

function generateRecommendations(analysis) {
  const { archetype, manaCurve, synergies, cardTypes, matchups } = analysis;
  let recommendations = [];

  recommendations.push(`Your deck appears to be a ${archetype} deck.`);
  
  // Mana curve analysis
  const totalNonlands = Object.values(manaCurve.curveDist).reduce((sum, count) => sum + count, 0) - (manaCurve.curveDist[0] || 0);
  const avgCMC = Object.entries(manaCurve.curveDist)
    .reduce((sum, [cmc, count]) => sum + (parseInt(cmc) * count), 0) / Math.max(totalNonlands, 1);

  recommendations.push(`Your average mana cost is ${avgCMC.toFixed(1)}.`);

  if (avgCMC > 4) {
    recommendations.push("Consider adding more low-cost cards to improve consistency.");
  }

  // Card type analysis
  if (cardTypes.creatures < 8 && archetype.includes("Aggro")) {
    recommendations.push("Aggro decks typically want 16+ creatures for consistent pressure.");
  }

  if (cardTypes.lands < 20) {
    recommendations.push("Consider adding more lands - most decks want 22-26 lands.");
  } else if (cardTypes.lands > 28) {
    recommendations.push("You might have too many lands - consider cutting 1-2 for more spells.");
  }

  // Synergy recommendations
  if (synergies.length === 0) {
    recommendations.push("Consider focusing on a specific synergy or theme for better consistency.");
  }

  if (matchups.challenging.length > 0) {
    recommendations.push(`Consider sideboard cards for challenging matchups like ${matchups.challenging.join(", ")}.`);
  }

  return recommendations.join(" ");
}

async function analyzeMatchups(deckCards) {
  console.log(`Fetching data for ${deckCards.length} cards...`);
  
  // Fetch card data with some delay to respect rate limits
  const cardData = [];
  for (let i = 0; i < deckCards.length; i++) {
    const card = await fetchCardData(deckCards[i]);
    cardData.push(card);
    
    // Small delay every 10 cards to be respectful to Scryfall API
    if (i % 10 === 9) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  const validCards = cardData.filter(Boolean);
  console.log(`Successfully fetched data for ${validCards.length} cards`);

  const manaCurve = computeManaCurve(validCards);
  const colors = getColorIdentity(validCards);
  const synergies = detectSynergies(validCards);
  const cardTypes = analyzeCardTypes(validCards);
  
  const archetype = determineArchetype(colors, synergies, manaCurve, cardTypes);
  const matchups = generateMatchupAnalysis(archetype, colors, synergies);
  
  const analysis = {
    archetype,
    manaCurve: manaCurve.curveDist,
    colors,
    synergies,
    cardTypes,
    matchups,
    creatureCount: manaCurve.creatures,
    spellCount: manaCurve.nonCreatures,
    landCount: manaCurve.lands
  };

  analysis.recommendations = generateRecommendations(analysis);

  return analysis;
}

export { analyzeMatchups, fetchCardData };
