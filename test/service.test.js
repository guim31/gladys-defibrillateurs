// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and a real extract
// of the Géo'DAE file (2026-11-15).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildPlaceDevice } from '../src/devices.js';
import { CACHE_FILE, READ_MS, RETRY_MS } from '../src/service.js';
import {
  EXTRACT,
  MINUTE,
  MOUNTAIN,
  VILLAGE,
  action,
  at,
  create,
  createFetch,
  createWorld,
  featureId,
  lastState,
  paris,
} from './helpers/world.js';

const PLACES = `Village: ${VILLAGE.lat}, ${VILLAGE.lon}; Pic : ${MOUNTAIN.lat},${MOUNTAIN.lon}`;

test('the located houses and the places of the configuration are offered, with stable ids', async (t) => {
  const world = await createWorld({ config: { places: PLACES } });
  t.after(() => world.app.stop());
  assert.deepEqual(
    world.fake.discoveredDevices.map((d) => [d.name, d.external_id]),
    [
      ['Défibrillateurs – Maison', 'ext:test-integration:place:house-maison'],
      ['Défibrillateurs – Village', 'ext:test-integration:place:place-village'],
      ['Défibrillateurs – Pic', 'ext:test-integration:place:place-pic'],
    ],
  );
  const village = world.fake.discoveredDevices[1];
  assert.equal(village.should_poll, false);
  assert.deepEqual(
    village.params.map((p) => [p.name, p.value]),
    [
      ['place', 'place-village'],
      ['place_name', 'Village'],
      ['latitude', '43.4486'],
      ['longitude', '1.8886'],
    ],
  );
  // One download for every place.
  assert.equal(world.network.calls.length, 1);
});

test('a house without location, and no place: nothing offered, nothing downloaded', async (t) => {
  const world = await createWorld({ houses: [{ id: 'h', name: 'Maison', selector: 'maison' }] });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.discoveredDevices, []);
  assert.equal(world.network.calls.length, 0);
  const message = await action(world, 'status');
  assert.match(message.fr, /Aucun lieu/);
});

test('Toulouse centre: the nearest defibrillator, the counts within 1 km, the data date', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const house = await create(world, 'Maison');
  assert.equal(lastState(world, house, 'distance'), 18);
  assert.equal(
    lastState(world, house, 'nearest'),
    'DAE_Cerema_OCC_Toulouse_Bâtiment_Principal, 1 Avenue du Colonel Roche, 31100 Toulouse',
  );
  assert.equal(lastState(world, house, 'location'), 'intérieur, rez-de-chaussée');
  assert.equal(lastState(world, house, 'access'), 'Accès libre');
  assert.equal(lastState(world, house, 'hours'), 'Horaires non déclarés');
  assert.equal(lastState(world, house, 'available'), 0);
  assert.equal(lastState(world, house, 'count'), 261);
  assert.equal(lastState(world, house, 'available_count'), 90);
  assert.equal(lastState(world, house, 'data_date'), '15 novembre 2026');
  // The widget is asked to show the new place.
  assert.ok(world.fake.widgetRefreshes.includes('nearest'));
});

test('a village: a 24/7 defibrillator under a porch, available at night', async (t) => {
  const world = await createWorld({ config: { places: PLACES } });
  t.after(() => world.app.stop());
  const village = await create(world, 'Village');
  await at(world, paris('2026-11-15 03:00'));
  assert.equal(lastState(world, village, 'distance'), 66);
  assert.equal(lastState(world, village, 'hours'), '24 h/24, 7 j/7');
  assert.equal(lastState(world, village, 'available'), 1);
  assert.equal(lastState(world, village, 'count'), 3);
  assert.equal(lastState(world, village, 'available_count'), 2);
});

test('no defibrillator within 5 km: a text says so, the distance at its 5 km bound', async (t) => {
  const world = await createWorld({ config: { places: PLACES } });
  t.after(() => world.app.stop());
  const peak = await create(world, 'Pic');
  assert.equal(lastState(world, peak, 'nearest'), 'Aucun DAE à moins de 5 km');
  assert.equal(lastState(world, peak, 'distance'), 5000);
  assert.equal(lastState(world, peak, 'count'), 0);
  assert.equal(lastState(world, peak, 'available_count'), 0);
  const result = await world.fake.sceneAction('nearest', { place: peak.external_id });
  assert.equal(result.data.outputs.distance, -1);
  assert.equal(result.data.outputs.sentence, 'Aucun DAE à moins de 5 km de Pic.');
});

test('the radius sets the counts without a new download', async (t) => {
  const world = await createWorld({ config: { radius: 300 } });
  t.after(() => world.app.stop());
  const house = await create(world, 'Maison');
  const small = lastState(world, house, 'count');
  assert.ok(small > 0 && small < 261, String(small));
  await world.fake.configUpdated({ radius: 1000 });
  assert.equal(lastState(world, house, 'count'), 261);
  assert.equal(world.network.calls.length, 1);
});

