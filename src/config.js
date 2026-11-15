// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];
// Radius of the counts, in metres.
export const RADIUS = { min: 100, max: 5000 };
// Places besides the houses of Gladys.
export const MAX_PLACES = 5;
export const MAX_PLACE_NAME = 40;

export const DEFAULT_CONFIG = {
  radius: 1000,
  places: '',
  language: 'fr',
};

/** An integer within its bounds, the default for a blank or a non-number. */
function integerOf(value, { min, max }, fallback) {
  const text = String(value ?? '').trim();
  const number = Number(text.replace(',', '.'));
  if (text === '' || !Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

/** "École Jean Jaurès" → "ecole-jean-jaures", the stable key of a place. */
export function slugOf(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

// Decimal points are required: "43,6 1,4" would otherwise read as 6, 1.
const ENTRY = /^(.*?)[\s:=,]*(-?\d{1,2}\.\d+)\s*[,\s]\s*(-?\d{1,3}\.\d+)$/;

/**
 * The places of the `places` field: "Name: lat, lon" entries separated by
 * semicolons or line breaks ("École: 43.6045, 1.4440; Stade: 43.583, 1.434").
 * @returns {{ places: { key: string, name: string, lat: number, lon: number }[], invalid: string[] }}
 */
export function parsePlaces(text) {
  const places = [];
  const invalid = [];
  for (const entry of String(text ?? '').split(/[;\n]/)) {
    const trimmed = entry.trim();
    if (trimmed === '') {
      continue;
    }
    const match = ENTRY.exec(trimmed);
    const lat = Number(match?.[2]);
    const lon = Number(match?.[3]);
    const name = (match?.[1] ?? '').trim().slice(0, MAX_PLACE_NAME);
    const key = slugOf(name);
    if (!match || !key || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      invalid.push(trimmed.slice(0, 60));
      continue;
    }
    if (places.length >= MAX_PLACES || places.some((place) => place.key === `place-${key}`)) {
      invalid.push(trimmed.slice(0, 60));
      continue;
    }
    places.push({ key: `place-${key}`, name, lat, lon });
  }
  return { places, invalid };
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const { places, invalid } = parsePlaces(source.places);
  return {
    radius: integerOf(source.radius, RADIUS, DEFAULT_CONFIG.radius),
    places,
    invalidPlaces: invalid,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
