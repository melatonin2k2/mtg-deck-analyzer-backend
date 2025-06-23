import { analyzeMatchups } from "./analyzeMatchups.js";
import { fetchMTGGoldfishMeta, fetchScryfallArchetypes, fetchMTGTop8Meta } from "./metaSources.js";

async function fetchMetaDecks() {
  const [goldfish, scryfall, top8] = await Promise.all([
    fetchMTGGoldfishMeta(),
    fetchScryfallArchetypes(),
    fetchMTGTop8Meta()
  ]);
  return [...goldfish, ...top8, ...scryfall];
}
