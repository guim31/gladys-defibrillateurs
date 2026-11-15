// -----------------------------------------------------------------------------
// The integration at runtime: the watched places, the Géo'DAE file, the
// devices offered in the Discover tab and the states of the ones added.
//
// Two paces:
// - the national file is downloaded at most once a week (it is 80 MB), and
//   again only when a new place is not covered by the last download; a failed
//   download is tried again 3 hours later. What is kept around the places
//   (a few hundred defibrillators) is saved under /data, so a restart does not
//   download it again;
// - every minute, "available now" is evaluated from the declared hours,
//   without any request: states, widget.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';
import { localTime } from './clock.js';
import { DEFAULT_CONFIG, normalizeConfig, slugOf } from './config.js';
import { PLACE_TYPE, buildPlaceDevice, dateText, placeStates } from './devices.js';
import { MIN_ROWS, SEARCH_KM, distanceKm, nearestOf, readGeodae, zoneOf } from './geodae.js';
import { availableAt } from './hours.js';
import { DATA_UNAVAILABLE, TEXT, say } from './messages.js';

const logger = createLogger({ name: 'defibrillateurs' });

// Unchanged states are sent again this often, or the dashboard shows "no
// recent value" after 48 hours.
export const HEARTBEAT_MS = 6 * 3600 * 1000;
export const TICK_MS = 60 * 1000;
export const READ_MS = 7 * 24 * 3600 * 1000;
export const RETRY_MS = 3 * 3600 * 1000;
export const HOUSES_MS = 3600 * 1000;
export const WIDGET_KEY = 'nearest';
export const CACHE_FILE = 'geodae-cache.json';
const CACHE_VERSION = 1;
// A place this close to a place of the last download is covered by it.
const COVER_KM = 0.2;

const finite = (value) => {
  const number = Number(value);
  return value !== null && value !== '' && Number.isFinite(number) ? number : null;
};

