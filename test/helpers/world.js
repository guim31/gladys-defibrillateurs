// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake `fetch` serving a real
// extract of the Géo'DAE file (captured on 2026-11-15, test/fixtures/geodae:
// the defibrillators within 1 km of the Capitole in Toulouse, within 5 km of
// Saint-Félix-Lauragais, and 80 random rows of the country; operator names,
// SIREN and photos blanked), a manual clock, and the integration wired on top
// through registerHandlers. Nothing touches the network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { GEODAE_URL } from '../../src/geodae.js';

process.env.LOG_LEVEL ??= 'silent';

export const EXTRACT = readFileSync(
  new URL('../fixtures/geodae/geodae-extract.csv', import.meta.url),
  'utf8',
);
export const LAST_MODIFIED = 'Sun, 15 Nov 2026 17:00:52 GMT';

// Monday 2026-11-16, 10:00 in Paris (09:00 UTC).
export const MONDAY_10 = Date.UTC(2026, 10, 16, 9, 0, 0);
export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;

/** An instant given as a Paris wall-clock time in winter (UTC+1): paris('2026-11-11 09:00'). */
export const paris = (text) => Date.parse(`${text.replace(' ', 'T')}:00+01:00`);

// Public places, never a home: the Capitole of Toulouse, the centre of the
// village of Saint-Félix-Lauragais, a summit of the Pyrenees.
export const CAPITOLE = { lat: 43.6045, lon: 1.444 };
export const VILLAGE = { lat: 43.4486, lon: 1.8886 };
export const MOUNTAIN = { lat: 42.7, lon: 0.35 };

export const HOUSE = {
  id: 'h1',
  name: 'Maison',
  selector: 'maison',
  latitude: CAPITOLE.lat,
  longitude: CAPITOLE.lon,
};

/** The CSV body of a response, in chunks of `size` characters (cuts rows and quotes). */
export function csvResponse(text = EXTRACT, { size = 4096, headers = {} } = {}) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + size));
      offset += size;
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/csv', 'last-modified': LAST_MODIFIED, ...headers },
  });
}

/**
 * A fake `fetch`: `network.route` is a CSV text, a status number, an Error
 * (network failure) or a function returning one of them. Calls are counted.
 */
export function createFetch(route = EXTRACT) {
  const network = { route, calls: [] };
  network.fetch = async (url, init = {}) => {
    network.calls.push({ url, headers: init.headers ?? {} });
    let answer = network.route;
    if (typeof answer === 'function') {
      answer = await answer(url, init);
    }
    if (url !== GEODAE_URL) {
      return new Response('not found', { status: 404 });
    }
    if (answer instanceof Error) {
      throw answer;
    }
    if (typeof answer === 'number') {
      return new Response('error', { status: answer });
    }
    return csvResponse(answer);
  };
  return network;
}

/** A manual clock. */
export function createClock(start = MONDAY_10) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {object} [options.network] from createFetch
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {Array} [options.houses] houses of Gladys, with their location
 * @param {string|null} [options.dataDir] cache directory, none by default
 */
export async function createWorld({
  config = {},
  network = createFetch(),
  devices = [],
  houses = [HOUSE],
  connect = true,
  clock = createClock(),
  dataDir = null,
} = {}) {
  const gladys = createFakeGladys({ config, devices, houses });
  const app = registerHandlers(gladys, {
    fetch: network.fetch,
    timers: false,
    now: clock.now,
    dataDir,
    minRows: 100,
    zone: 'Europe/Paris',
  });
  const world = { gladys, fake: gladys.fake, app, service: app.service, network, clock };
  if (connect) {
    await gladys.connect();
    await app.ready;
    await app.service.loading;
  }
  return world;
}

/** Run a configuration action; resolves with its message (multi-language). */
export async function action(world, key, fields = {}) {
  const ack = await world.fake.action(key, fields);
  if (!ack.success) {
    throw new Error(`${key} failed: ${ack.error}`);
  }
  return ack.data.message;
}

/** The device published for a name part or a predicate, from the last discovery list. */
export const discovered = (world, predicate) =>
  world.fake.discoveredDevices.find(
    typeof predicate === 'function' ? predicate : (d) => d.name.includes(predicate),
  );

/** Create a discovered device in Gladys, as the user would. */
export async function create(world, predicate) {
  const device = discovered(world, predicate);
  if (!device) {
    throw new Error(`${predicate} is not in the discovered devices`);
  }
  await world.fake.deviceCreated(device);
  return device;
}

/** External id of one feature of a device. */
export const featureId = (device, key) =>
  device.features.find((feature) => feature.external_id.endsWith(`:${key}`))?.external_id;

/** The last state published on a feature: its text or its value. */
export const lastState = (world, device, key) => {
  const id = featureId(device, key);
  const found = world.fake.states.filter((s) => s.device_feature_external_id === id).at(-1);
  return found ? (found.text ?? found.state) : undefined;
};

/** Sets the clock and evaluates once. */
export async function at(world, ms) {
  world.clock.time = ms;
  await world.service.tick();
  await world.service.refreshing;
}

/** Captures what the integration logs, at a level. */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
