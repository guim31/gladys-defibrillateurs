// -----------------------------------------------------------------------------
// The availability hours of a defibrillator. Géo'DAE publishes them in the
// `c_dispo_horaires` column, in the OpenStreetMap `opening_hours` syntax, a
// small subset of it in practice (census of the national file, 2026-11-15):
//
//   24/7 · Mo-Fr 09:00-12:00,14:00-18:00 · Sa-Su off · PH off
//   Mo 08:00-17:00; Tu 08:00-17:00; …        one rule per day
//   Jul 20-Aug 24 off · Dec 24 08:30-12:00   dates of the year
//
// Rules apply in order, a later rule replacing the earlier ones on the days it
// matches (the OSM semantics). "Mo-Su off" (61 % of the file) and "OFF" are
// what the declaration form writes when nothing was entered: no open slot at
// all in the week reads as "hours not declared", never as "never available".
// A text outside this subset (0.15 % of the file) reads as not declared too.
// -----------------------------------------------------------------------------

import { addDays, weekdayOf } from './clock.js';
import { isHoliday } from './holidays.js';

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LIST =
  /^(?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*$/;
const DATE = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\\d{1,2})';
const TIME_LIST = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}\+?(?:,\d{1,2}:\d{2}-\d{1,2}:\d{2}\+?)*$/;

export const DAY_MINUTES = 1440;

const minutesOf = (text) => {
  const [hours, minutes] = text.split(':').map(Number);
  return hours * 60 + minutes;
};

/** "08:00-12:00,14:00-18:00" → slots; an end at or before the start runs past midnight. */
function parseTimes(text) {
  return text.split(',').map((range) => {
    const [fromText, toText] = range.replace('+', '').split('-');
    const from = minutesOf(fromText);
    let to = minutesOf(toText);
    // 23:59 is how the form says "until midnight".
    if (to === DAY_MINUTES - 1) {
      to = DAY_MINUTES;
    }
    if (to <= from) {
      to += DAY_MINUTES;
    }
    if (from >= DAY_MINUTES || to > 2 * DAY_MINUTES) {
      throw new Error('time out of range');
    }
    return { from, to };
  });
}

/** "Mo-Fr,Su,PH" → { days: Set of 0..6, ph }. */
function parseDays(text) {
  const days = new Set();
  let ph = false;
  for (const part of text.split(',')) {
    if (part === 'PH') {
      ph = true;
      continue;
    }
    const [from, to = from] = part.split('-').map((day) => DAYS.indexOf(day));
    for (let day = from; ; day = (day + 1) % 7) {
      days.add(day);
      if (day === to) {
        break;
      }
    }
  }
  return { days: days.size > 0 ? days : null, ph };
}

const monthDay = (month, day) =>
  `${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;

/** One rule, or null when it is outside the subset. */
function parseRule(text) {
  let rest = text.trim();
  if (rest === '24/7') {
    return { dates: null, days: null, ph: false, slots: [{ from: 0, to: DAY_MINUTES }] };
  }
  let dates = null;
  const dateMatch = new RegExp(`^${DATE}(?:-${DATE})?(?= |$)`).exec(rest);
  if (dateMatch) {
    const [, m1, d1, m2 = m1, d2 = d1] = dateMatch;
    dates = { from: monthDay(m1, d1), to: monthDay(m2, d2) };
    rest = rest.slice(dateMatch[0].length).trim();
  }
  let days = null;
  let ph = false;
  const [first = '', ...others] = rest.split(' ').filter(Boolean);
  let timeText = rest;
  if (DAY_LIST.test(first)) {
    ({ days, ph } = parseDays(first));
    timeText = others.join(' ');
  }
  let slots;
  if (timeText === '') {
    // A day selector alone: the whole day.
    slots = [{ from: 0, to: DAY_MINUTES }];
  } else if (timeText === 'off' || timeText === 'closed') {
    slots = [];
  } else if (TIME_LIST.test(timeText)) {
    slots = parseTimes(timeText);
  } else {
    return null;
  }
  if (!dates && !days && !ph && timeText === '') {
    return null;
  }
  return { dates, days, ph, slots };
}

/**
 * Parses a `c_dispo_horaires` text.
 * @returns {{ declared: boolean, always: boolean, rules: object[] }}
 */
export function parseHours(text) {
  const raw = String(text ?? '').trim();
  const none = { declared: false, always: false, rules: [] };
  if (raw === '' || raw.toLowerCase() === 'off') {
    return none;
  }
  const rules = [];
  try {
    for (const part of raw.split(';')) {
      if (part.trim() === '') {
        continue;
      }
      const rule = parseRule(part);
      if (!rule) {
        return none;
      }
      rules.push(rule);
    }
  } catch {
    return none;
  }
  const declared = rules.some((rule) => rule.slots.length > 0);
  if (!declared) {
    return none;
  }
  const schedule = { declared: true, always: false, rules };
  schedule.always = DAYS.every((_, day) => {
    const slots = weekSlots(schedule, day);
    return slots.length === 1 && slots[0].from === 0 && slots[0].to >= DAY_MINUTES;
  });
  // Holidays and dates of the year may still close it.
  const wholeDay = (slots) => slots.some((s) => s.from === 0 && s.to >= DAY_MINUTES);
  schedule.always &&= rules.every((rule) => !(rule.ph || rule.dates) || wholeDay(rule.slots));
  return schedule;
}

const inDates = (dates, date) => {
  const md = date.slice(5);
  return dates.from <= dates.to
    ? md >= dates.from && md <= dates.to
    : md >= dates.from || md <= dates.to;
};

/** The slots of a calendar day: the last rule matching it wins. */
export function slotsOn(schedule, date, department) {
  const weekday = weekdayOf(date);
  const holiday = schedule.rules.some((rule) => rule.ph) && isHoliday(date, department);
  let slots = [];
  for (const rule of schedule.rules) {
    if (rule.dates && !inDates(rule.dates, date)) {
      continue;
    }
    const daySelected = rule.days || rule.ph;
    if (daySelected && !(rule.days?.has(weekday) || (rule.ph && holiday))) {
      continue;
    }
    slots = rule.slots;
  }
  return slots;
}

/** The slots of a weekday in an ordinary week (no holiday, no date of the year). */
export function weekSlots(schedule, weekday) {
  let slots = [];
  for (const rule of schedule.rules) {
    if (rule.dates || (rule.ph && !rule.days)) {
      continue;
    }
    if (rule.days && !rule.days.has(weekday)) {
      continue;
    }
    slots = rule.slots;
  }
  return slots;
}

/**
 * Available at a local time? null when the hours are not declared.
 * @param {object} schedule from parseHours
 * @param {{ date: string, minutes: number }} local
 * @param {string} department for the public holidays
 */
export function availableAt(schedule, { date, minutes }, department) {
  if (!schedule?.declared) {
    return null;
  }
  if (schedule.always) {
    return true;
  }
  if (slotsOn(schedule, date, department).some((s) => minutes >= s.from && minutes < s.to)) {
    return true;
  }
  // A slot of the day before that runs past midnight.
  const before = slotsOn(schedule, addDays(date, -1), department);
  return before.some((s) => s.to > DAY_MINUTES && minutes < s.to - DAY_MINUTES);
}
