// -----------------------------------------------------------------------------
// What the integration writes to `docker logs`: at info, only the lifecycle
// (the start, the file lost and back), never one line per minute nor per
// download; a failure that repeats is logged once, plus one line when it is
// over.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { READ_MS, RETRY_MS } from '../src/service.js';
import {
  EXTRACT,
  MINUTE,
  at,
  captureLogs,
  create,
  createFetch,
  createWorld,
} from './helpers/world.js';

const strip = (line) => line.text.replace(/^\[[^\]]+\] /, '');

test('the start is one info line', async (t) => {
  const lines = captureLogs(t, 'info');
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.deepEqual(lines.map(strip), [
    '[INFO] [defibrillateurs] Started: 0 place(s) configured, 0 place(s) added, radius 1000 m',
  ]);
});

test('a normal week writes nothing at info, one line per download at debug', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await create(world, 'Maison');
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 600; i += 1) {
    await at(world, world.clock.time + MINUTE);
  }
  await at(world, world.clock.time + READ_MS);
  assert.equal(world.network.calls.length, 2);
  assert.deepEqual(lines, []);
  const debug = captureLogs(t, 'debug');
  await at(world, world.clock.time + READ_MS);
  assert.deepEqual(debug.map(strip), [
    '[DEBUG] [defibrillateurs] Géo’DAE: 262 of 361 defibrillator(s) kept',
  ]);
});

test('the file down at every attempt: one warning, then one line at recovery', async (t) => {
  const network = createFetch();
  const world = await createWorld({ network });
  t.after(() => world.app.stop());
  await create(world, 'Maison');
  const lines = captureLogs(t, 'info');
  network.route = new TypeError('fetch failed');
  await at(world, world.clock.time + READ_MS);
  for (let i = 0; i < 3; i += 1) {
    await at(world, world.clock.time + RETRY_MS);
  }
  assert.equal(network.calls.length, 5);
  network.route = EXTRACT;
  await at(world, world.clock.time + RETRY_MS);
  assert.deepEqual(lines.map(strip), [
    '[WARN] [defibrillateurs] Géo’DAE file unavailable: data.gouv.fr: fetch failed',
    '[INFO] [defibrillateurs] Géo’DAE file downloaded again',
  ]);
});

test('an invalid place of the configuration is said at start', async (t) => {
  const lines = captureLogs(t, 'info');
  const world = await createWorld({ config: { places: 'Bureau 43,6 1,4' } });
  t.after(() => world.app.stop());
  assert.ok(
    lines
      .map(strip)
      .includes(
        '[WARN] [defibrillateurs] Place ignored (expected "Name: latitude, longitude"): Bureau 43,6 1,4',
      ),
  );
});
