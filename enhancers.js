// backend/enhancers.js
import fetch from "node-fetch";

async function enhanceWithScryfall(cards) {
  const results = await Promise.all(
    cards.map(async (card) => {
      try {
        const res = await fetch(
          `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card)}`
        );
        if (!res.ok) return "";
        const data = await res.json();
        return data.type_line || "";
      } catch {
        return "";
      }
    })
  );
  return results;
}

export { enhanceWithScryfall };
