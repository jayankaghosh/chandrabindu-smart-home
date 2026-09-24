// Sunrise/sunset times for the house location, fetched once a day from
// sunrisesunset.io and cached to data/suntimes.json. The automation scheduler
// (lib/automationScheduler.ts) reads these to fire "sun" triggers. Times are
// stored as local "HH:MM" (the API returns the location's local time, which on
// a home hub matches the server clock).

import fs from "fs";
import path from "path";
import { getLatLng } from "./config";

const DATA_DIR = path.join(process.cwd(), "data");
const PATH = path.join(DATA_DIR, "suntimes.json");

export interface SunTimes {
  sunrise: string; // "HH:MM" local
  sunset: string; // "HH:MM" local
}

interface SunCache extends SunTimes {
  date: string; // "YYYY-MM-DD" local
  lat: number;
  lng: number;
  fetchedAt: number;
}

/** Local date as "YYYY-MM-DD". */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse the API's "6:12:34 AM" / "18:45:00" into 24-hour "HH:MM". */
function to24h(raw: string): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(raw.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2];
  const ampm = m[4]?.toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}

function readCache(): SunCache | null {
  try {
    return JSON.parse(fs.readFileSync(PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(c: SunCache): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PATH, JSON.stringify(c, null, 2), "utf8");
  } catch {
    /* ignore — a failed cache write just means we refetch next tick */
  }
}

/**
 * Today's sunrise/sunset, fetching from the API only when the cache is missing,
 * from another day, or from a different location. Returns null when no location
 * is configured. On a fetch failure, falls back to whatever is cached (even if
 * stale) so a transient network blip doesn't disable sun automations.
 */
export async function getSunTimes(): Promise<SunTimes | null> {
  const loc = getLatLng();
  if (!loc) return null;

  const cache = readCache();
  if (cache && cache.date === today() && cache.lat === loc.lat && cache.lng === loc.lng) {
    return { sunrise: cache.sunrise, sunset: cache.sunset };
  }

  try {
    const url = `https://api.sunrisesunset.io/json?lat=${loc.lat}&lng=${loc.lng}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json();
    if (data?.status !== "OK" || !data?.results) throw new Error(`sun API status ${data?.status}`);
    const sunrise = to24h(String(data.results.sunrise));
    const sunset = to24h(String(data.results.sunset));
    if (!sunrise || !sunset) throw new Error("unparseable sun times");
    writeCache({ date: today(), lat: loc.lat, lng: loc.lng, sunrise, sunset, fetchedAt: Date.now() });
    return { sunrise, sunset };
  } catch {
    // Fall back to stale cache if the location still matches; else give up today.
    if (cache && cache.lat === loc.lat && cache.lng === loc.lng) {
      return { sunrise: cache.sunrise, sunset: cache.sunset };
    }
    return null;
  }
}
