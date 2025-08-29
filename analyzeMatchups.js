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
  const colorCount = colors ? colors.length : 0;
  const curveDist = curve ? curve.curveDist : {};
  const safeCardTypes = cardTypes || {};
  const safeSynergies = synergies || [];
  
  const totalCards = Object.values(curveDist).reduce((sum, count) => sum + count, 0);
  const avgCMC = totalCards > 0 ? Object.entries(curveDist)
    .reduce((sum, [cmc, count]) => sum + (parseInt(cmc) * count), 0) / totalCards : 0;

  // Aggro decks: low mana curve, lots of creatures
  if (avgCMC <= 2.5 && safeCardTypes.creatures >= (safeCardTypes.instants + safeCardTypes.sorceries)) {
    if (colorCount === 1) {
      if (colors && colors.includes("R")) return "Mono-Red Aggro";
      if (colors && colors.includes("W")) return "Mono-White Aggro";
      if (colors && colors.includes("G")) return "Mono-Green Stompy";
    }
    if (colors && colors.includes("R") && colors.includes("W")) return "Boros Aggro";
    if (colors && colors.includes("R") && colors.includes("G")) return "Gruul Aggro";
    return "Aggro";
  }

  // Control decks: high instant/sorcery count, card draw
  if ((safeCardTypes.instants + safeCardTypes.sorceries) > safeCardTypes.creatures && 
      safeSynergies.includes("Card Draw")) {
    if (colors && colors.includes("U") && colors.includes("W") && colors.includes("B")) {
      return "Esper Control";
    }
    if (colors && colors.includes("U") && colors.includes("W")) return "Azorius Control";
    if (colors && colors.includes("U") && colors.includes("B")) return "Dimir Control";
    return "Control";
  }

  // Midrange: balanced creatures and spells
  if (avgCMC >= 2.5 && avgCMC <= 4 && safeCardTypes.creatures > 0) {
    if (colors && colors.includes("B") && colors.includes("G")) return "Golgari Midrange";
    if (colors && colors.includes("R") && colors.includes("G")) return "Gruul Midrange";
    return "Midrange";
  }

  // Combo/synergy based
  if (safeSynergies.includes("Graveyard")) return "Graveyard Combo";
  if (safeSynergies.includes("Artifacts")) return "Artifacts";
  if (safeSynergies.includes("Lifegain")) return "Lifegain";

  // Default classification
  if (colorCount === 1 && colors) return `Mono-${colors[0]} Deck`;
  if (colorCount >= 3) return "Multicolor Deck";
  
  return "Unknown Archetype";
}

