import * as cheerio from "cheerio";
import fetch from "node-fetch";
import { fetchCardData } from "./analyzeMatchups.js";

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
      if (name && urlSuffix) decks.push({ name, urlSuffix });
    });

    const results = [];

    for (const deck of decks) {
      try {
        const deckUrl = "https://www.mtggoldfish.com" + deck.urlSuffix;
        const deckRes = await fetch(deckUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; MTGDeckAnalyzer/1.0)" },
        });
        const deckHtml = await deckRes.text();
        const $deck = cheerio.load(deckHtml);

        const keyCards = [];
        $deck("#mainboard .deck-view-card-list .card-item").each((i, el) => {
          if (i >= 15) return false;
          const cardName = $deck(el).find(".card-name").text().trim();
          if (cardName) keyCards.push(cardName);
        });

        const cardData = await Promise.all(keyCards.map(fetchCardData));
        const filtered = cardData.filter(Boolean);

        results.push({
          name: deck.name,
          profile: {
            colors: [...new Set(filtered.flatMap(c => c.color_identity || []))],
            synergies: detectSynergies(filtered),
            curve: computeCurve(filtered).curveDist,
          },
        });
      } catch (err) {
        console.error(`Error processing Goldfish deck ${deck.name}`, err.message);
      }
    }

    return results;
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
      const href = $(el).find("td:nth-child(2) a").attr("href");
      if (name && href) decks.push({ name, href });
    });

    const results = [];

    for (const deck of decks) {
      try {
        const deckUrl = "https://www.mtgtop8.com/" + deck.href;
        const res = await fetch(deckUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; MTGDeckAnalyzer/1.0)" },
        });
        const html = await res.text();
        const $deck = cheerio.load(html);

        const keyCards = [];
        $deck("#ctl00_ctl00_MainContent_SubContent_deckList tbody tr").each((i, el) => {
          if (i >= 15) return false;
          const cardName = $deck(el).find("td").eq(1).text().trim();
          if (cardName) keyCards.push(cardName);
        });

        const cardData = await Promise.all(keyCards.map(fetchCardData));
        const filtered = cardData.filter(Boolean);

        results.push({
          name: deck.name,
          profile: {
            colors: [...new Set(filtered.flatMap(c => c.color_identity || []))],
            synergies: detectSynergies(filtered),
            curve: computeCurve(filtered).curveDist,
          },
        });
      } catch (err) {
        console.error(`Error processing MTGTop8 deck ${deck.name}`, err.message);
      }
    }

    return results;
  } catch (error) {
    console.error("fetchMTGTop8Meta failed", error);
    return [];
  }
}

async function fetchScryfallArchetypes() {
  return [
    {
      name: "Esper Control",
      profile: {
        colors: ["W", "U", "B"],
        synergies: ["Card Draw"],
        curve: { 2: 4, 3: 4, 4: 3, 5: 2 },
      },
    },
    {
      name: "Mono-Green Stompy",
      profile: {
        colors: ["G"],
        synergies: ["Aggro/Combat"],
        curve: { 1: 4, 3: 4, 5: 2 },
      },
    },
    {
      name: "Mono-White Lifegain",
      profile: {
        colors: ["W"],
        synergies: ["Lifegain"],
        curve: { 1: 8, 2: 6, 3: 4, 4: 2 },
      },
    },
  ];
}

// Utility reuse (copied from analyzeMatchups)
function detectSynergies(cardData) {
  const textSnippets = cardData.map((card) => card.oracle_text || "").join(" ").toLowerCase();
  const synergies = [];
  if (textSnippets.includes("lifelink") || textSnippets.includes("gain life")) synergies.push("Lifegain");
  if (textSnippets.includes("prowess")) synergies.push("Prowess");
  if (textSnippets.includes("sacrifice")) synergies.push("Sacrifice");
  if (textSnippets.includes("graveyard") || textSnippets.includes("return target creature")) synergies.push("Reanimator");
  if (textSnippets.includes("draw a card")) synergies.push("Card Draw");
  if (textSnippets.includes("double strike")) synergies.push("Aggro/Combat");
  return synergies;
}

function computeCurve(cardData) {
  const curveDist = {};
  cardData.forEach((card) => {
    if (!card || card.cmc === undefined) return;
    const cmc = Math.min(card.cmc, 7);
    curveDist[cmc] = (curveDist[cmc] || 0) + 1;
  });
  return { curveDist };
}

export { fetchMTGGoldfishMeta, fetchMTGTop8Meta, fetchScryfallArchetypes };
