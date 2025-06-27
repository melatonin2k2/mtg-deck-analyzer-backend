// backend/metaSources.js
import * as cheerio from "cheerio";
import fetch from "node-fetch";
import { fetchCardData } from "./analyzeMatchups.js"; // Assumes it's exported

const MTG_GOLDFISH_STANDARD_META_URL = "https://www.mtggoldfish.com/metagame/standard/full";
const MTG_TOP8_STANDARD_META_URL = "https://www.mtgtop8.com/format?f=ST";

async function safeFetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MTGDeckAnalyzer/1.0)"
    }
  });

  const contentType = res.headers.get("content-type");
  if (!res.ok || !contentType.includes("text/html")) {
    throw new Error(`Unexpected response type or status from ${url}`);
  }

  return await res.text();
}

async function fetchMTGGoldfishMeta() {
  try {
    const html = await safeFetchText(MTG_GOLDFISH_STANDARD_META_URL);
    const $ = cheerio.load(html);
    const decks = [];

    $(".metagame-rankings .archetype-rankings-table tbody tr").each((i, el) => {
      if (i >= 10) return false;
      const name = $(el).find("td.archetype a").text().trim();
      const urlSuffix = $(el).find("td.archetype a").attr("href");
      decks.push({ name, urlSuffix });
    });

    const enriched = [];

    for (const deck of decks) {
      try {
        const deckHtml = await safeFetchText("https://www.mtggoldfish.com" + deck.urlSuffix);
        const $deck = cheerio.load(deckHtml);
        const keyCards = [];

        $deck("#mainboard .deck-view-card-list .card-item").each((i, el) => {
          if (i >= 5) return false;
          const cardName = $deck(el).find(".card-name").text().trim();
          if (cardName) keyCards.push(cardName);
        });

        const cards = await Promise.all(keyCards.map(fetchCardData));
        enriched.push({
          name: deck.name,
          keyCards,
          profile: generateProfile(cards.filter(Boolean))
        });

      } catch (err) {
        console.warn(`Skipping ${deck.name} (Goldfish):`, err.message);
      }
    }

    return enriched;
  } catch (error) {
    console.error("fetchMTGGoldfishMeta failed", error);
    return [];
  }
}

async function fetchMTGTop8Meta() {
  try {
    const html = await safeFetchText(MTG_TOP8_STANDARD_META_URL);
    const $ = cheerio.load(html);
    const decks = [];

    $("#archetype-results-table tbody tr").each((i, el) => {
      if (i >= 10) return false;
      const name = $(el).find("td:nth-child(2) a").text().trim();
      const deckUrlSuffix = $(el).find("td:nth-child(2) a").attr("href");
      decks.push({ name, deckUrlSuffix });
    });

    const enriched = [];

    for (const deck of decks) {
      try {
        const deckHtml = await safeFetchText("https://www.mtgtop8.com/" + deck.deckUrlSuffix);
        const $deck = cheerio.load(deckHtml);
        const keyCards = [];

        $deck("#ctl00_ctl00_MainContent_SubContent_deckList tbody tr").each((i, el) => {
          if (i >= 5) return false;
          const cardName = $deck(el).find("td").eq(1).text().trim();
          if (cardName) keyCards.push(cardName);
        });

        const cards = await Promise.all(keyCards.map(fetchCardData));
        enriched.push({
          name: deck.name,
          keyCards,
          profile: generateProfile(cards.filter(Boolean))
        });

      } catch (err) {
        console.warn(`Skipping ${deck.name} (Top8):`, err.message);
      }
    }

    return enriched;
  } catch (error) {
    console.error("fetchMTGTop8Meta failed", error);
    return [];
  }
}

async function fetchScryfallArchetypes() {
  try {
    const decks = [
      {
        name: "Esper Control",
        keyCards: [
          "Teferi, Hero of Dominaria",
          "Narset, Parter of Veils",
          "Supreme Verdict",
          "Field of Ruin",
          "Search for Azcanta",
        ],
      },
      {
        name: "Mono-Green Stompy",
        keyCards: [
          "Llanowar Elves",
          "Steel-Leaf Champion",
          "Nissa, Who Shakes the World",
          "Aspect of Hydra",
          "Questing Beast",
        ],
      },
    ];

    const enriched = [];

    for (const deck of decks) {
      const cards = await Promise.all(deck.keyCards.map(fetchCardData));
      enriched.push({
        name: deck.name,
        keyCards: deck.keyCards,
        profile: generateProfile(cards.filter(Boolean))
      });
    }

    return enriched;
  } catch (error) {
    console.error("fetchScryfallArchetypes error", error);
    return [];
  }
}

function generateProfile(cardData) {
  const colors = new Set();
  const curve = {};
  const synergies = [];

  cardData.forEach(card => {
    (card.color_identity || []).forEach(c => colors.add(c));
    if (card.cmc !== undefined) curve[card.cmc] = (curve[card.cmc] || 0) + 1;
    const text = card.oracle_text?.toLowerCase() || "";
    if (text.includes("prowess") && !synergies.includes("Prowess")) synergies.push("Prowess");
    if (text.includes("sacrifice") && !synergies.includes("Sacrifice")) synergies.push("Sacrifice");
    if (text.includes("draw a card") && !synergies.includes("Cantrip")) synergies.push("Cantrip");
    if (text.includes("return target creature") && !synergies.includes("Reanimator")) synergies.push("Reanimator");
  });

  return {
    colors: [...colors],
    curve,
    synergies
  };
}

export {
  fetchMTGGoldfishMeta,
  fetchMTGTop8Meta,
  fetchScryfallArchetypes
};
