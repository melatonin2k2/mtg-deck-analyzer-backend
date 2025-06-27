// backend/mlCluster.js
import fs from "fs";
import path from "path";
import { analyzeMatchups } from "./analyzeMatchups.js";
import KMeans from "ml-kmeans";

const CLUSTERS_PATH = path.resolve("learnedArchetypes.json");

let clusterModel = null;

function flattenProfile(profile) {
  const colors = ["W", "U", "B", "R", "G"].map(c => profile.colors.includes(c) ? 1 : 0);
  const curve = Array.from({ length: 7 }, (_, i) => profile.curve[i] || 0);
  const synergies = ["Prowess", "Sacrifice", "Reanimator", "Cantrip", "Combat Focused"]
    .map(tag => profile.synergies.includes(tag) ? 1 : 0);
  return [...colors, ...curve, ...synergies];
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

  const k = 5; // You can tune this
  clusterModel = KMeans(vectors, k);

  // Save minimal data for restoring predictability
  const stored = {
    centroids: clusterModel.centroids.map(c => c.centroid),
    k
  };

  fs.writeFileSync(CLUSTERS_PATH, JSON.stringify(stored, null, 2));
  return { clusters: stored.centroids };
}

async function classifyDeck(deckCards) {
  // Rebuild model from saved JSON if not loaded
  if (!clusterModel) {
    if (!fs.existsSync(CLUSTERS_PATH)) return { cluster: "Unknown" };

    const saved = JSON.parse(fs.readFileSync(CLUSTERS_PATH, "utf-8"));
    clusterModel = {
      centroids: saved.centroids.map((centroid) => ({ centroid })),
      predict: (vectors) => {
        return vectors.map((vec) => {
          let bestDist = Infinity;
          let bestIndex = -1;
          for (let i = 0; i < saved.centroids.length; i++) {
            const dist = euclidean(vec, saved.centroids[i]);
            if (dist < bestDist) {
              bestDist = dist;
              bestIndex = i;
            }
          }
          return bestIndex;
        });
      }
    };
  }

  const analysis = await analyzeMatchups(deckCards);
  const vector = flattenProfile({
    colors: analysis.colors,
    curve: analysis.manaCurve,
    synergies: analysis.synergies,
  });

  const clusterIndex = clusterModel.predict([vector])[0];
  return { cluster: clusterIndex };
}

function euclidean(a, b) {
  return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0));
}

export { learnClusters, classifyDeck };
