// backend/metaSources.js

import fetch from "node-fetch";
import cheerio from "cheerio";

// Fetch and parse MTGGoldfish meta decks
export async function fetchMTGGoldfishMeta() {
  const url = "https://www.mtggoldfish.com/metagame/standard/full";
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);

  const decks = [];
  $(".deck-price-paper").each((i, el) => {
    const name = $(el).closest("tr").find(".deck-price-paper a").text().trim();
    const cardList = $(el).closest("tr").find(".deck-col-card a").map((i, el) => $(el).text()).get();
    if (name && cardList.length) {
      decks.push({ name, keyCards: cardList.slice(0, 10) });
    }
  });

  return decks;
}

// Fetch Scryfall archetype tags (mocked)
export async function fetchScryfallArchetypes() {
  const res = await fetch("https://api.scryfall.com/catalog/archetypes");
  const data = await res.json();
  return data.data.map(name => ({ name, keyCards: [] })); // Needs enrichment
}

// Fetch from MTGTop8 (mocked since it's harder to scrape without CAPTCHA)
export async function fetchMTGTop8Meta() {
  return [
    { name: "Golgari Midrange", keyCards: ["Glissa Sunslayer", "Virtue of Persistence"] },
    { name: "Azorius Control", keyCards: ["Sunfall", "Memory Deluge"] }
  ];
}
