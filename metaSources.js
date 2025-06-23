import * as cheerio from "cheerio";
import fetch from "node-fetch";

const MTG_GOLDFISH_STANDARD_META_URL = "https://www.mtggoldfish.com/metagame/standard/full";
const MTG_TOP8_STANDARD_META_URL = "https://www.mtgtop8.com/format?f=ST";

async function fetchMTGGoldfishMeta() {
  try {
    const res = await fetch(MTG_GOLDFISH_STANDARD_META_URL);
    const html = await res.text();
    const $ = cheerio.load(html);

    const decks = [];

    // On mtggoldfish, meta decks are in tables under ".archetype-metagame" or similar
    // Inspect and adjust selectors if site structure changes

    $(".metagame-rankings .archetype-rankings-table tbody tr").each((i, el) => {
      if (i >= 10) return false; // limit top 10 decks

      const name = $(el).find("td.archetype a").text().trim();
      const urlSuffix = $(el).find("td.archetype a").attr("href");

      // Extract key cards from the decklist page (async in a separate function)
      decks.push({ name, urlSuffix });
    });

    // For each deck, fetch its page to parse key cards
    for (const deck of decks) {
      if (!deck.urlSuffix) continue;
      try {
        const deckUrl = "https://www.mtggoldfish.com" + deck.urlSuffix;
        const deckRes = await fetch(deckUrl);
        const deckHtml = await deckRes.text();
        const $deck = cheerio.load(deckHtml);

        // Key cards are usually in the "Main Deck" section, top 5 most played cards
        // Adjust selector if necessary
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
    const res = await fetch(MTG_TOP8_STANDARD_META_URL);
    const html = await res.text();
    const $ = cheerio.load(html);

    const decks = [];

    // On MTGTop8, formats page has archetypes listed with links
    // Selector might need tweaking based on current site structure
    $("#archetype-results-table tbody tr").each((i, el) => {
      if (i >= 10) return false; // top 10

      const name = $(el).find("td:nth-child(2) a").text().trim();
      const deckUrlSuffix = $(el).find("td:nth-child(2) a").attr("href");

      decks.push({ name, deckUrlSuffix });
    });

    // For each deck, fetch key cards from deck detail page
    for (const deck of decks) {
      if (!deck.deckUrlSuffix) continue;
      try {
        const deckUrl = "https://www.mtgtop8.com/" + deck.deckUrlSuffix;
        const deckRes = await fetch(deckUrl);
        const deckHtml = await deckRes.text();
        const $deck = cheerio.load(deckHtml);

        const keyCards = [];
        // On MTGTop8 deck page, card lists are under #ctl00_ctl00_MainContent_SubContent_deckList
        // Get top 5 most played cards

        $deck("#ctl00_ctl00_MainContent_SubContent_deckList tbody tr").each((i, el) => {
          if (i >= 5) return false;
          const qty = parseInt($deck(el).find("td").eq(0).text().trim());
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
    // Scryfall doesn't officially expose meta archetypes, but you can fetch card data for known archetypes.
    // Here we return some static examples or integrate your own archetype DB.

    // Alternatively, you can pull popular archetype cards from external datasets or community APIs.

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
