// Share links carry the whole trip inside the URL fragment (never sent to a
// server), compressed with the browser's native CompressionStream.
import { SavedTripSchema } from "../../shared/schema.js";

const toB64Url = (bytes) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64Url = (str) => {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export async function encodeTrip(trip) {
  const stream = new Blob([JSON.stringify(trip)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return toB64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

export async function decodeTrip(encoded) {
  const stream = new Blob([fromB64Url(encoded)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const json = JSON.parse(await new Response(stream).text());
  const parsed = SavedTripSchema.safeParse(json);
  if (!parsed.success) throw new Error("This share link is damaged or from an incompatible version.");
  return parsed.data;
}

export async function shareUrl(trip) {
  const url = new URL(window.location.href);
  url.hash = `trip=${await encodeTrip(trip)}`;
  return url.toString();
}

export function readSharedFromHash() {
  const m = window.location.hash.match(/trip=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}
