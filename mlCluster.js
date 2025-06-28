import fs from "fs";
import path from "path";
import KMeans from "ml-kmeans";

import { generateMetaProfile } from "./metaSources.js";
import {
  getColorIdentity,
  computeCurve,
  detectSynergies
} from "./analyzeMatchups.js";

const CLUSTERS_PATH = path.resolve("learnedArchetypes.json");

let clusterModel = null;

/**
 * Convert a profile into a vector for clustering:
 * - Colors: 5 binary values (W, U, B, R, G)
 * - Curve: CMC 0-6 bins (7 numbers)
 * - Synergies: 6 known flags
 */
function flattenProfile(profile) {
  const colorMap = ["W", "U", "B", "R", "G"];
  const synergyMap = ["Prowess", "Sacrifice", "Reanimator", "Cantrip", "Combat Focused", "Lifegain"];

  const colorVector = colorMap.map((c) => profile.colors.includes(c) ? 1 : 0);
  const curveVector = Array.from({ length: 7 }, (_, i) => profile.curve[i] || 0);
  const synergyVector = synergyMap.map((s) => profile.synergies.includes(s) ? 1 : 0);

  return [...colorVector, ...curveVector, ...synergyVector];
}

async function learnClusters(decks) {
  const vectors = [];
  const names = [];

  for (const deck of decks) {
    if (!deck.keyCards || deck.keyCards.length === 0) continue;

    const profile = await generateMetaProfile(deck);
    const vector = flattenProfile(profile);

    vectors.push(vector);
    names.push(deck.name);
  }

  clusterModel = KMeans(vectors, 5);
  const labeledCentroids = clusterModel.centroids.map((centroid, i) => ({
    id: i,
    centroid: centroid.centroid,
    closest: names[clusterModel.clusters[i][0]] || `Cluster ${i}`,
  }));

  fs.writeFileSync(CLUSTERS_PATH, JSON.stringify({ centroids: labeledCentroids }, null, 2));
  return { clusters: labeledCentroids };
}

function classifyDeck(deckProfile) {
  if (!clusterModel && fs.existsSync(CLUSTERS_PATH)) {
    const saved = JSON.parse(fs.readFileSync(CLUSTERS_PATH, "utf8"));
    clusterModel = {
      centroids: saved.centroids.map(c => ({ centroid: c.centroid })),
      predict: (vectors) => {
        return vectors.map(vec => {
          let bestIdx = 0;
          let bestDist = Infinity;
          clusterModel.centroids.forEach((c, i) => {
            const dist = euclideanDistance(c.centroid, vec);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
            }
          });
          return bestIdx;
        });
      }
    };
  }

  const vector = flattenProfile(deckProfile);
  const clusterId = clusterModel?.predict?.([vector])[0];
  return { cluster: clusterId ?? "Unknown" };
}

function euclideanDistance(a, b) {
  return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0));
}

export { learnClusters, classifyDeck };
