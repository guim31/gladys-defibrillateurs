// -----------------------------------------------------------------------------
// The declared hours: the forms found in the national file (census of
// 2026-11-15), "available now", and their text.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hoursText } from '../src/devices.js';
import { availableAt, parseHours } from '../src/hours.js';

// Monday 2026-11-16; Wednesday 2026-11-11 is a public holiday (Armistice).
const at = (text, date, time, department = '31') => {
  const [h, m] = time.split(':').map(Number);
  return availableAt(parseHours(text), { date, minutes: h * 60 + m }, department);
};

test('nothing entered reads as "not declared", never as "never available"', () => {
  for (const text of [
    '',
    'OFF',
    'Mo-Su off',
    'Mo-Su off; PH off',
    'not a schedule',
    'Mo-Fr 25:00-26:00',
  ]) {
    assert.equal(parseHours(text).declared, false, text);
    assert.equal(at(text, '2026-11-16', '10:00'), null, text);
    assert.equal(hoursText(parseHours(text), 'fr'), 'Horaires non déclarés', text);
  }
});

test('24/7 and every day from 00:00 to 23:59 are always available', () => {
  for (const text of ['24/7', 'Mo-Su 00:00-23:59']) {
    const schedule = parseHours(text);
    assert.equal(schedule.always, true, text);
    assert.equal(at(text, '2026-11-15', '03:00'), true, text);
    assert.equal(hoursText(schedule, 'fr'), '24 h/24, 7 j/7');
    assert.equal(hoursText(schedule, 'en'), '24/7');
  }
  assert.equal(parseHours('24/7; PH off').always, false);
});

test('office hours: open slots, lunch break, weekend', () => {
  const text = 'Mo-Fr 09:00-12:00,14:00-18:00';
  assert.equal(at(text, '2026-11-16', '09:00'), true);
  assert.equal(at(text, '2026-11-16', '12:30'), false);
  assert.equal(at(text, '2026-11-16', '17:59'), true);
  assert.equal(at(text, '2026-11-16', '18:00'), false);
  assert.equal(at(text, '2026-11-15', '10:00'), false); // Sunday
  assert.equal(
    hoursText(parseHours(text), 'fr'),
    'lun.–ven. 09:00–12:00, 14:00–18:00 ; sam.–dim. fermé',
  );
  assert.equal(
    hoursText(parseHours(text), 'de'),
    'Mo–Fr 09:00–12:00, 14:00–18:00; Sa–So geschlossen',
  );
});

test('one rule per day reads the same as a range', () => {
  const text = 'Mo 08:00-17:00; Tu 08:00-17:00; We 08:00-17:00; Th 08:00-17:00; Fr 08:00-17:00';
  assert.equal(hoursText(parseHours(text), 'en'), 'Mon–Fri 08:00–17:00; Sat–Sun closed');
  assert.equal(at(text, '2026-11-20', '16:00'), true);
});

test('public holidays: PH off closes, PH with hours opens', () => {
  assert.equal(at('Mo-Fr 09:00-18:00; PH off', '2026-11-11', '10:00'), false);
  assert.equal(at('Mo-Fr 09:00-18:00; PH off', '2026-11-12', '10:00'), true);
  assert.equal(at('Mo-Sa 09:00-18:30; Su off; PH 09:00-17:00', '2026-11-11', '17:30'), false);
  assert.equal(at('Mo-Sa 09:00-18:30; Su off; PH 09:00-17:00', '2026-11-11', '16:30'), true);
  // A holiday of Alsace-Moselle only.
  assert.equal(at('Mo-Su 09:00-18:00; PH off', '2026-12-26', '10:00', '67'), false);
  assert.equal(at('Mo-Su 09:00-18:00; PH off', '2026-12-26', '10:00', '31'), true);
  assert.equal(
    hoursText(parseHours('Mo-Fr 09:00-18:00; PH off'), 'fr'),
    'lun.–ven. 09:00–18:00 ; sam.–dim. fermé ; jours fériés : fermé',
  );
});

test('dates of the year: summer closure, a single day, a range across the new year', () => {
  const summer = 'Mo-Fr 07:00-20:00; Sa-Su off; PH off; Jul 20-Aug 24 off';
  assert.equal(at(summer, '2026-08-03', '10:00'), false);
  assert.equal(at(summer, '2026-08-25', '10:00'), true);
  assert.match(hoursText(parseHours(summer), 'fr'), /fermé à certaines dates$/);
  const eve = 'Mo-Fr 08:30-17:00; Dec 24 08:30-12:00';
  assert.equal(at(eve, '2026-12-24', '13:00'), false);
  assert.equal(at(eve, '2026-12-23', '13:00'), true);
  const winter = 'Mo-Su 08:00-18:00; Dec 20-Jan 03 off';
  assert.equal(at(winter, '2026-12-31', '10:00'), false);
  assert.equal(at(winter, '2027-01-02', '10:00'), false);
  assert.equal(at(winter, '2027-01-04', '10:00'), true);
});

test('a slot past midnight carries over to the next morning', () => {
  const text = 'Fr-Sa 20:00-02:00';
  assert.equal(at(text, '2026-11-20', '23:00'), true); // Friday
  assert.equal(at(text, '2026-11-21', '01:30'), true); // Saturday night
  assert.equal(at(text, '2026-11-21', '02:30'), false);
  assert.equal(at(text, '2026-11-19', '01:00'), false); // Thursday
});

test('a date or holiday rule with partial hours is not "always available"', () => {
  const autumn = 'Mo-Su 00:00-23:59; Oct 01-Dec 31 08:00-17:00';
  assert.equal(parseHours(autumn).always, false);
  assert.equal(at(autumn, '2026-11-16', '22:00'), false);
  assert.equal(at(autumn, '2026-06-16', '22:00'), true);
  assert.equal(at('24/7; PH 08:00-12:00', '2026-12-25', '20:00'), false);
  assert.equal(hoursText(parseHours('Mo-Su 22:00-06:00'), 'en'), 'every day 22:00–06:00');
});
