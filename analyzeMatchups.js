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
  const cmcBreakdown = {
    '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7+': 0
  };

  cardData.forEach((card) => {
    if (!card) return;
    
    const cmc = card.cmc || 0;
    const cmcKey = cmc >= 7 ? '7+' : cmc.toString();
    curveDist[cmc] = (curveDist[cmc] || 0) + 1;
    cmcBreakdown[cmcKey]++;
    
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

  const totalNonLands = creatures + nonCreatures;
  const avgCMC = totalNonLands > 0 ? 
    Object.entries(curveDist)
      .filter(([cmc]) => parseInt(cmc) > 0)
      .reduce((sum, [cmc, count]) => sum + (parseInt(cmc) * count), 0) / totalNonLands : 0;

  return { 
    creatures, 
    nonCreatures, 
    lands, 
    curveDist,
    cmcBreakdown,
    avgCMC: Math.round(avgCMC * 100) / 100
  };
}

function getColorIdentity(cardData) {
  const colors = new Set();
  const colorCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  
  cardData.forEach((card) => {
    if (card && Array.isArray(card.color_identity)) {
      card.color_identity.forEach((c) => {
        colors.add(c);
        colorCounts[c] = (colorCounts[c] || 0) + 1;
      });
    }
  });
  
  return { 
    colors: [...colors].sort(),
    colorCounts,
    dominantColor: Object.entries(colorCounts).reduce((a, b) => colorCounts[a[0]] > colorCounts[b[0]] ? a : b)[0]
  };
}

function detectSynergies(cardData) {
  const allText = cardData
    .map((card) => (card?.oracle_text || "").toLowerCase())
    .join(" ");
  const allTypes = cardData
    .map((card) => (card?.type_line || "").toLowerCase())
    .join(" ");
    
  const synergies = [];
  const synergyDetails = {};

  // Lifegain synergies
  const lifegainCards = cardData.filter(card => 
    card?.oracle_text?.toLowerCase().includes("lifelink") || 
    card?.oracle_text?.toLowerCase().includes("gain") && card?.oracle_text?.toLowerCase().includes("life")
  );
  if (lifegainCards.length >= 2) {
    synergies.push("Lifegain");
    synergyDetails.Lifegain = {
      cardCount: lifegainCards.length,
      keyCards: lifegainCards.slice(0, 3).map(c => c.name)
    };
  }
  
  // Prowess/Spells matter
  const prowessCards = cardData.filter(card => 
    card?.oracle_text?.toLowerCase().includes("prowess") || 
    card?.oracle_text?.toLowerCase().includes("noncreature spell")
  );
  if (prowessCards.length >= 2) {
    synergies.push("Prowess/Spells Matter");
    synergyDetails["Prowess/Spells Matter"] = {
      cardCount: prowessCards.length,
      keyCards: prowessCards.slice(0, 3).map(c => c.name)
    };
  }
  
  // Sacrifice themes
  const sacrificeCards = cardData.filter(card => 
    card?.oracle_text?.toLowerCase().includes("sacrifice") || 
    card?.oracle_text?.toLowerCase().includes("dies")
  );
  if (sacrificeCards.length >= 3) {
    synergies.push("Sacrifice");
    synergyDetails.Sacrifice = {
      cardCount: sacrificeCards.length,
      keyCards: sacrificeCards.slice(0, 3).map(c => c.name)
    };
  }
  
  // Graveyard synergies
  const graveyardCards = cardData.filter(card => 
    card?.oracle_text?.toLowerCase().includes("graveyard") || 
    (card?.oracle_text?.toLowerCase().includes("return") && card?.oracle_text?.toLowerCase().includes("battlefield"))
  );
  if (graveyardCards.length >= 2) {
    synergies.push("Graveyard");
    synergyDetails.Graveyard = {
      cardCount: graveyardCards.length,
      keyCards: graveyardCards.slice(0, 3).map(c => c.name)
    };
  }
  
  // Card advantage
  const cardDrawCards = cardData.filter(card => 
    card?.oracle_text?.toLowerCase().includes("draw") && card?.oracle_text?.toLowerCase().includes("card")
  );
  if (cardDrawCards.length >= 3) {
    synergies.push("Card Draw");
    synergyDetails["Card Draw"] = {
      cardCount: cardDrawCards.length,
      keyCards: cardDrawCards.slice(0, 3).map(c => c.name)
    };
  }
  
  // Aggro themes
  const aggroCards = cardData.filter(card => 
    card?.oracle_text?.toLowerCase().includes("haste") || 
    card?.oracle_text?.toLowerCase().includes("double strike") || 
    card?.oracle_text?.toLowerCase().includes("trample")
  );
  if (aggroCards.length >= 2) {
    synergies.push("Aggro");
    synergyDetails.Aggro = {
      cardCount: aggroCards.length,
      keyCards: aggroCards.slice(0, 3).map(c => c.name)
    };
  }
  
  // +1/+1 counters
  const counterCards = cardData.filter(card => 
    card?.oracle_text?.toLowerCase().includes("+1/+1 counter")
  );
  if (counterCards.length >= 3) {
    synergies.push("Counters");
    synergyDetails.Counters = {
      cardCount: counterCards.length,
      keyCards: counterCards.slice(0, 3).map(c => c.name)
    };
  }
  
  // Artifacts matter
  const artifactCards = cardData.filter(card => card?.type_line?.includes("Artifact"));
  const artifactSynergyCards = cardData.filter(card => 
    card?.oracle_text?.toLowerCase().includes("artifact") && !card?.type_line?.includes("Artifact")
  );
  if (artifactCards.length >= 4 || artifactSynergyCards.length >= 2) {
    synergies.push("Artifacts");
    synergyDetails.Artifacts = {
      cardCount: artifactCards.length + artifactSynergyCards.length,
      keyCards: [...artifactCards, ...artifactSynergyCards].slice(0, 3).map(c => c.name)
    };
  }

  return { synergies, synergyDetails };
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

  const typeBreakdown = {
    creatures: [],
    instants: [],
    sorceries: [],
    enchantments: [],
    artifacts: [],
    planeswalkers: [],
    lands: []
  };

  cardData.forEach(card => {
    if (!card?.type_line) return;
    
    const typeLine = card.type_line.toLowerCase();
    const cardInfo = { name: card.name, cmc: card.cmc };
    
    if (typeLine.includes("creature")) {
      types.creatures++;
      typeBreakdown.creatures.push(cardInfo);
    }
    if (typeLine.includes("instant")) {
      types.instants++;
      typeBreakdown.instants.push(cardInfo);
    }
    if (typeLine.includes("sorcery")) {
      types.sorceries++;
      typeBreakdown.sorceries.push(cardInfo);
    }
    if (typeLine.includes("enchantment")) {
      types.enchantments++;
      typeBreakdown.enchantments.push(cardInfo);
    }
    if (typeLine.includes("artifact")) {
      types.artifacts++;
      typeBreakdown.artifacts.push(cardInfo);
    }
    if (typeLine.includes("planeswalker")) {
      types.planeswalkers++;
      typeBreakdown.planeswalkers.push(cardInfo);
    }
    if (typeLine.includes("land")) {
      types.lands++;
      typeBreakdown.lands.push(cardInfo);
    }
  });

  return { types, typeBreakdown };
}

function analyzeDeckConsistency(cardData) {
  const cardCounts = {};
  const multiplesCounts = { 4: 0, 3: 0, 2: 0, 1: 0 };
  
  cardData.forEach(card => {
    if (!card?.name) return;
    cardCounts[card.name] = (cardCounts[card.name] || 0) + 1;
  });

  Object.values(cardCounts).forEach(count => {
    if (count >= 4) multiplesCounts[4]++;
    else if (count === 3) multiplesCounts[3]++;
    else if (count === 2) multiplesCounts[2]++;
    else multiplesCounts[1]++;
  });

  const uniqueCards = Object.keys(cardCounts).length;
  const totalCards = cardData.filter(Boolean).length;
  const consistencyScore = Math.round(
    ((multiplesCounts[4] * 4 + multiplesCounts[3] * 3 + multiplesCounts[2] * 2) / totalCards) * 100
  );

  return {
    uniqueCards,
    totalCards,
    multiplesCounts,
    consistencyScore,
    mostPlayedCards: Object.entries(cardCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))
  };
}

