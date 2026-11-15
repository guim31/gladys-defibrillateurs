import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localTime } from '../src/clock.js';
import { departmentOf, zoneOf } from '../src/geodae.js';

test('overseas defibrillators are read in their own time zone', () => {
  assert.equal(zoneOf(departmentOf('97411')), 'Indian/Reunion');
  assert.equal(zoneOf(departmentOf('97209')), 'America/Martinique');
  assert.equal(zoneOf(departmentOf('31555')), 'Europe/Paris');
  assert.equal(zoneOf(departmentOf('2A004')), 'Europe/Paris');
  // Monday 2026-11-16, 09:00 UTC: 10:00 in Paris, 13:00 in La Réunion.
  const instant = Date.UTC(2026, 10, 16, 9, 0, 0);
  assert.equal(localTime(instant, zoneOf('974')).minutes, 13 * 60);
  assert.equal(localTime(instant, zoneOf('31')).minutes, 10 * 60);
});
