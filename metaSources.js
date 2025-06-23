// metaSources.js
import fetch from "node-fetch";
import cheerio from "cheerio";

// Fetch and parse MTGGoldfish meta decks
export async function fetchMTGGoldfishMeta() {
  const url = "https://www.mtggoldfish.com/metagame/standard/full";
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);

  const decks = [];
  $("table.table tbody tr").each((_, el) => {
    const name = $(el).find("td.deck-price-paper a").text().trim();
    const cardList = $(el).find("td.deck-col-card a").map((_, el) => $(el).text()).get();
    if (name && cardList.length) {
      decks.push({ name, keyCards: cardList.slice(0, 10) }); // top 10 key cards
    }
  });

  return decks;
}

// Fetch Scryfall archetype catalog
export async function fetchScryfallArchetypes() {
  const res = await fetch("https://api.scryfall.com/catalog/archetypes");
  const data = await res.json();
  return data.data.map(name => ({ name, keyCards: [] })); // placeholder keyCards
}

// Mock MTGTop8 meta decks (real scraping needs more complex setup)
export async function fetchMTGTop8Meta() {
  return [
    { name: "Golgari Midrange", keyCards: ["Glissa Sunslayer", "Virtue of Persistence"] },
    { name: "Azorius Control", keyCards: ["Sunfall", "Memory Deluge"] }
  ];
}