function analyzeManaBase(cardData) {
  const lands = cardData.filter(card => card?.type_line?.includes("Land"));
  const nonLands = cardData.filter(card => card && !card?.type_line?.includes("Land"));
  
  const landTypes = {
    basic: 0,
    dual: 0,
    utility: 0,
    fastlands: 0,
    shocklands: 0,
    checklands: 0
  };

  const colorRequirements = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  
  lands.forEach(land => {
    const name = land.name.toLowerCase();
    const text = land.oracle_text?.toLowerCase() || "";
    
    // Count basic lands
    if (name.includes("plains") || name.includes("island") || name.includes("swamp") || 
        name.includes("mountain") || name.includes("forest")) {
      landTypes.basic++;
    }
    // Count dual lands (rough heuristic)
    else if (text.includes("add") && (text.match(/\{[wubrg]\}/g) || []).length >= 2) {
      landTypes.dual++;
      
      // Specific dual land types
      if (name.includes("spirebluff") || name.includes("botanical") || name.includes("concealed")) {
        landTypes.fastlands++;
      }
      if (text.includes("pay 2 life") || name.includes("shock")) {
        landTypes.shocklands++;
      }
      if (text.includes("enters tapped unless you control")) {
        landTypes.checklands++;
      }
    }
    // Utility lands
    else {
      landTypes.utility++;
    }
  });

  // Analyze color requirements from non-land cards
  nonLands.forEach(card => {
    if (card?.mana_cost) {
      const manaCost = card.mana_cost.toLowerCase();
      colorRequirements.W += (manaCost.match(/\{w\}/g) || []).length;
      colorRequirements.U += (manaCost.match(/\{u\}/g) || []).length;
      colorRequirements.B += (manaCost.match(/\{b\}/g) || []).length;
      colorRequirements.R += (manaCost.match(/\{r\}/g) || []).length;
      colorRequirements.G += (manaCost.match(/\{g\}/g) || []).length;
    }
  });

  const totalColorSymbols = Object.values(colorRequirements).reduce((sum, count) => sum + count, 0);
  const landRatio = lands.length / (lands.length + nonLands.length);
  const recommendedLands = Math.round(24 + (totalColorSymbols / nonLands.length - 1.5) * 2);

  return {
    totalLands: lands.length,
    landTypes,
    colorRequirements,
    totalColorSymbols,
    landRatio: Math.round(landRatio * 100),
    recommendedLands,
    manabaseQuality: analyzeManabaseQuality(landTypes, colorRequirements, lands.length)
  };
}

