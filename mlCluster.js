// backend/mlCluster.js
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const natural = require("natural");
const KMeans = require("ml-kmeans");

const TfIdf = natural.TfIdf;
const tokenizer = new natural.WordTokenizer();

/**
 * Tokenizes and vectorizes an array of deck card text strings
 */
function vectorizeDecks(deckCardTexts) {
  const tfidf = new TfIdf();
  deckCardTexts.forEach(text => tfidf.addDocument(tokenizer.tokenize(text)));

  const vectors = [];
  for (let i = 0; i < deckCardTexts.length; i++) {
    const vector = [];
    tfidf.listTerms(i).forEach(term => {
      vector.push(term.tfidf);
    });
    vectors.push(vector);
  }
  return vectors;
}

/**
 * Clusters decks into archetype groups using KMeans
 */
function clusterDecks(deckCardTexts, k = 4) {
  const vectors = vectorizeDecks(deckCardTexts);
  if (vectors.length < k) k = vectors.length;

  const paddedVectors = vectors.map(vec => {
    const maxLen = Math.max(...vectors.map(v => v.length));
    while (vec.length < maxLen) vec.push(0); // pad with zeros
    return vec;
  });

  const result = KMeans(paddedVectors, k);
  return {
    clusters: result.clusters,
    centroids: result.centroids,
  };
}

export { clusterDecks };
