// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+).
//
// - nearest: the nearest defibrillators of a watched place (3 by default), as
//   a card list: name, distance and access, a badge "Available" (green),
//   "Closed" (red) or "Hours?" (grey) from the declared hours; a tap opens the
//   address, exact spot, hours and a map link. A caption recalls the
//   emergency numbers, and can be hidden.
//
// Budget of the core: 8 components, 2 texts, 1 card list (8 rows): one
// heading, one card list, one caption.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { clip, hoursText, whereText } from './devices.js';
import { SEARCH_KM } from './geodae.js';
import { TEXT, say } from './messages.js';
import { WIDGET_KEY } from './service.js';

// The minute clock: availability is never more than a minute behind.
const TTL_SECONDS = 60;
export const COUNT_CHOICES = [1, 3, 5];

/** The `count` setting as a number, 3 when absent or unknown. */
export function countOf(settings) {
  const count = Number(settings?.count);
  return COUNT_CHOICES.includes(count) ? count : 3;
}

/** The badge of a defibrillator, from its availability now. */
export function badgeOf(item, language) {
  if (item.available === null) {
    return { text: say(TEXT, language, 'unknownNow'), color: WIDGET_COLORS.NEUTRAL };
  }
  return item.available
    ? { text: say(TEXT, language, 'availableNow'), color: WIDGET_COLORS.SUCCESS }
    : { text: say(TEXT, language, 'closedNow'), color: WIDGET_COLORS.DANGER };
}

const mapUrl = (item) =>
  `https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lon}#map=19/${item.lat}/${item.lon}`;

function itemOf(item, language, showHours) {
  const distance = say(TEXT, language, 'meters', { meters: item.meters });
  const access = say(TEXT, language, item.free ? 'free' : 'restricted');
  const lines = [item.address, whereText(item, language)];
  if (showHours) {
    lines.push(hoursText(item.schedule, language));
  }
  if (item.note) {
    lines.push(item.note);
  }
  return {
    title: clip(item.name || item.id, 60),
    subtitle: clip(`${distance} · ${access}`, 80),
    badge: badgeOf(item, language),
    description: clip(lines.filter(Boolean).join('\n'), 2000),
    links: [{ url: mapUrl(item), label: say(TEXT, language, 'map') }],
  };
}

async function nearestContent(service, { settings, language }) {
  await service.firstReading();
  const watched = service.watched();
  const asked = [settings?.place].flat().filter(Boolean).map(String)[0];
  const entry = asked ? watched.find((w) => w.deviceId === asked) : watched[0];
  const components = [];
  const caption = () => {
    if (settings?.show_emergency !== false) {
      components.push({ type: 'text', variant: 'caption', text: say(TEXT, language, 'emergency') });
    }
  };
  if (!entry) {
    components.push({ type: 'text', text: say(TEXT, language, asked ? 'gone' : 'pickPlace') });
    caption();
    return { ttl_seconds: TTL_SECONDS, components };
  }
  // The name given in Gladys, not the one of the place.
  components.push({ type: 'text', variant: 'heading', text: clip(entry.name, 40) });
  if (!service.data || !service.covers([entry])) {
    const key = service.refreshing ? 'loading' : 'noData';
    components.push({ type: 'text', text: say(TEXT, language, key) });
    return { ttl_seconds: TTL_SECONDS, components };
  }
  const { list } = service.view(entry);
  if (list.length === 0) {
    // Two texts at most: the emergency numbers join the body.
    const lines = [say(TEXT, language, 'none', { km: SEARCH_KM })];
    if (settings?.show_emergency !== false) {
      lines.push(say(TEXT, language, 'emergency'));
    }
    components.push({ type: 'text', text: lines.join('\n') });
    return { ttl_seconds: TTL_SECONDS, components };
  }
  const showHours = settings?.show_hours !== false;
  components.push({
    type: 'card-list',
    display: 'list',
    items: list.slice(0, countOf(settings)).map((item) => itemOf(item, language, showHours)),
  });
  caption();
  return { ttl_seconds: TTL_SECONDS, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get: nearestContent },
};