function analyzeManabaseQuality(landTypes, colorRequirements, totalLands) {
  let score = 50; // Base score
  const feedback = [];
  
  const activeColors = Object.values(colorRequirements).filter(count => count > 0).length;
  
  // Penalize for too few lands
  if (totalLands < 22) {
    score -= 15;
    feedback.push("Consider adding more lands for consistency");
  } else if (totalLands > 26) {
    score -= 10;
    feedback.push("Might have too many lands - consider more spells");
  } else {
    score += 10;
  }
  
  // Reward good dual land count for multicolor decks
  if (activeColors > 1) {
    if (landTypes.dual >= Math.min(activeColors * 2, 8)) {
      score += 15;
      feedback.push("Good dual land count for multicolor deck");
    } else {
      score -= 10;
      feedback.push("Could use more dual lands for color fixing");
    }
  }
  
  // Penalize for too many utility lands
  if (landTypes.utility > 3) {
    score -= 5;
    feedback.push("Many utility lands might hurt color consistency");
  }
  
  // Reward good basic land ratio
  const basicRatio = landTypes.basic / totalLands;
  if (basicRatio >= 0.4 && basicRatio <= 0.7) {
    score += 10;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    grade: score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D",
    feedback
  };
}

function determineArchetype(colors, synergies, curve, cardTypes) {
  const colorCount = colors?.colors?.length || 0;
  const curveDist = curve?.curveDist || {};
  const safeCardTypes = cardTypes?.types || {};
  const safeSynergies = synergies?.synergies || [];
  const avgCMC = curve?.avgCMC || 0;
  
  // Aggro decks: low mana curve, lots of creatures
  if (avgCMC <= 2.5 && safeCardTypes.creatures >= (safeCardTypes.instants + safeCardTypes.sorceries)) {
    if (colorCount === 1) {
      if (colors.colors.includes("R")) return "Mono-Red Aggro";
      if (colors.colors.includes("W")) return "Mono-White Aggro";
      if (colors.colors.includes("G")) return "Mono-Green Stompy";
    }
    if (colors.colors.includes("R") && colors.colors.includes("W")) return "Boros Aggro";
    if (colors.colors.includes("R") && colors.colors.includes("G")) return "Gruul Aggro";
    return "Aggro";
  }

  // Control decks: high instant/sorcery count, card draw
  if ((safeCardTypes.instants + safeCardTypes.sorceries) > safeCardTypes.creatures && 
      safeSynergies.includes("Card Draw")) {
    if (colors.colors.includes("U") && colors.colors.includes("W") && colors.colors.includes("B")) {
      return "Esper Control";
    }
    if (colors.colors.includes("U") && colors.colors.includes("W")) return "Azorius Control";
    if (colors.colors.includes("U") && colors.colors.includes("B")) return "Dimir Control";
    return "Control";
  }

  // Midrange: balanced creatures and spells
  if (avgCMC >= 2.5 && avgCMC <= 4 && safeCardTypes.creatures > 0) {
    if (colors.colors.includes("B") && colors.colors.includes("G")) return "Golgari Midrange";
    if (colors.colors.includes("R") && colors.colors.includes("G")) return "Gruul Midrange";
    return "Midrange";
  }

  // Combo/synergy based
  if (safeSynergies.includes("Graveyard")) return "Graveyard Combo";
  if (safeSynergies.includes("Artifacts")) return "Artifacts";
  if (safeSynergies.includes("Lifegain")) return "Lifegain";

  // Default classification
  if (colorCount === 1 && colors.colors) return `Mono-${colors.colors[0]} Deck`;
  if (colorCount >= 3) return "Multicolor Deck";
  
  return "Unknown Archetype";
}

