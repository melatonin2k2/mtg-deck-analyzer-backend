// metaSources.js
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const MTG_GOLDFISH_STANDARD_META_URL = "https://www.mtggoldfish.com/metagame/standard/full";
const MTG_TOP8_STANDARD_META_URL = "https://www.mtgtop8.com/format?f=ST";

async function fetchMTGGoldfishMeta() {
  try {
    const res = await fetch(MTG_GOLDFISH_STANDARD_META_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MTGDeckAnalyzer/1.0)" },
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    const decks = [];

    $(".metagame-rankings .archetype-rankings-table tbody tr").each((i, el) => {
      if (i >= 10) return false;

      const name = $(el).find("td.archetype a").text().trim();
      const urlSuffix = $(el).find("td.archetype a").attr("href");

      decks.push({ name, urlSuffix });
    });

    for (const deck of decks) {
      if (!deck.urlSuffix) continue;
      try {
        const deckUrl = "https://www.mtggoldfish.com" + deck.urlSuffix;
        const deckRes = await fetch(deckUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; MTGDeckAnalyzer/1.0)" },
        });
        const deckHtml = await deckRes.text();
        const $deck = cheerio.load(deckHtml);

        const keyCards = [];
        $deck("#mainboard .deck-view-card-list .card-item").each((i, el) => {
          if (i >= 5) return false;
          const cardName = $deck(el).find(".card-name").text().trim();
          if (cardName) keyCards.push(cardName);
        });

        deck.keyCards = keyCards;
      } catch (error) {
        console.error("Error fetching deck details for", deck.name, error);
        deck.keyCards = [];
      }
    }

    return decks;
  } catch (error) {
    console.error("fetchMTGGoldfishMeta failed", error);
    return [];
  }
}

async function fetchMTGTop8Meta() {
  try {
    const res = await fetch(MTG_TOP8_STANDARD_META_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MTGDeckAnalyzer/1.0)" },
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    const decks = [];

    $("#archetype-results-table tbody tr").each((i, el) => {
      if (i >= 10) return false;

      const name = $(el).find("td:nth-child(2) a").text().trim();
      const deckUrlSuffix = $(el).find("td:nth-child(2) a").attr("href");

      decks.push({ name, deckUrlSuffix });
    });

    for (const deck of decks) {
      if (!deck.deckUrlSuffix) continue;
      try {
        const deckUrl = "https://www.mtgtop8.com/" + deck.deckUrlSuffix;
        const deckRes = await fetch(deckUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; MTGDeckAnalyzer/1.0)" },
        });
        const deckHtml = await deckRes.text();
        const $deck = cheerio.load(deckHtml);

        const keyCards = [];
        $deck("#ctl00_ctl00_MainContent_SubContent_deckList tbody tr").each((i, el) => {
          if (i >= 5) return false;
          const cardName = $deck(el).find("td").eq(1).text().trim();
          if (cardName) keyCards.push(cardName);
        });

        deck.keyCards = keyCards;
      } catch (error) {
        console.error("Error fetching deck details for", deck.name, error);
        deck.keyCards = [];
      }
    }

    return decks;
  } catch (error) {
    console.error("fetchMTGTop8Meta failed", error);
    return [];
  }
}

async function fetchScryfallArchetypes() {
  try {
    // This is a static example. Ideally, you build or pull a curated archetype DB.
    return [
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
  } catch (error) {
    console.error("fetchScryfallArchetypes error", error);
    return [];
  }
}

export { fetchMTGGoldfishMeta, fetchMTGTop8Meta, fetchScryfallArchetypes };
