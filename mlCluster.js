import fs from "fs";
import path from "path";
import { analyzeMatchups } from "./analyzeMatchups.js";
import KMeans from "ml-kmeans";

const CLUSTERS_PATH = path.resolve("learnedArchetypes.json");

let clusterModel = null;

function flattenProfile(profile) {
  const colorVector = ["W", "U", "B", "R", "G"].map((c) => profile.colors.includes(c) ? 1 : 0);
  const curveVector = Array.from({ length: 8 }, (_, i) => profile.curve[i] || 0); // 0–7+ CMC bucket
  const synergyVector = ["Lifegain", "Prowess", "Sacrifice", "Reanimator", "Card Draw", "Aggro/Combat"]
    .map((s) => profile.synergies.includes(s) ? 1 : 0);
  return [...colorVector, ...curveVector, ...synergyVector];
}

async function learnClusters(decks) {
  const vectors = [];
  for (const deck of decks) {
    const analysis = await analyzeMatchups(deck);
    const vector = flattenProfile({
      colors: analysis.colors,
      curve: analysis.manaCurve,
      synergies: analysis.synergies,
    });
    vectors.push(vector);
  }

  clusterModel = KMeans(vectors, 5);
  fs.writeFileSync(CLUSTERS_PATH, JSON.stringify(clusterModel, null, 2));
  return { clusters: clusterModel.centroids };
}

function classifyDeck(deckProfile) {
  if (!clusterModel && fs.existsSync(CLUSTERS_PATH)) {
    clusterModel = JSON.parse(fs.readFileSync(CLUSTERS_PATH));
  }

  const vector = flattenProfile(deckProfile);
  if (clusterModel?.predict) {
    return { cluster: clusterModel.predict([vector])[0] };
  }

  return { cluster: "Unknown" };
}

export { learnClusters, classifyDeck };