function generateMatchupAnalysis(archetype, colors, synergies) {
  const favorable = [];
  const challenging = [];
  const safeColors = colors?.colors || [];
  const safeSynergies = synergies?.synergies || [];
  const safeArchetype = archetype || "Unknown";

  // Simple heuristic-based matchup analysis
  if (safeArchetype.includes("Aggro")) {
    favorable.push("Control", "Combo", "Slow Midrange");
    challenging.push("Lifegain", "Fast Aggro", "Removal-Heavy Decks");
  } else if (safeArchetype.includes("Control")) {
    favorable.push("Aggro", "Midrange", "Fair Decks");
    challenging.push("Combo", "Fast Combo", "Counterspell Wars");
  } else if (safeArchetype.includes("Combo")) {
    favorable.push("Fair Decks", "Creature-based", "Slow Control");
    challenging.push("Counterspells", "Hand Disruption", "Fast Aggro");
  } else if (safeArchetype.includes("Midrange")) {
    favorable.push("Aggro", "Some Control");
    challenging.push("Combo", "Faster Midrange", "Card Advantage");
  }

  return { favorable, challenging };
}

function generateRecommendations(analysis) {
  const { 
    archetype, 
    manaCurve, 
    synergies, 
    cardTypes, 
    matchups, 
    consistency,
    manabase 
  } = analysis;
  
  let recommendations = [];

  recommendations.push(`Your deck appears to be a ${archetype} deck.`);
  
  // Mana curve analysis
  const avgCMC = manaCurve?.avgCMC || 0;
  recommendations.push(`Your average mana cost is ${avgCMC}.`);

  if (avgCMC > 4) {
    recommendations.push("Consider adding more low-cost cards to improve consistency.");
  } else if (avgCMC < 1.5) {
    recommendations.push("Very low curve - ensure you have enough impactful threats.");
  }

  // Consistency recommendations
  if (consistency?.consistencyScore < 60) {
    recommendations.push("Consider running more 4-ofs of your best cards for better consistency.");
  } else if (consistency?.consistencyScore > 80) {
    recommendations.push("Good consistency with multiple copies of key cards.");
  }

  // Manabase recommendations
  if (manabase?.manabaseQuality?.grade === "D") {
    recommendations.push("Your manabase needs significant improvement for reliable color access.");
  } else if (manabase?.manabaseQuality?.grade === "A") {
    recommendations.push("Excellent manabase construction.");
  }

  // Card type analysis
  const safeCardTypes = cardTypes?.types || {};
  if (safeCardTypes.creatures < 8 && archetype.includes("Aggro")) {
    recommendations.push("Aggro decks typically want 16+ creatures for consistent pressure.");
  }

  if (safeCardTypes.lands < 20) {
    recommendations.push("Consider adding more lands - most decks want 22-26 lands.");
  } else if (safeCardTypes.lands > 28) {
    recommendations.push("You might have too many lands - consider cutting 1-2 for more spells.");
  }

  // Synergy recommendations
  const safeSynergies = synergies?.synergies || [];
  if (safeSynergies.length === 0) {
    recommendations.push("Consider focusing on a specific synergy or theme for better consistency.");
  } else if (safeSynergies.length >= 3) {
    recommendations.push("Good synergy focus - ensure all cards support your main themes.");
  }

  const safeMatchups = matchups || {};
  if (safeMatchups.challenging && safeMatchups.challenging.length > 0) {
    recommendations.push(`Consider sideboard cards for challenging matchups like ${safeMatchups.challenging.join(", ")}.`);
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

  // Perform comprehensive analysis
  const manaCurve = computeManaCurve(validCards);
  const colors = getColorIdentity(validCards);
  const synergyAnalysis = detectSynergies(validCards);
  const cardTypeAnalysis = analyzeCardTypes(validCards);
  const consistency = analyzeDeckConsistency(validCards);
  const manabase = analyzeManaBase(validCards);
  
  const archetype = determineArchetype(colors, synergyAnalysis, manaCurve, cardTypeAnalysis);
  const matchups = generateMatchupAnalysis(archetype, colors, synergyAnalysis);
  
  const analysis = {
    archetype,
    manaCurve: {
      curveDist: manaCurve.curveDist,
      avgCMC: manaCurve.avgCMC,
      breakdown: manaCurve.cmcBreakdown
    },
    colors: colors.colors,
    colorAnalysis: colors,
    synergies: synergyAnalysis.synergies,
    synergyDetails: synergyAnalysis.synergyDetails,
    cardTypes: cardTypeAnalysis.types,
    cardTypeBreakdown: cardTypeAnalysis.typeBreakdown,
    consistency,
    manabase,
    matchups,
    creatureCount: manaCurve.creatures,
    spellCount: manaCurve.nonCreatures,
    landCount: manaCurve.lands,
    deckHealth: calculateDeckHealth(manaCurve, synergyAnalysis, consistency, manabase)
  };

  analysis.recommendations = generateRecommendations(analysis);

  return analysis;
}

function calculateDeckHealth(manaCurve, synergies, consistency, manabase) {
  let score = 50; // Base score
  const feedback = [];

  // Mana curve health
  const avgCMC = manaCurve.avgCMC;
  if (avgCMC >= 1.8 && avgCMC <= 3.2) {
    score += 15;
    feedback.push("Good mana curve");
  } else if (avgCMC > 4) {
    score -= 10;
    feedback.push("High mana curve may cause consistency issues");
  }

  // Synergy health
  if (synergies.synergies.length >= 2) {
    score += 15;
    feedback.push("Strong synergy focus");
  } else if (synergies.synergies.length === 0) {
    score -= 5;
    feedback.push("Lacks clear synergy direction");
  }

  // Consistency health
  if (consistency.consistencyScore >= 70) {
    score += 10;
    feedback.push("Good card consistency");
  } else if (consistency.consistencyScore < 50) {
    score -= 10;
    feedback.push("Poor consistency - too many one-ofs");
  }

  // Manabase health
  score += Math.round(manabase.manabaseQuality.score * 0.2);

  return {
    score: Math.max(0, Math.min(100, score)),
    grade: score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D",
    feedback
  };
}

async function analyzeSideboard(sideboardCards, mainDeckAnalysis) {
  console.log(`Analyzing sideboard with ${sideboardCards.length} cards...`);
  
  if (sideboardCards.length === 0) {
    return null;
  }

  // Fetch sideboard card data
  const cardData = [];
  for (let i = 0; i < sideboardCards.length; i++) {
    const card = await fetchCardData(sideboardCards[i]);
    cardData.push(card);
    
    // Small delay for API respect
    if (i % 5 === 4) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  const validCards = cardData.filter(Boolean);
  console.log(`Successfully analyzed ${validCards.length} sideboard cards`);

  // Analyze sideboard composition
  const sideboardTypes = analyzeCardTypes(validCards);
  const sideboardSynergies = detectSynergies(validCards);
  const sideboardColors = getColorIdentity(validCards);
  
  // Categorize sideboard cards by purpose
  const sideboardPurposes = categorizeSideboardCards(validCards);
  
  // Analyze sideboard strategy
  const sideboardStrategy = analyzeSideboardStrategy(sideboardPurposes, mainDeckAnalysis);

  return {
    cardCount: sideboardCards.length,
    validCardCount: validCards.length,
    types: sideboardTypes.types,
    synergies: sideboardSynergies.synergies,
    colors: sideboardColors.colors,
    purposes: sideboardPurposes,
    strategy: sideboardStrategy,
    recommendations: generateSideboardRecommendations(sideboardPurposes, mainDeckAnalysis)
  };
}

function categorizeSideboardCards(cardData) {
  const purposes = {
    removal: [],
    counterspells: [],
    graveyard_hate: [],
    artifact_enchantment_hate: [],
    hand_disruption: [],
    card_draw: [],
    threats: [],
    protection: [],
    combo_hate: [],
    other: []
  };

  cardData.forEach(card => {
    if (!card || !card.oracle_text) {
      purposes.other.push(card?.name || 'Unknown');
      return;
    }

    const text = card.oracle_text.toLowerCase();
    const types = card.type_line?.toLowerCase() || '';
    
    // Removal
    if (text.includes('destroy target creature') || 
        text.includes('exile target creature') ||
        text.includes('deal') && text.includes('damage')) {
      purposes.removal.push(card.name);
    }
    // Counterspells
    else if (text.includes('counter target spell')) {
      purposes.counterspells.push(card.name);
    }
    // Graveyard hate
    else if (text.includes('exile target card from a graveyard') ||
             text.includes('graveyard') && text.includes('exile')) {
      purposes.graveyard_hate.push(card.name);
    }
    // Artifact/Enchantment hate
    else if (text.includes('destroy target artifact') ||
             text.includes('destroy target enchantment')) {
      purposes.artifact_enchantment_hate.push(card.name);
    }
    // Hand disruption
    else if (text.includes('target opponent discards') ||
             text.includes('look at target opponent\'s hand')) {
      purposes.hand_disruption.push(card.name);
    }
    // Card draw
    else if (text.includes('draw') && text.includes('card')) {
      purposes.card_draw.push(card.name);
    }
    // Threats (creatures and planeswalkers)
    else if (types.includes('creature') || types.includes('planeswalker')) {
      purposes.threats.push(card.name);
    }
    // Protection
    else if (text.includes('protection') || 
             text.includes('hexproof') ||
             text.includes('prevent')) {
      purposes.protection.push(card.name);
    }
    // Combo hate
    else if (text.includes('can\'t be cast') ||
             text.includes('players can\'t') ||
             text.includes('opponents can\'t')) {
      purposes.combo_hate.push(card.name);
    }
    else {
      purposes.other.push(card.name);
    }
  });

  return purposes;
}

function analyzeSideboardStrategy(purposes, mainDeckAnalysis) {
  const strategy = [];
  
  // Analyze what the sideboard is designed to handle
  if (purposes.removal.length > 0) {
    strategy.push(`Anti-creature strategy with ${purposes.removal.length} removal spells`);
  }
  
  if (purposes.counterspells.length > 0) {
    strategy.push(`Control elements with ${purposes.counterspells.length} counterspells`);
  }
  
  if (purposes.hand_disruption.length > 0) {
    strategy.push(`Hand disruption package with ${purposes.hand_disruption.length} discard effects`);
  }
  
  if (purposes.graveyard_hate.length > 0) {
    strategy.push(`Graveyard interaction with ${purposes.graveyard_hate.length} hate cards`);
  }
  
  if (purposes.threats.length > 0) {
    strategy.push(`Additional threats with ${purposes.threats.length} creatures/planeswalkers`);
  }

  // Analyze sideboard balance
  const totalPurposefulCards = Object.values(purposes).flat().length - purposes.other.length;
  const coverage = (totalPurposefulCards / Object.values(purposes).flat().length) * 100;
  
  if (coverage > 80) {
    strategy.push("Well-focused sideboard with clear purposes for most cards");
  } else if (coverage > 60) {
    strategy.push("Moderately focused sideboard with some unclear inclusions");
  } else {
    strategy.push("Unfocused sideboard with many unclear card choices");
  }

  return strategy;
}

function generateSideboardRecommendations(purposes, mainDeckAnalysis) {
  const recommendations = [];
  const archetype = mainDeckAnalysis.archetype || '';
  
  // Archetype-specific recommendations
  if (archetype.includes('Aggro')) {
    if (purposes.removal.length < 2) {
      recommendations.push("Aggro decks often benefit from 2-3 removal spells to deal with blockers");
    }
    if (purposes.hand_disruption.length < 2) {
      recommendations.push("Consider hand disruption to fight combo and control decks");
    }
  } else if (archetype.includes('Control')) {
    if (purposes.counterspells.length < 2) {
      recommendations.push("Control decks typically want additional counterspells in the sideboard");
    }
    if (purposes.removal.length < 3) {
      recommendations.push("More removal options can help against aggressive strategies");
    }
  } else if (archetype.includes('Midrange')) {
    if (purposes.removal.length + purposes.counterspells.length < 4) {
      recommendations.push("Midrange decks need flexible answers - consider more removal or counterspells");
    }
  }

  // General sideboard health checks
  const totalCards = Object.values(purposes).flat().length;
  if (totalCards < 12) {
    recommendations.push("Consider filling out your 15-card sideboard for more options");
  }
  
  if (purposes.other.length > 3) {
    recommendations.push("Some sideboard cards have unclear purposes - consider more focused choices");
  }
  
  if (purposes.graveyard_hate.length === 0) {
    recommendations.push("Consider adding graveyard hate for the current meta");
  }

  return recommendations;
}

export { analyzeMatchups, fetchCardData, analyzeSideboard };
