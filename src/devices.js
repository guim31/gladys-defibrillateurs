// -----------------------------------------------------------------------------
// The Gladys device of a watched place (a house of Gladys, or a place of the
// configuration) and its states:
//
//   distance          distance-sensor/decimal (m)  nearest defibrillator, within 5 km
//   nearest           text/text      its name and address
//   location          text/text      indoor or outdoor, floor, exact spot
//   access            text/text      free or restricted access
//   hours             text/text      declared availability hours
//   available         input/binary   1 = available now according to its hours
//   count             counter-sensor/integer   defibrillators within the radius
//   available_count   counter-sensor/integer   of which available now
//   data_date         text/text      date of the Géo'DAE file
//
// Read-only, no polling: the integration evaluates availability every minute
// on its own timer (src/service.js), Gladys never polls (`should_poll: false`).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
} from '@gladysassistant/integration-sdk';
import { SEARCH_KM } from './geodae.js';
import { DAY_MINUTES, weekSlots } from './hours.js';
import { hhmm } from './clock.js';
import { NAMES, SHORT_WEEKDAYS, TEXT, say } from './messages.js';

export const PLACE_TYPE = 'place';
export const FEATURE_KEYS = [
  'distance',
  'nearest',
  'location',
  'access',
  'hours',
  'available',
  'count',
  'available_count',
  'data_date',
];
const TEXT_KEYS = new Set(['nearest', 'location', 'access', 'hours', 'data_date']);
export const MAX_DEVICE_NAME = 100;
export const MAX_TEXT = 500;
// The counts never exceed what a city centre holds within 5 km.
const MAX_COUNT = 10000;

/** Shortens a text to `max` characters, with an ellipsis. */
export function clip(text, max) {
  const value = String(text ?? '');
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** The external ids of a place, from its key (`house-maison`, `place-ecole`). */
export const idsOf = (gladys, key) => gladys.externalIds(PLACE_TYPE, key);

/** The device of a place. */
export function buildPlaceDevice(gladys, place, language) {
  const ids = idsOf(gladys, place.key);
  const names = NAMES[language] ?? NAMES.en;
  const shapes = {
    distance: {
      category: C.DISTANCE_SENSOR,
      type: T.SENSOR.DECIMAL,
      unit: 'm',
      min: 0,
      max: SEARCH_KM * 1000,
    },
    available: { category: C.INPUT, type: T.SENSOR.BINARY, min: 0, max: 1 },
    count: { category: C.COUNTER_SENSOR, type: T.SENSOR.INTEGER, min: 0, max: MAX_COUNT },
    available_count: { category: C.COUNTER_SENSOR, type: T.SENSOR.INTEGER, min: 0, max: MAX_COUNT },
  };
  return {
    name: clip(say(TEXT, language, 'deviceName', { place: place.name }), MAX_DEVICE_NAME),
    external_id: ids.device,
    should_poll: false,
    params: [
      { name: 'place', value: place.key },
      { name: 'place_name', value: clip(place.name, 100) },
      { name: 'latitude', value: String(place.lat) },
      { name: 'longitude', value: String(place.lon) },
    ],
    features: FEATURE_KEYS.map((key) => ({
      name: names[key],
      external_id: ids.feature(key),
      ...(TEXT_KEYS.has(key)
        ? { category: C.TEXT, type: T.TEXT.TEXT, min: 0, max: 0 }
        : shapes[key]),
      read_only: true,
      has_feedback: false,
    })),
  };
}

/** "intérieur, étage 1 – hall d'accueil". */
export function whereText(item, language) {
  const parts = [say(TEXT, language, item.indoor ? 'indoor' : 'outdoor')];
  const floor = item.floor;
  if (/^(0|rdc|rez[- ]de[- ]chauss[ée]e)$/i.test(floor)) {
    parts.push(say(TEXT, language, 'groundFloor'));
  } else if (/^-?\d{1,3}$/.test(floor)) {
    parts.push(say(TEXT, language, 'floor', { floor }));
  } else if (floor) {
    parts.push(floor);
  }
  const head = parts.join(', ');
  return item.spot ? `${head} – ${item.spot}` : head;
}

const slotsText = (slots, language) =>
  slots.length === 0
    ? say(TEXT, language, 'closed')
    : slots
        .map(({ from, to }) => `${hhmm(from)}–${hhmm(to > DAY_MINUTES ? to - DAY_MINUTES : to)}`)
        .join(', ');

/**
 * The declared hours in a language, grouped by consecutive days with the same
 * slots: "lun.–ven. 09:00–12:00, 14:00–18:00 ; sam.–dim. fermé ; jours fériés : fermé".
 */
export function hoursText(schedule, language) {
  if (!schedule?.declared) {
    return say(TEXT, language, 'notDeclared');
  }
  if (schedule.always) {
    return say(TEXT, language, 'always');
  }
  const days = SHORT_WEEKDAYS[language] ?? SHORT_WEEKDAYS.en;
  const groups = [];
  for (let day = 0; day < 7; day += 1) {
    const text = slotsText(weekSlots(schedule, day), language);
    const last = groups.at(-1);
    if (last && last.text === text) {
      last.to = day;
    } else {
      groups.push({ from: day, to: day, text });
    }
  }
  const parts =
    groups.length === 1
      ? [`${say(TEXT, language, 'everyDay')} ${groups[0].text}`]
      : groups.map(({ from, to, text }) =>
          from === to ? `${days[from]} ${text}` : `${days[from]}–${days[to]} ${text}`,
        );
  const holiday = schedule.rules.findLast((rule) => rule.ph && !rule.dates);
  const colon = language === 'fr' ? ' : ' : ': ';
  if (holiday) {
    parts.push(`${say(TEXT, language, 'holidays')}${colon}${slotsText(holiday.slots, language)}`);
  }
  if (schedule.rules.some((rule) => rule.dates)) {
    parts.push(say(TEXT, language, 'exceptions'));
  }
  return parts.join(language === 'fr' ? ' ; ' : '; ');
}

/** "15/11/2026", the date of the data in a language. */
export function dateText(ms, language) {
  const locales = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };
  return new Date(ms).toLocaleDateString(locales[language] ?? 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * The states of a place from its view (src/service.js): texts never empty, the
 * nearest-defibrillator features left without state when none is within 5 km.
 */
export function placeStates(gladys, key, view, language) {
  const ids = idsOf(gladys, key);
  const states = [];
  const text = (feature, value) =>
    states.push({ device_feature_external_id: ids.feature(feature), text: clip(value, MAX_TEXT) });
  const value = (feature, state) =>
    states.push({ device_feature_external_id: ids.feature(feature), state });
  const nearest = view.list[0];
  if (nearest) {
    value('distance', nearest.meters);
    text('nearest', [nearest.name, nearest.address].filter(Boolean).join(', ') || nearest.id);
    text('location', whereText(nearest, language));
    text('access', say(TEXT, language, nearest.free ? 'free' : 'restricted'));
    text('hours', hoursText(nearest.schedule, language));
    value('available', nearest.available === true ? 1 : 0);
  } else {
    // None within 5 km: every feature says so, none keeps the values of a
    // former location (a house moved).
    const none = say(TEXT, language, 'none', { km: SEARCH_KM });
    value('distance', SEARCH_KM * 1000);
    text('nearest', none);
    text('location', none);
    text('access', none);
    text('hours', none);
    value('available', 0);
  }
  value('count', view.count);
  value('available_count', view.availableCount);
  if (view.updatedAt) {
    text('data_date', dateText(view.updatedAt, language));
  }
  return states;
}