function generateMatchupAnalysis(archetype, colors, synergies) {
  const favorable = [];
  const challenging = [];
  const safeColors = colors || [];
  const safeSynergies = synergies || [];
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
  const { archetype, manaCurve, synergies, cardTypes, matchups } = analysis;
  let recommendations = [];

  recommendations.push(`Your deck appears to be a ${archetype} deck.`);
  
  // Mana curve analysis
  const curveDist = manaCurve || {};
  const totalNonlands = Object.values(curveDist).reduce((sum, count) => sum + count, 0) - (curveDist[0] || 0);
  const avgCMC = Object.entries(curveDist)
    .reduce((sum, [cmc, count]) => sum + (parseInt(cmc) * count), 0) / Math.max(totalNonlands, 1);

  recommendations.push(`Your average mana cost is ${avgCMC.toFixed(1)}.`);

  if (avgCMC > 4) {
    recommendations.push("Consider adding more low-cost cards to improve consistency.");
  }

  // Card type analysis
  const safeCardTypes = cardTypes || {};
  if (safeCardTypes.creatures < 8 && archetype.includes("Aggro")) {
    recommendations.push("Aggro decks typically want 16+ creatures for consistent pressure.");
  }

  if (safeCardTypes.lands < 20) {
    recommendations.push("Consider adding more lands - most decks want 22-26 lands.");
  } else if (safeCardTypes.lands > 28) {
    recommendations.push("You might have too many lands - consider cutting 1-2 for more spells.");
  }

  // Synergy recommendations
  const safeSynergies = synergies || [];
  if (safeSynergies.length === 0) {
    recommendations.push("Consider focusing on a specific synergy or theme for better consistency.");
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

  // Safely compute analysis components
  const manaCurve = computeManaCurve(validCards);
  const colors = getColorIdentity(validCards);
  const synergies = detectSynergies(validCards);
  const cardTypes = analyzeCardTypes(validCards);
  
  const archetype = determineArchetype(colors, synergies, manaCurve, cardTypes);
  const matchups = generateMatchupAnalysis(archetype, colors, synergies);
  
  const analysis = {
    archetype,
    manaCurve: manaCurve ? manaCurve.curveDist : {},
    colors: colors || [],
    synergies: synergies || [],
    cardTypes: cardTypes || {},
    matchups: matchups || { favorable: [], challenging: [] },
    creatureCount: manaCurve ? manaCurve.creatures : 0,
    spellCount: manaCurve ? manaCurve.nonCreatures : 0,
    landCount: manaCurve ? manaCurve.lands : 0
  };

  analysis.recommendations = generateRecommendations(analysis);

  return analysis;
}

async function analyzeMainDeck(deckCards, basicAnalysis) {
  console.log(`Performing detailed main deck analysis for ${deckCards.length} cards...`);
  
  // Fetch detailed card data
  const cardData = [];
  for (let i = 0; i < deckCards.length; i++) {
    const card = await fetchCardData(deckCards[i]);
    cardData.push(card);
    
    if (i % 10 === 9) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  const validCards = cardData.filter(Boolean);
  
  // Calculate average CMC
  const totalCMC = validCards.reduce((sum, card) => sum + (card.cmc || 0), 0);
  const averageCMC = validCards.length > 0 ? (totalCMC / validCards.length).toFixed(2) : 0;
  
  // Identify key cards
  const keyCards = identifyKeyCards(validCards, basicAnalysis.archetype);
  
  // Analyze strengths and weaknesses
  const strengths = analyzeDeckStrengths(validCards, basicAnalysis);
  const weaknesses = analyzeDeckWeaknesses(validCards, basicAnalysis);
  
  // Consistency analysis
  const consistency = analyzeConsistency(validCards, basicAnalysis);

  return {
    cardCount: deckCards.length,
    validCardCount: validCards.length,
    averageCMC,
    keyCards,
    strengths,
    weaknesses,
    consistency,
    // Include all basic analysis data
    ...basicAnalysis
  };
}

function identifyKeyCards(cardData, archetype) {
  const keyCards = [];
  
  cardData.forEach(card => {
    if (!card) return;
    
    const text = card.oracle_text?.toLowerCase() || '';
    const types = card.type_line?.toLowerCase() || '';
    let role = '';
    
    // Determine card role based on archetype and card properties
    if (types.includes('planeswalker')) {
      role = 'Win Condition';
    } else if (text.includes('draw') && text.includes('card')) {
      role = 'Card Draw';
    } else if (text.includes('destroy') || text.includes('exile') || text.includes('damage')) {
      role = 'Removal';
    } else if (types.includes('creature') && (card.cmc >= 4 || (card.power && parseInt(card.power) >= 4))) {
      role = 'Threat';
    } else if (text.includes('counter') && text.includes('spell')) {
      role = 'Counterspell';
    } else if (types.includes('land')) {
      role = 'Mana Base';
    } else if (card.cmc <= 1 && types.includes('creature')) {
      role = 'Early Game';
    } else if (text.includes('protection') || text.includes('hexproof') || text.includes('indestructible')) {
      role = 'Protection';
    } else {
      role = 'Support';
    }
    
    // Only include non-land cards as "key cards" for display
    if (!types.includes('land') && role !== 'Support') {
      keyCards.push({
        name: card.name,
        role: role
      });
    }
  });
  
  // Limit to most important cards (top 8-10)
  return keyCards.slice(0, 10);
}

function analyzeDeckStrengths(cardData, basicAnalysis) {
  const strengths = [];
  const { archetype, synergies, cardTypes, manaCurve } = basicAnalysis;
  
  // Analyze based on archetype
  if (archetype.includes('Aggro')) {
    if (cardTypes.creatures >= 16) {
      strengths.push("Strong creature density for consistent pressure");
    }
    
    const lowCostCards = Object.entries(manaCurve).reduce((count, [cmc, num]) => {
      return parseInt(cmc) <= 2 ? count + num : count;
    }, 0);
    
    if (lowCostCards >= 20) {
      strengths.push("Excellent early game curve for fast starts");
    }
  }
  
  if (archetype.includes('Control')) {
    const interaction = cardTypes.instants + cardTypes.sorceries;
    if (interaction >= 20) {
      strengths.push("High density of interaction spells");
    }
    
    if (synergies.includes('Card Draw')) {
      strengths.push("Good card advantage engines");
    }
  }
  
  // General strengths
  if (synergies.length >= 2) {
    strengths.push(`Clear synergy focus: ${synergies.join(', ')}`);
  }
  
  const colors = basicAnalysis.colors || [];
  if (colors.length <= 2) {
    strengths.push("Focused mana base should be consistent");
  }
  
  // Check for removal density
  const removalCount = cardData.filter(card => {
    const text = card?.oracle_text?.toLowerCase() || '';
    return text.includes('destroy') || text.includes('exile') || 
           (text.includes('deal') && text.includes('damage'));
  }).length;
  
  if (removalCount >= 6) {
    strengths.push("Good removal suite for dealing with threats");
  }
  
  return strengths;
}

function analyzeDeckWeaknesses(cardData, basicAnalysis) {
  const weaknesses = [];
  const { archetype, cardTypes, manaCurve } = basicAnalysis;
  
  // Mana base analysis
  const totalCards = Object.values(manaCurve).reduce((sum, count) => sum + count, 0);
  const landRatio = (cardTypes.lands / totalCards) * 100;
  
  if (landRatio < 35) {
    weaknesses.push("Low land count may cause mana problems");
  } else if (landRatio > 45) {
    weaknesses.push("High land count may cause flooding");
  }
  
  // Curve analysis
  const avgCMC = Object.entries(manaCurve).reduce((sum, [cmc, count]) => {
    return sum + (parseInt(cmc) * count);
  }, 0) / Math.max(totalCards - cardTypes.lands, 1);
  
  if (avgCMC > 4 && !archetype.includes('Control')) {
    weaknesses.push("High average mana cost may be too slow");
  }
  
  // Archetype-specific weaknesses
  if (archetype.includes('Aggro')) {
    if (cardTypes.creatures < 14) {
      weaknesses.push("Low creature count for an aggressive strategy");
    }
    
    const highCostCards = Object.entries(manaCurve).reduce((count, [cmc, num]) => {
      return parseInt(cmc) >= 5 ? count + num : count;
    }, 0);
    
    if (highCostCards > 4) {
      weaknesses.push("Too many expensive cards for aggressive deck");
    }
  }
  
  if (archetype.includes('Control')) {
    const interaction = cardTypes.instants + cardTypes.sorceries;
    if (interaction < 15) {
      weaknesses.push("Low interaction count for control strategy");
    }
  }
  
  // Check for card draw
  const cardDrawCount = cardData.filter(card => {
    const text = card?.oracle_text?.toLowerCase() || '';
    return text.includes('draw') && text.includes('card');
  }).length;
  
  if (cardDrawCount < 3 && !archetype.includes('Aggro')) {
    weaknesses.push("Limited card draw may cause card advantage problems");
  }
  
  // Check color distribution for multicolor decks
  const colors = basicAnalysis.colors || [];
  if (colors.length >= 3) {
    const basicLands = cardData.filter(card => {
      const name = card?.name?.toLowerCase() || '';
      return name.includes('plains') || name.includes('island') || 
             name.includes('swamp') || name.includes('mountain') || 
             name.includes('forest');
    }).length;
    
    if (basicLands > 4) {
      weaknesses.push("Basic lands may not support three+ color mana base");
    }
  }
  
  return weaknesses;
}

function analyzeConsistency(cardData, basicAnalysis) {
  const { cardTypes, manaCurve } = basicAnalysis;
  const totalCards = Object.values(manaCurve).reduce((sum, count) => sum + count, 0);
  
  // Land ratio
  const landRatio = Math.round((cardTypes.lands / totalCards) * 100);
  
  // Curve quality assessment
  let curveQuality = 'Good';
  const lowCost = (manaCurve[1] || 0) + (manaCurve[2] || 0);
  const midCost = (manaCurve[3] || 0) + (manaCurve[4] || 0);
  const highCost = (manaCurve[5] || 0) + (manaCurve[6] || 0) + (manaCurve[7] || 0);
  
  if (lowCost < 8) {
    curveQuality = 'Slow Start';
  } else if (highCost > 8) {
    curveQuality = 'Top Heavy';
  } else if (lowCost >= 12 && midCost >= 8) {
    curveQuality = 'Excellent';
  }
  
  // Color balance
  const colors = basicAnalysis.colors || [];
  let colorBalance = 'Balanced';
  
  if (colors.length === 1) {
    colorBalance = 'Mono-Color';
  } else if (colors.length === 2) {
    colorBalance = 'Two-Color';
  } else if (colors.length >= 3) {
    // Check for fixing lands
    const fixingLands = cardData.filter(card => {
      const text = card?.oracle_text?.toLowerCase() || '';
      const name = card?.name?.toLowerCase() || '';
      return text.includes('add') && text.includes('mana') && 
             (text.includes('any color') || name.includes('pathway') || 
              name.includes('triome') || name.includes('shock'));
    }).length;
    
    if (fixingLands < colors.length) {
      colorBalance = 'Needs Fixing';
    } else {
      colorBalance = 'Well-Fixed';
    }
  }
  
  return {
    landRatio,
    curveQuality,
    colorBalance
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
    types: sideboardTypes,
    synergies: sideboardSynergies,
    colors: sideboardColors,
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

export { analyzeMatchups, fetchCardData, analyzeSideboard, analyzeMainDeck };
