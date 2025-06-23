// enhancers.js (updated with Scryfall safety and meta frequencies)

import { fetchMetaCardFrequency } from "./metaFrequency.js";

const fetchCardData = async (cardName) => {
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`);
    const contentType = res.headers.get("content-type");
    if (!res.ok || !contentType || !contentType.includes("application/json")) {
      throw new Error(`Unexpected response for card ${cardName}`);
    }
    return await res.json();
  } catch (err) {
    console.error(`Failed to fetch ${cardName}:`, err);
    return null;
  }
};

export async function enhanceWithScryfall(cards) {
  const results = await Promise.all(cards.map(fetchCardData));
  return results;
}

export async function recommendReplacements(deckCards, fetchedCards) {
  const replacements = [];
  const metaFrequencies = await fetchMetaCardFrequency();

  for (let i = 0; i < deckCards.length; i++) {
    const card = deckCards[i];
    const data = fetchedCards[i];
    if (!data) continue;

    const { type_line = "", oracle_text = "", colors = [], cmc = 0, keywords = [], set_type = "" } = data;

    const isVanilla = oracle_text.trim() === "" && type_line.includes("Creature");
    const isHighCMC = cmc >= 6 && !oracle_text.toLowerCase().includes("win") && !keywords.includes("Flash");
    const isDraftOnly = set_type === "draft_innovation";
    const isLowMeta = !metaFrequencies[card] || metaFrequencies[card] < 2;

    if (isVanilla || isHighCMC || isDraftOnly || isLowMeta) {
      const searchURL = `https://api.scryfall.com/cards/search?q=c:${colors.join("")}%20cmc%3C${Math.floor(cmc)}%20is%3Astandard%20unique%3Aprints`;
      try {
        const res = await fetch(searchURL);
        const contentType = res.headers.get("content-type");
        if (!res.ok || !contentType || !contentType.includes("application/json")) {
          throw new Error("Unexpected response from Scryfall search");
        }
        const json = await res.json();
        if (json.data && json.data.length > 0) {
          const suggestion = json.data.find(c => c.name !== card);
          if (suggestion) {
            replacements.push({
              replace: card,
              with: suggestion.name,
              reason: isVanilla
                ? "Vanilla creature"
                : isHighCMC
                ? "Too slow/high-CMC"
                : isDraftOnly
                ? "Draft-only card"
                : "Rarely played in meta"
            });
          }
        }
      } catch (err) {
        console.warn("Replacement fetch failed for", card, err);
      }
    }
  }

  return replacements;
}
