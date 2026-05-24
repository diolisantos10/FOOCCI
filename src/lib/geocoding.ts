/**
 * Geocoding utilities for delivery distance calculation.
 *
 * Primary: Nominatim (OpenStreetMap) — free, no API key, good Brazilian coverage.
 * Optional: Google Maps Geocoding API — set GOOGLE_MAPS_API_KEY env var for higher accuracy.
 *
 * Nominatim policy: requires a descriptive User-Agent; max 1 req/s.
 * At typical restaurant order rates this is well within limits.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeocodableAddress {
  street?:       string;
  number?:       string;
  neighborhood?: string;
  city?:         string;
  state?:        string;
  cep?:          string;
}

/**
 * Geocode a Brazilian address to lat/lng coordinates.
 * Returns null when geocoding fails or address is insufficient.
 */
export async function geocodeAddress(address: GeocodableAddress): Promise<LatLng | null> {
  try {
    const googleKey = process.env.GOOGLE_MAPS_API_KEY;
    if (googleKey) {
      const result = await geocodeWithGoogleMaps(address, googleKey);
      if (result) return result;
    }
    return await geocodeWithNominatim(address);
  } catch {
    return null;
  }
}

async function geocodeWithGoogleMaps(address: GeocodableAddress, apiKey: string): Promise<LatLng | null> {
  try {
    const parts: string[] = [];
    if (address.street && address.number) {
      parts.push(`${address.street}, ${address.number}`);
    } else if (address.street) {
      parts.push(address.street);
    }
    if (address.neighborhood) parts.push(address.neighborhood);
    if (address.city)         parts.push(address.city);
    if (address.state)        parts.push(address.state);
    if (address.cep)          parts.push(address.cep.replace(/\D/g, ""));
    if (parts.length < 2) return null;

    const query = parts.join(", ") + ", Brasil";
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}&region=br&language=pt-BR`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const data = await res.json() as { status: string; results: { geometry: { location: { lat: number; lng: number } } }[] };
    if (data.status !== "OK" || !data.results.length) return null;
    const first = data.results[0];
    if (!first) return null;
    const { lat, lng } = first.geometry.location;
    return { lat, lng };
  } catch {
    return null;
  }
}

async function geocodeWithNominatim(address: GeocodableAddress): Promise<LatLng | null> {
  const headers = { "User-Agent": "FOOCCI-Restaurant-System/1.0 (https://foocci.com.br)" };
  const signal  = AbortSignal.timeout(6_000);

  const parseResult = (data: unknown): LatLng | null => {
    const arr = data as { lat?: string; lon?: string }[];
    const first = arr[0];
    if (!first?.lat || !first?.lon) return null;
    return { lat: parseFloat(first.lat), lng: parseFloat(first.lon) };
  };

  try {
    // Strategy 1: structured search (most reliable — avoids CEP-in-free-text confusion)
    if (address.city || address.cep) {
      const params = new URLSearchParams({ format: "json", limit: "1", countrycodes: "br" });
      if (address.street && address.number) params.set("street", `${address.number} ${address.street}`);
      else if (address.street)              params.set("street", address.street);
      if (address.city)  params.set("city", address.city);
      if (address.state) params.set("state", address.state);
      if (address.cep)   params.set("postalcode", address.cep.replace(/\D/g, ""));
      params.set("country", "Brazil");

      const res1 = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers, signal });
      if (res1.ok) {
        const r = parseResult(await res1.json());
        if (r) return r;
      }
    }

    // Strategy 2: CEP-only free-text fallback (works even without street/city in DB)
    if (address.cep) {
      const cepClean = address.cep.replace(/\D/g, "");
      const res2 = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cepClean)}&format=json&limit=1&countrycodes=br`,
        { headers, signal },
      );
      if (res2.ok) {
        const r = parseResult(await res2.json());
        if (r) return r;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Haversine straight-line distance between two GPS coordinates.
 * Returns distance in kilometres.
 * Note: straight-line distance is typically 15-25% shorter than road distance.
 */
export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const R    = 6_371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const x    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
