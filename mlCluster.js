// mlCluster.js
import fs from "fs";
import path from "path";
import { analyzeMatchups } from "./analyzeMatchups.js";
import KMeans from "ml-kmeans";

const CLUSTERS_PATH = path.resolve("learnedArchetypes.json");

let clusterModel = null;

function flattenProfile(profile) {
  const colors = ["W", "U", "B", "R", "G"].map(c => profile.colors.includes(c) ? 1 : 0);
  const curve = Array.from({ length: 7 }, (_, i) => profile.curve[i] || 0);
  const synergyFlags = ["Prowess", "Sacrifice", "Reanimator", "Cantrip", "Combat Focused"]
    .map(s => profile.synergies.includes(s) ? 1 : 0);
  return [...colors, ...curve, ...synergyFlags];
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

function classifyDeck(deckCards) {
  if (!clusterModel && fs.existsSync(CLUSTERS_PATH)) {
    const saved = JSON.parse(fs.readFileSync(CLUSTERS_PATH));
    clusterModel = saved;
  }

  return { cluster: clusterModel?.predict?.([flattenProfile(deckCards)])[0] ?? "Unknown" };
}

export { learnClusters, classifyDeck };