export class Defibrillators {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake)
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {boolean} [options.timers] false in the tests: they call refresh() and tick()
   * @param {string|null} [options.dataDir] where the kept defibrillators are saved, null: nowhere
   * @param {number} [options.minRows] rows a complete file holds at least
   */
  constructor({
    gladys,
    fetch = globalThis.fetch,
    now = Date.now,
    timers = true,
    dataDir = '/data',
    minRows = MIN_ROWS,
  }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.now = now;
    this.useTimers = timers;
    this.dataDir = dataDir;
    this.minRows = minRows;
    this.config = normalizeConfig(DEFAULT_CONFIG);
    this.houses = []; // places of the located houses
    this.houseError = false;
    this.housesReadAt = 0;
    this.data = null; // { items, updatedAt, fetchedAt, coverage }
    this.lists = new Map(); // place key → { signature, list }
    this.error = null;
    this.retryAt = 0;
    this.discoveredSignature = null;
    this.publishFailed = false;
    this.discoveryFailed = false;
    this.disconnected = false;
    this.tickTimer = null;
    this.stopped = false;
    this.refreshing = null;
    this.loading = Promise.resolve();
  }

  // --- lifecycle --------------------------------------------------------------

  async start(config) {
    this.config = config;
    await this.loadCache();
    logger.info(
      `Started: ${config.places.length} place(s) configured, ${this.watched().length} place(s) added, radius ${config.radius} m`,
    );
    for (const entry of config.invalidPlaces) {
      logger.warn(`Place ignored (expected "Name: latitude, longitude"): ${entry}`);
    }
    this.scheduleTicks();
    // The first reading in the background: the widget and the scene action
    // wait for it.
    this.loading = this.refresh({ discover: true });
  }

  /** Gladys restarted: everything again, the states included. */
  async resync(config) {
    this.config = config;
    this.gladys.forgetPublishedStates?.();
    await this.refresh({ discover: true });
  }

  async reconfigure(config) {
    const languageChanged = config.language !== this.config.language;
    this.config = config;
    for (const entry of config.invalidPlaces) {
      logger.warn(`Place ignored (expected "Name: latitude, longitude"): ${entry}`);
    }
    if (languageChanged) {
      // The texts follow the language.
      this.gladys.forgetPublishedStates?.();
    }
    await this.refresh({ discover: true });
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.tickTimer);
    await this.refreshing;
  }

  /** The clock: one evaluation a few seconds after every minute. */
  scheduleTicks() {
    if (!this.useTimers || this.stopped) {
      return;
    }
    const delay = TICK_MS - (this.now() % TICK_MS) + 2000;
    this.tickTimer = setTimeout(async () => {
      try {
        await this.tick();
      } catch (err) {
        // Never let one bad evaluation stop the clock.
        logger.warn(`Evaluation failed: ${err.message}`);
      } finally {
        this.scheduleTicks();
      }
    }, delay);
    this.tickTimer.unref?.();
  }

  // --- places -----------------------------------------------------------------

  /** The located houses of Gladys, as places. */
  async readHouses() {
    this.housesReadAt = this.now();
    try {
      const houses = await this.gladys.getHouses();
      this.houses = (houses ?? [])
        .filter((h) => Number.isFinite(h?.latitude) && Number.isFinite(h?.longitude))
        .map((h) => ({
          key: `house-${slugOf(h.selector || h.name || h.id) || 'house'}`,
          name: h.name || say(TEXT, this.config.language, 'house'),
          lat: h.latitude,
          lon: h.longitude,
        }));
      if (this.houseError) {
        logger.info('Location of the houses read again');
      }
      this.houseError = false;
    } catch (err) {
      // Kept: the houses of the last good read.
      if (!this.houseError) {
        logger.warn(`Cannot read the location of the houses: ${err.message}`);
      }
      this.houseError = true;
    }
  }

  /** The places offered: the located houses, then the places of the configuration. */
  offeredPlaces() {
    const places = new Map();
    for (const place of [...this.houses, ...this.config.places]) {
      if (!places.has(place.key)) {
        places.set(place.key, place);
      }
    }
    return [...places.values()];
  }

  /** The places added to Gladys: `{ deviceId, key, name, placeName, lat, lon }[]`, in the order of Gladys. */
  watched() {
    const offered = new Map(this.offeredPlaces().map((place) => [place.key, place]));
    const marker = `:${PLACE_TYPE}:`;
    const entries = [];
    for (const device of this.gladys.devices ?? []) {
      const param = (name) => device?.params?.find?.((p) => p.name === name)?.value;
      const id = String(device?.external_id ?? '');
      const key =
        param('place') ??
        (id.includes(marker) ? id.slice(id.lastIndexOf(marker) + marker.length) : null);
      if (!key) {
        continue;
      }
      // The current location of the place (a house moved), else the one of its device.
      const current = offered.get(key);
      const lat = current?.lat ?? finite(param('latitude'));
      const lon = current?.lon ?? finite(param('longitude'));
      if (lat === null || lon === null) {
        continue;
      }
      entries.push({
        deviceId: device.external_id,
        key,
        name: device.name,
        placeName: current?.name ?? param('place_name') ?? device.name,
        lat,
        lon,
      });
    }
    return entries;
  }

  /** Every location the download must cover. */
  neededPlaces() {
    const all = [...this.offeredPlaces(), ...this.watched()];
    const unique = [];
    for (const place of all) {
      if (!unique.some((p) => p.lat === place.lat && p.lon === place.lon)) {
        unique.push({ lat: place.lat, lon: place.lon });
      }
    }
    return unique;
  }

  covers(places) {
    const coverage = this.data?.coverage ?? [];
    return places.every((place) => coverage.some((c) => distanceKm(c, place) <= COVER_KM));
  }

  // --- the Géo'DAE file -------------------------------------------------------

  get cachePath() {
    return this.dataDir ? join(this.dataDir, CACHE_FILE) : null;
  }

  async loadCache() {
    if (!this.cachePath) {
      return;
    }
    try {
      const saved = JSON.parse(await readFile(this.cachePath, 'utf8'));
      if (saved?.version === CACHE_VERSION && Array.isArray(saved.items)) {
        this.data = {
          items: saved.items,
          updatedAt: saved.updatedAt ?? null,
          fetchedAt: saved.fetchedAt ?? 0,
          coverage: saved.coverage ?? [],
        };
        logger.debug(`${saved.items.length} defibrillator(s) read from the cache`);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`Cache ignored: ${err.message}`);
      }
    }
  }

  async saveCache() {
    if (!this.cachePath) {
      return;
    }
    try {
      await mkdir(this.dataDir, { recursive: true });
      const temporary = `${this.cachePath}.tmp`;
      await writeFile(temporary, JSON.stringify({ version: CACHE_VERSION, ...this.data }));
      await rename(temporary, this.cachePath);
    } catch (err) {
      logger.warn(`Cannot save the cache: ${err.message}`);
    }
  }

  /** True when the file must be downloaded for these places. */
  needsDownload(places) {
    if (places.length === 0) {
      return false;
    }
    if (!this.data || !this.covers(places)) {
      return true;
    }
    return this.now() - this.data.fetchedAt >= READ_MS;
  }

  /** One read; concurrent calls share it. */
  refresh({ discover = false } = {}) {
    if (!this.refreshing) {
      this.refreshing = this.readAll(discover)
        .catch((err) => logger.warn(`Refresh failed: ${err.message}`))
        .finally(() => {
          this.refreshing = null;
        });
      return this.refreshing;
    }
    // Asked during a read (places just changed): read again right after it.
    return discover ? this.refreshing.then(() => this.refresh({ discover })) : this.refreshing;
  }

  async readAll(forceDiscovery) {
    await this.readHouses();
    const places = this.neededPlaces();
    const placesChanged = Boolean(this.data) && !this.covers(places);
    // A failed download waits for its retry, unless the places changed or the
    // user asked (a scan, a saved configuration).
    if (
      this.needsDownload(places) &&
      (this.now() >= this.retryAt || placesChanged || forceDiscovery)
    ) {
      await this.download(places);
    }
    await this.publishDiscovered({ force: forceDiscovery });
    await this.tick({ refresh: false });
  }

  async download(places) {
    try {
      const { items, total, updatedAt } = await readGeodae(this.fetch, places, {
        minRows: this.minRows,
      });
      this.data = { items, updatedAt, fetchedAt: this.now(), coverage: places };
      this.lists.clear();
      if (this.error) {
        logger.info('Géo’DAE file downloaded again');
      }
      this.error = null;
      this.retryAt = 0;
      logger.debug(`Géo’DAE: ${items.length} of ${total} defibrillator(s) kept`);
      await this.saveCache();
      if (this.disconnected) {
        this.disconnected = false;
        await this.gladys.setConnectionStatus(true).catch(() => {});
      }
    } catch (err) {
      // Kept: the defibrillators of the last good download.
      if (!this.error) {
        logger.warn(`Géo’DAE file unavailable: ${err.message}`);
      }
      this.error = err.message;
      this.retryAt = this.now() + RETRY_MS;
      if (!this.data && !this.disconnected) {
        this.disconnected = true;
        await this.gladys.setConnectionStatus(false, DATA_UNAVAILABLE).catch(() => {});
      }
    }
  }

  /** Waits for the first reading (at most `ms`), for a widget or a scene action asked at start. */
  async firstReading(ms = 10000) {
    let timer;
    await Promise.race([
      this.loading,
      new Promise((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
    ]);
    clearTimeout(timer);
  }

  // --- devices ----------------------------------------------------------------

  refreshWidget() {
    this.gladys.requestWidgetRefresh?.(WIDGET_KEY)?.catch?.(() => {});
  }

  async publishDiscovered({ force = false } = {}) {
    const devices = this.offeredPlaces().map((place) =>
      buildPlaceDevice(this.gladys, place, this.config.language),
    );
    const signature = JSON.stringify(devices);
    if (!force && signature === this.discoveredSignature) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discoveredSignature = signature;
      if (this.discoveryFailed) {
        this.discoveryFailed = false;
        logger.info('Discovered places published again');
      }
    } catch (err) {
      if (!this.discoveryFailed) {
        logger.warn(`Cannot publish the discovered places: ${err.message}`);
      }
      this.discoveryFailed = true;
    }
  }

  async publish(states) {
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      if (this.publishFailed) {
        this.publishFailed = false;
        logger.info('States published again');
      }
    } catch (err) {
      // Gladys restarting: said once, the next tick sends them again.
      if (!this.publishFailed) {
        logger.warn(`Cannot publish ${states.length} state(s): ${err.message}`);
      }
      this.publishFailed = true;
    }
  }

  /** A device was just added in Gladys: its states, all of them, now. */
  async onDeviceCreated(device) {
    const entry = this.watched().find((w) => w.deviceId === device?.external_id);
    if (entry) {
      if (this.data && this.covers([entry])) {
        await this.publish(
          placeStates(this.gladys, entry.key, this.view(entry), this.config.language),
        );
      } else {
        await this.refresh();
      }
    }
    this.refreshWidget();
  }

  // --- evaluation -------------------------------------------------------------

  /** The defibrillators of a place, nearest first (computed once per download and location). */
  listOf(place) {
    if (!this.data) {
      return [];
    }
    const signature = `${place.lat},${place.lon},${this.data.fetchedAt}`;
    const cached = this.lists.get(place.key);
    if (cached?.signature === signature) {
      return cached.list;
    }
    const list = nearestOf(this.data.items, place, SEARCH_KM);
    this.lists.set(place.key, { signature, list });
    return list;
  }

  /**
   * What a place is at the current minute: its defibrillators with their
   * availability, the counts within the radius.
   */
  view(place) {
    // The hours are read in the zone of each defibrillator (overseas ones).
    const locals = new Map();
    const localOf = (department) => {
      const zone = zoneOf(department);
      if (!locals.has(zone)) {
        locals.set(zone, localTime(this.now(), zone));
      }
      return locals.get(zone);
    };
    const radius = this.config.radius;
    let count = 0;
    let availableCount = 0;
    const list = this.listOf(place).map((item) => {
      const available = availableAt(item.schedule, localOf(item.department), item.department);
      if (item.meters <= radius) {
        count += 1;
        if (available === true) {
          availableCount += 1;
        }
      }
      return { ...item, available };
    });
    return {
      list,
      count,
      availableCount,
      updatedAt: this.data?.updatedAt ?? this.data?.fetchedAt ?? null,
    };
  }

  /** One evaluation of every place added; the weekly download when it is due. */
  async tick({ refresh = true } = {}) {
    // The houses are read again every hour: a house newly located or moved.
    const housesDue = this.now() - this.housesReadAt >= HOUSES_MS;
    if (
      refresh &&
      !this.refreshing &&
      (housesDue || (this.needsDownload(this.neededPlaces()) && this.now() >= this.retryAt))
    ) {
      // In the background: the evaluation does not wait for 80 MB.
      this.refresh();
    }
    if (!this.data) {
      return;
    }
    const states = [];
    for (const entry of this.watched()) {
      if (!this.covers([entry])) {
        continue;
      }
      states.push(...placeStates(this.gladys, entry.key, this.view(entry), this.config.language));
    }
    await this.publish(states);
  }

  // --- texts --------------------------------------------------------------------

  /** The sentence of the nearest defibrillator of a place, for a message or a speaker. */
  sentence(entry, language) {
    const { list } = this.view(entry);
    const nearest = list[0];
    if (!nearest) {
      return say(TEXT, language, 'sentenceNone', { place: entry.placeName, km: SEARCH_KM });
    }
    const statusKey =
      nearest.available === null
        ? 'statusUnknown'
        : nearest.available
          ? 'statusAvailable'
          : 'statusClosed';
    return say(TEXT, language, 'sentence', {
      place: entry.placeName,
      name: nearest.name || nearest.id,
      distance: say(TEXT, language, 'meters', { meters: nearest.meters }),
      address: nearest.address,
      where: nearest.spot,
      access: say(TEXT, language, nearest.free ? 'free' : 'restricted'),
      status: say(TEXT, language, statusKey),
    });
  }

  /** The `status` action: places, data, last error, in every language. */
  async status() {
    await this.firstReading();
    const message = {};
    for (const language of Object.keys(TEXT)) {
      const lines = [];
      const places = this.watched().length;
      if (this.neededPlaces().length === 0) {
        lines.push(say(TEXT, language, 'reportNoPlace'));
      } else if (this.data) {
        lines.push(
          say(TEXT, language, 'report', {
            places,
            items: this.data.items.length,
            date: dateText(this.data.updatedAt ?? this.data.fetchedAt, language),
          }),
        );
      } else {
        lines.push(say(TEXT, language, 'reportNone'));
      }
      if (this.error) {
        lines.push(say(TEXT, language, 'reportError', { error: this.error }));
      }
      message[language] = lines.join('\n');
    }
    return message;
  }
}
