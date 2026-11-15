// -----------------------------------------------------------------------------
// Géo'DAE, the national database of defibrillators (ministry of Health, open
// licence 2.0), as published on data.gouv.fr by Atlasanté: one CSV of about
// 80 MB and 190,000 rows, regenerated every day.
//
// The file is streamed and filtered on the fly: only the defibrillators within
// SEARCH_KM of a watched place are kept (a few hundred in a city centre), never
// the whole file. `fetch` is injectable: the tests never touch the network.
// -----------------------------------------------------------------------------

import { CsvParser } from './csv.js';
import { parseHours } from './hours.js';

// The stable link of the CSV resource of the dataset
// https://www.data.gouv.fr/datasets/geodae-base-nationale-des-defibrillateurs/
// (redirects to the file of the day).
export const GEODAE_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/edb6a9e1-2f16-4bbf-99e7-c3eb6b90794c';
export const USER_AGENT =
  'gladys-defibrillateurs (+https://github.com/guim31/gladys-defibrillateurs)';
// How far around a place the defibrillators are kept: the "nearest" may lie
// beyond the radius of the count, and changing the radius needs no download.
export const SEARCH_KM = 5;
// 80 MB today: room to grow, but a bound.
const MAX_BYTES = 400e6;
const TIMEOUT_MS = 10 * 60 * 1000;
// A truncated file would silently lose defibrillators: the national file has
// more than 190,000 rows (the tests serve a small extract and lower it).
export const MIN_ROWS = 10000;

// Rows left out: a device out of order, removed, a duplicate, in a vehicle.
const OUT_OF_ORDER = new Set(['Hors service', 'Supprimé définitivement', 'Absent momentanément']);

export class SourceError extends Error {}

const EARTH_KM = 6371;
const rad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in km between two `{ lat, lon }`. */
export function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const clean = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** The department of an INSEE code: '31555' → '31', '97411' → '974', '2A004' → '2A'. */
export const departmentOf = (insee) => {
  const code = clean(insee);
  return code.startsWith('97') || code.startsWith('98') ? code.slice(0, 3) : code.slice(0, 2);
};

/** "12 rue X, 31000 Toulouse". */
function addressOf(row) {
  const street = [clean(row.c_adr_num), clean(row.c_adr_voie)].filter(Boolean).join(' ');
  const city = [clean(row.c_com_cp), clean(row.c_com_nom)].filter(Boolean).join(' ');
  return [street, city].filter(Boolean).join(', ');
}

/** A CSV row as a defibrillator, or null when it is not usable. */
export function defibrillatorOf(row) {
  const lat = Number(row.c_lat_coor1);
  const lon = Number(row.c_long_coor1);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return null;
  }
  if (
    OUT_OF_ORDER.has(clean(row.c_etat_fonct)) ||
    clean(row.c_etat) === 'A supprimer' ||
    clean(row.c_etat_valid) === 'mises en doute' ||
    row.c_doublon === 't' ||
    row.c_dae_mobile === 't'
  ) {
    return null;
  }
  const id = clean(row.c_gid) || clean(row.gid);
  if (!id) {
    return null;
  }
  return {
    id,
    name: clean(row.c_nom) || clean(row.c_expt_rais),
    lat,
    lon,
    address: addressOf(row),
    department: departmentOf(row.c_com_insee || row.c_com_cp),
    indoor: clean(row.c_acc) === 'Intérieur',
    free: row.c_acc_lib === 't',
    floor: clean(row.c_acc_etg),
    spot: clean(row.c_acc_complt),
    hours: clean(row.c_dispo_horaires),
    note: clean(row.c_disp_complt),
  };
}

/** A bounding box around a place, to skip the distance of most rows. */
function boxOf(place, km) {
  const dLat = km / 111;
  const dLon = km / (111 * Math.max(0.1, Math.cos(rad(place.lat))));
  return {
    minLat: place.lat - dLat,
    maxLat: place.lat + dLat,
    minLon: place.lon - dLon,
    maxLon: place.lon + dLon,
  };
}

/**
 * Downloads the national file and keeps the defibrillators within `km` of a
 * place.
 * @param {typeof fetch} fetchImpl
 * @param {{ lat: number, lon: number }[]} places
 * @returns {Promise<{ items: object[], total: number, updatedAt: number|null }>}
 */
export async function readGeodae(
  fetchImpl,
  places,
  { km = SEARCH_KM, url = GEODAE_URL, minRows = MIN_ROWS } = {},
) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/csv' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? err?.message);
    throw new SourceError(`data.gouv.fr: ${reason}`);
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel?.().catch(() => {});
    throw new SourceError(`data.gouv.fr: HTTP ${response.status}`);
  }
  const lastModified = Date.parse(response.headers?.get?.('last-modified') ?? '');
  const boxes = places.map((place) => ({ place, box: boxOf(place, km) }));
  const parser = new CsvParser(';');
  const items = [];
  let header = null;
  let latAt = -1;
  let lonAt = -1;
  let total = 0;
  let size = 0;
  const take = (cells) => {
    if (!header) {
      header = cells.map((cell) => cell.replace(/^\uFEFF/, '').trim());
      latAt = header.indexOf('c_lat_coor1');
      lonAt = header.indexOf('c_long_coor1');
      return;
    }
    total += 1;
    const lat = Number(cells[latAt]);
    const lon = Number(cells[lonAt]);
    const near = boxes.some(
      ({ place, box }) =>
        lat >= box.minLat &&
        lat <= box.maxLat &&
        lon >= box.minLon &&
        lon <= box.maxLon &&
        distanceKm(place, { lat, lon }) <= km,
    );
    if (!near) {
      return;
    }
    const row = Object.fromEntries(header.map((key, i) => [key, cells[i] ?? '']));
    const item = defibrillatorOf(row);
    if (item) {
      items.push(item);
    }
  };
  const decoder = new TextDecoder('utf-8');
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.length;
      if (size > MAX_BYTES) {
        throw new SourceError('data.gouv.fr: file too large');
      }
      parser.push(decoder.decode(value, { stream: true })).forEach(take);
    }
    parser.push(decoder.decode()).forEach(take);
    parser.end().forEach(take);
  } catch (err) {
    await reader.cancel().catch(() => {});
    if (err instanceof SourceError) {
      throw err;
    }
    const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? err?.message);
    throw new SourceError(`data.gouv.fr: ${reason}`);
  }
  if (latAt < 0 || lonAt < 0) {
    throw new SourceError('data.gouv.fr: unexpected file format');
  }
  if (total < minRows) {
    throw new SourceError(`data.gouv.fr: only ${total} rows`);
  }
  return { items, total, updatedAt: Number.isFinite(lastModified) ? lastModified : null };
}

/** The defibrillators of a place, nearest first, with their distance in metres. */
export function nearestOf(items, place, km = SEARCH_KM) {
  return items
    .map((item) => ({ item, meters: Math.round(distanceKm(place, item) * 1000) }))
    .filter(({ meters }) => meters <= km * 1000)
    .sort((a, b) => a.meters - b.meters || a.item.id.localeCompare(b.item.id))
    .map(({ item, meters }) => ({ ...item, meters, schedule: parseHours(item.hours) }));
}
