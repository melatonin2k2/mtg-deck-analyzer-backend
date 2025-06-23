export async function enhanceWithScryfall(cards) {
  const results = await Promise.all(
    cards.map(async (card) => {
      try {
        const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card)}`);
        const data = await res.json();
        return data.type_line || "";
      } catch (err) {
        console.error(`Failed to fetch ${card}:`, err);
        return "";
      }
    })
  );
  return results;
}