test('the minute clock: availability follows the hours, without any request nor onPoll', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const house = await create(world, 'Maison');
  const weekday = lastState(world, house, 'available_count');
  await at(world, paris('2026-11-15 03:00')); // Sunday night
  const night = lastState(world, house, 'available_count');
  assert.ok(night < weekday, `${night} < ${weekday}`);
  assert.ok(night > 0, 'the 24/7 ones');
  await at(world, paris('2026-11-16 10:00'));
  assert.equal(lastState(world, house, 'available_count'), weekday);
  assert.equal(world.network.calls.length, 1);
});

test('the file is downloaded again after a week, not before', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await create(world, 'Maison');
  await at(world, world.clock.time + READ_MS - MINUTE);
  assert.equal(world.network.calls.length, 1);
  await at(world, world.clock.time + 2 * MINUTE);
  assert.equal(world.network.calls.length, 2);
});

test('a failed download: the last data are kept, a new attempt 3 hours later', async (t) => {
  const network = createFetch();
  const world = await createWorld({ network });
  t.after(() => world.app.stop());
  const house = await create(world, 'Maison');
  network.route = new TypeError('fetch failed');
  await at(world, world.clock.time + READ_MS);
  assert.equal(network.calls.length, 2);
  assert.equal(lastState(world, house, 'count'), 261);
  await at(world, world.clock.time + RETRY_MS - MINUTE);
  assert.equal(network.calls.length, 2);
  network.route = 503;
  await at(world, world.clock.time + 2 * MINUTE);
  assert.equal(network.calls.length, 3);
  const message = await action(world, 'status');
  assert.match(message.en, /Last download failed: data\.gouv\.fr: HTTP 503/);
  // The connection status is kept: the data are still there.
  assert.deepEqual(world.fake.connectionStatuses, []);
});

test('no data at all: disconnected with a message in four languages, then reconnected', async (t) => {
  const network = createFetch(new TypeError('fetch failed'));
  const world = await createWorld({ network });
  t.after(() => world.app.stop());
  const lost = world.fake.connectionStatuses.at(-1);
  assert.equal(lost.connected, false);
  assert.deepEqual(Object.keys(lost.message).sort(), ['de', 'en', 'es', 'fr']);
  await create(world, 'Maison');
  assert.equal(network.calls.length, 1);
  const content = await world.fake.widgetGet('nearest', { language: 'fr' });
  assert.match(content.data.content.components[1].text, /Pas encore de données/);
  network.route = EXTRACT;
  await at(world, world.clock.time + RETRY_MS);
  assert.equal(network.calls.length, 2);
  assert.equal(world.fake.connectionStatuses.at(-1).connected, true);
});

test('a truncated or foreign file is refused', async (t) => {
  const world = await createWorld({ network: createFetch('<html>maintenance</html>') });
  t.after(() => world.app.stop());
  assert.equal(world.service.data, null);
  assert.match(world.service.error, /unexpected file format|only/);
});

test('the kept defibrillators are saved under /data: a restart downloads nothing', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'gladys-defib-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const first = await createWorld({ dataDir });
  await first.app.stop();
  const saved = JSON.parse(await readFile(join(dataDir, CACHE_FILE), 'utf8'));
  assert.equal(saved.items.length, first.service.data.items.length);
  const second = await createWorld({ dataDir });
  t.after(() => second.app.stop());
  assert.equal(second.network.calls.length, 0);
  assert.equal(second.service.data.items.length, saved.items.length);
  // A new place outside the saved area: downloaded at once.
  await second.fake.configUpdated({ places: `Village: ${VILLAGE.lat}, ${VILLAGE.lon}` });
  assert.equal(second.network.calls.length, 1);
});

test('a house moved: its device follows, the new area is downloaded', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const house = await create(world, 'Maison');
  world.fake.houses[0].latitude = VILLAGE.lat;
  world.fake.houses[0].longitude = VILLAGE.lon;
  await world.service.refresh();
  assert.equal(world.network.calls.length, 2);
  assert.equal(lastState(world, house, 'distance'), 66);
});

test('a device of a place removed from the configuration keeps its location', async (t) => {
  const world = await createWorld({ config: { places: PLACES } });
  t.after(() => world.app.stop());
  const village = await create(world, 'Village');
  await world.fake.configUpdated({ places: '' });
  assert.equal(world.fake.discoveredDevices.length, 1);
  await at(world, paris('2026-11-15 03:00'));
  assert.equal(lastState(world, village, 'available'), 1);
});

test('invalid places are skipped, five at most', async (t) => {
  const places =
    'nowhere; A: 1.0, 2.0; B: 3.0, 4.0; C: 5.0, 6.0; D: 7.0, 8.0; E: 9.0, 10.0; F: 11.0, 12.0; G: 91.0, 0.0; H 43,6 1,4';
  const world = await createWorld({ config: { places }, houses: [] });
  t.after(() => world.app.stop());
  assert.deepEqual(
    world.fake.discoveredDevices.map((d) => d.name),
    ['A', 'B', 'C', 'D', 'E'].map((name) => `Défibrillateurs – ${name}`),
  );
});

