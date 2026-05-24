/**
 * One-time repair: geocode restaurants with distance-mode delivery and missing coords.
 * Run: node --env-file=.env.local scripts/repair-geocode.mjs [--dry-run]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function geocodeWithNominatim(address) {
  const parts = [];
  if (address.cep) parts.push(address.cep.replace(/\D/g, ""));
  if (address.street && address.number) parts.push(`${address.street}, ${address.number}`);
  else if (address.street) parts.push(address.street);
  if (address.neighborhood) parts.push(address.neighborhood);
  if (address.city) parts.push(address.city);
  if (address.state) parts.push(address.state);
  if (parts.length < 2) return null;

  const query = parts.join(", ") + ", Brasil";
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br`;
  const res = await fetch(url, {
    headers: { "User-Agent": "FOOCCI-Restaurant-System/1.0 (https://foocci.com.br)" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const first = data[0];
  if (!first?.lat || !first?.lon) return null;
  return { lat: parseFloat(first.lat), lng: parseFloat(first.lon) };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`[geocode-repair] dryRun=${dryRun}`);

  const candidates = await prisma.restaurant.findMany({
    where: {
      deliveryConfig: { mode: "distance" },
      storeProfile: { latitude: null, city: { not: null } },
    },
    select: {
      id: true,
      slug: true,
      storeProfile: {
        select: { cep: true, street: true, streetNumber: true, neighborhood: true, city: true, state: true },
      },
    },
  });

  console.log(`[geocode-repair] found ${candidates.length} candidate(s)`);

  for (const r of candidates) {
    const sp = r.storeProfile;
    const hasAddress = !!(sp?.city && (sp?.cep || sp?.street));
    if (!hasAddress) {
      console.log(`[geocode-repair] ${r.slug}: skip — incomplete address`);
      continue;
    }

    if (dryRun) {
      console.log(`[geocode-repair] ${r.slug}: dry-run — would geocode "${sp.street ?? ""}, ${sp.city}, ${sp.state}"`);
      continue;
    }

    console.log(`[geocode-repair] ${r.slug}: geocoding...`);
    const coords = await geocodeWithNominatim({
      cep: sp.cep, street: sp.street, number: sp.streetNumber,
      neighborhood: sp.neighborhood, city: sp.city, state: sp.state,
    });

    if (coords) {
      await prisma.storeProfile.update({
        where: { restaurantId: r.id },
        data: { latitude: coords.lat, longitude: coords.lng },
      });
      console.log(`[geocode-repair] ${r.slug}: OK — lat=${coords.lat}, lng=${coords.lng}`);
    } else {
      console.warn(`[geocode-repair] ${r.slug}: FAILED — geocoding returned null`);
    }

    await sleep(1_200);
  }

  await prisma.$disconnect();
  console.log("[geocode-repair] done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
