import { encodeHex } from "./encodings";

const utf8Encoder = new TextEncoder();

const assetSources = {
  "tailwindcssbase": "https://cdn.jsdelivr.net/npm/tailwindcss@^2/dist/base.min.css",
  "night-owl": "https://cdn.jsdelivr.net/npm/highlight.js@11.2.0/styles/night-owl.css",
}
const assetsCache = new Map();

export function lookupAsset(assetName) {
  return assetsCache.get(assetName)
}

async function fetchAsset(url) {
  return await fetch(url)
    .then(res => res.text())
    .then(async (source) => ({
      source,
      sha256: await crypto.subtle.digest("SHA-256", utf8Encoder.encode(source))
    }))
}
export async function loadAssets() {
  const promises = [];
  for (const [key, url] of Object.entries(assetSources)) {
    if (!assetsCache.has(key)) {
      // We make all fetches in advance so they can run in parallel.
      promises.push(
        fetchAsset(url).then((data) => {
          assetsCache.set(key, data);
        })
      );
    }
  }

  await Promise.all(promises);
}
export function assetSHA256(assetName) {
  return encodeHex(assetsCache.get(assetName).sha256)
}
