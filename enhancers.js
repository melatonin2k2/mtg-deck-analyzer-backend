import fetch from "node-fetch";

// Cache for card data to avoid repeated API calls
const cardCache = new Map();

const fetchCardData = async (cardName) => {
  if (cardCache.has(cardName)) {
    return cardCache.get(cardName);
  }

  try {
    // Add delay to respect Scryfall rate limits (50-100ms between requests)
    await new Promise(resolve => setTimeout(resolve, 75));
    
    const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`);
    
    if (!res.ok) {
      // Try fuzzy search if exact fails
      const fuzzyRes = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`);
      if (!fuzzyRes.ok) {
        throw new Error(`Card not found: ${cardName}`);
      }
      const data = await fuzzyRes.json();
      cardCache.set(cardName, data);
      return data;
    }
    
    const data = await res.json();
    cardCache.set(cardName, data);
    return data;
  } catch (err) {
    console.error(`Failed to fetch ${cardName}:`, err.message);
    cardCache.set(cardName, null);
    return null;
  }
};

export async function enhanceWithScryfall(cards) {
  console.log(`Enhancing ${cards.length} cards with Scryfall data...`);
  const results = [];
  
  for (const cardName of cards) {
    const cardData = await fetchCardData(cardName);
    results.push(cardData);
  }
  
  console.log(`Enhanced ${results.filter(Boolean).length} cards successfully`);
  return results;
}

async function findBetterAlternatives(card, cardData, maxResults = 3) {
  if (!cardData || !cardData.colors) return [];
  
  try {
    const { colors, cmc = 0, type_line = "" } = cardData;
    
    // Build search query for similar but potentially better cards
    let searchQuery = "";
    
    if (colors.length > 0) {
      searchQuery += `c:${colors.join("")} `;
    }
    
    // Look for cards with similar or lower CMC
    if (cmc > 0) {
      searchQuery += `cmc<=${Math.max(1, cmc)} `;
    }
    
    // Add type restrictions
    if (type_line.includes("Creature")) {
      searchQuery += `t:creature `;
    } else if (type_line.includes("Instant")) {
      searchQuery += `t:instant `;
    } else if (type_line.includes("Sorcery")) {
      searchQuery += `t:sorcery `;
    }
    
    // Focus on Standard-legal cards
    searchQuery += `legal:standard `;
    
    // Add delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const searchUrl = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(searchQuery.trim())}&order=edhrec&dir=desc`;
    const res = await fetch(searchUrl);
    
    if (!res.ok) {
      return [];
    }
    
    const searchResults = await res.json();
    
    if (!searchResults.data) {
      return [];
    }
    
    // Filter out the original card and return top alternatives
    return searchResults.data
      .filter(altCard => altCard.name !== card)
      .slice(0, maxResults)
      .map(altCard => ({
        name: altCard.name,
        mana_cost: altCard.mana_cost,
        type_line: altCard.type_line,
        oracle_text: altCard.oracle_text
      }));
      
  } catch (err) {
    console.warn(`Failed to find alternatives for ${card}:`, err.message);
    return [];
  }
}

export async function recommendReplacements(deckCards, fetchedCards) {
  console.log("Analyzing cards for potential replacements...");
  const replacements = [];

  for (let i = 0; i < Math.min(deckCards.length, fetchedCards.length); i++) {
    const cardName = deckCards[i];
    const cardData = fetchedCards[i];
    
    if (!cardData) {
      replacements.push({
        replace: cardName,
        with: "Card not found",
        reason: "Could not fetch card data",
        alternatives: []
      });
      continue;
    }

    const { 
      type_line = "", 
      oracle_text = "", 
      colors = [], 
      cmc = 0, 
      set_type = "",
      legalities = {}
    } = cardData;

    let shouldReplace = false;
    let reason = "";

    // Check if card is not Standard legal
    if (legalities.standard !== "legal") {
      shouldReplace = true;
      reason = "Not legal in Standard format";
    }
    // Check for vanilla creatures (creatures with no abilities)
    else if (type_line.includes("Creature") && oracle_text.trim() === "") {
      shouldReplace = true;
      reason = "Vanilla creature - consider creatures with abilities";
    }
    // Check for high CMC cards without immediate impact
    else if (cmc >= 6 && !oracle_text.toLowerCase().includes("when") && 
             !oracle_text.toLowerCase().includes("etb") &&
             !oracle_text.toLowerCase().includes("enters")) {
      shouldReplace = true;
      reason = "High mana cost without immediate impact";
    }
    // Check for draft-specific or weak sets
    else if (set_type === "draft_innovation" || set_type === "funny") {
      shouldReplace = true;
      reason = "From a draft or novelty set";
    }
    
    if (shouldReplace) {
      const alternatives = await findBetterAlternatives(cardName, cardData);
      
      replacements.push({
        replace: cardName,
        with: alternatives.length > 0 ? alternatives[0].name : "No alternatives found",
        reason,
        alternatives: alternatives.slice(0, 3) // Top 3 alternatives
      });
    }
  }

  console.log(`Found ${replacements.length} potential replacements`);
  return replacements;
}