test('the widget: the 3 nearest, badges, a map link, the emergency numbers', async (t) => {
  const world = await createWorld({ config: { places: PLACES } });
  t.after(() => world.app.stop());
  const village = await create(world, 'Village');
  await at(world, paris('2026-11-15 03:00'));
  const answer = await world.fake.widgetGet('nearest', {
    settings: { place: village.external_id },
    language: 'fr',
  });
  const { content } = answer.data;
  assert.deepEqual(validateWidgetContent(content), []);
  const [heading, list, caption] = content.components;
  assert.equal(heading.text, 'Défibrillateurs – Village');
  assert.equal(list.type, 'card-list');
  assert.equal(list.items.length, 3);
  assert.deepEqual(list.items[0].badge, { text: 'Disponible', color: 'success' });
  assert.equal(list.items[0].subtitle, '66 m · Accès libre');
  assert.match(list.items[0].description, /24 h\/24, 7 j\/7/);
  assert.match(list.items[0].links[0].url, /^https:\/\/www\.openstreetmap\.org\//);
  assert.equal(caption.text, 'Urgence : appelez le 15 ou le 112');
  // One, without hours nor emergency numbers.
  const short = await world.fake.widgetGet('nearest', {
    settings: { place: village.external_id, count: '1', show_hours: false, show_emergency: false },
    language: 'en',
  });
  assert.equal(short.data.content.components.length, 2);
  assert.equal(short.data.content.components[1].items.length, 1);
  assert.doesNotMatch(short.data.content.components[1].items[0].description, /24\/7/);
});

test('the widget without a place, and on a place with no defibrillator', async (t) => {
  const world = await createWorld({ config: { places: PLACES } });
  t.after(() => world.app.stop());
  const empty = await world.fake.widgetGet('nearest', { language: 'de' });
  assert.match(empty.data.content.components[0].text, /Entdecken/);
  const peak = await create(world, 'Pic');
  const answer = await world.fake.widgetGet('nearest', {
    settings: { place: peak.external_id },
    language: 'es',
  });
  const texts = answer.data.content.components.filter((c) => c.type === 'text');
  assert.ok(texts.length <= 2);
  assert.match(texts[1].text, /Ningún desfibrilador a menos de 5 km\nEmergencia/);
});

test('the scene action: a sentence and numbers', async (t) => {
  const world = await createWorld({ config: { places: PLACES } });
  t.after(() => world.app.stop());
  const village = await create(world, 'Village');
  await at(world, paris('2026-11-15 03:00'));
  const result = await world.fake.sceneAction('nearest', { place: village.external_id });
  assert.equal(result.success, true);
  assert.deepEqual(result.data.outputs, {
    sentence:
      'DAE le plus proche de Village : Place Guillaume de Nogaret, à 66 m, 6 Place Guillaume de Nogaret, 31540 Saint-Félix-Lauragais (Sous le porche des WC Publics). Accès libre, disponible maintenant.',
    distance: 66,
    available_now: 1,
    available_count: 2,
  });
  const none = await createWorld({ houses: [] });
  t.after(() => none.app.stop());
  const failed = await none.fake.sceneAction('nearest', {});
  assert.equal(failed.success, false);
});

test('the features of a device and the widget states are the published ones', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = buildPlaceDevice(
    world.gladys,
    { key: 'house-maison', name: 'Maison', ...{ lat: 1, lon: 2 } },
    'en',
  );
  for (const key of ['distance', 'nearest', 'available', 'count']) {
    assert.ok(featureId(device, key), key);
  }
  assert.equal(device.features.find((f) => f.external_id.endsWith(':distance')).unit, 'm');
});

test('no data yet: a scan or a saved configuration downloads at once, not 3 hours later', async (t) => {
  const network = createFetch(new TypeError('fetch failed'));
  const world = await createWorld({ network });
  t.after(() => world.app.stop());
  network.route = EXTRACT;
  await world.fake.scanRequest();
  await world.service.refreshing;
  assert.equal(network.calls.length, 2);
  assert.ok(world.service.data);
});

test('a house moved where no defibrillator is within 5 km: no feature keeps the old values', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const house = await create(world, 'Maison');
  world.fake.houses[0].latitude = MOUNTAIN.lat;
  world.fake.houses[0].longitude = MOUNTAIN.lon;
  // Read again within the hour, by the minute clock alone.
  await at(world, world.clock.time + 61 * MINUTE);
  assert.equal(world.network.calls.length, 2);
  assert.equal(lastState(world, house, 'distance'), 5000);
  assert.equal(lastState(world, house, 'available'), 0);
  for (const key of ['nearest', 'location', 'access', 'hours']) {
    assert.equal(lastState(world, house, key), 'Aucun DAE à moins de 5 km', key);
  }
});
