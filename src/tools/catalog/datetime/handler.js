import { env } from '../../../config/env.js';
import { isValidTimeZone, phoneFromJid, timezoneFromPhone } from '../../../utils/timezone.js';

const GREETING_FIELDS = [
  'displayName',
  'firstName',
  'timezone',
  'timezoneAbbr',
  'date',
  'localTime',
  'timeOfDay',
  'greeting',
];

const FULL_FIELDS = [
  'displayName',
  'firstName',
  'timezone',
  'timezoneAbbr',
  'utcOffset',
  'iso',
  'unix',
  'date',
  'year',
  'month',
  'monthName',
  'day',
  'weekday',
  'weekdayShort',
  'weekNumber',
  'isWeekend',
  'localTime',
  'hour',
  'minute',
  'second',
  'hour12',
  'dayPeriod',
  'timeOfDay',
  'greeting',
];

function resolveQuery(value) {
  const query = String(value || 'greeting').trim().toLowerCase();
  if (['full', 'detailed', 'all', 'complete'].includes(query)) return 'full';
  if (['greeting', 'hello', 'hi', 'hey'].includes(query)) return 'greeting';
  if (query.includes('week')) return 'weekday';
  if (query.includes('time') && query.includes('zone')) return 'timezone';
  if (query.includes('date')) return 'date';
  if (query.includes('time')) return 'time';
  return query;
}

function timeOfDay(hour) {
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

function greetingFor(hour) {
  const bucket = timeOfDay(hour);
  if (bucket === 'morning') return 'Good morning';
  if (bucket === 'afternoon') return 'Good afternoon';
  if (bucket === 'evening') return 'Good evening';
  return 'Hello';
}

function formatInZone(now, timeZone, options) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).format(now);
}

function partsInZone(now, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'shortOffset',
  });
  const named = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return named;
}

function weekNumber(now, timeZone) {
  const year = Number.parseInt(formatInZone(now, timeZone, { year: 'numeric' }), 10);
  const month = Number.parseInt(formatInZone(now, timeZone, { month: 'numeric' }), 10) - 1;
  const dayOfMonth = Number.parseInt(formatInZone(now, timeZone, { day: 'numeric' }), 10);
  const date = new Date(Date.UTC(year, month, dayOfMonth));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86400000 + 1) / 7);
}

function firstName(displayName) {
  const name = String(displayName || '').trim();
  if (!name) return null;
  return name.split(/\s+/)[0];
}

function pickFields(snapshot, query) {
  if (query === 'full') {
    return Object.fromEntries(FULL_FIELDS.map((key) => [key, snapshot[key]]));
  }
  if (query === 'greeting') {
    return Object.fromEntries(GREETING_FIELDS.map((key) => [key, snapshot[key]]));
  }
  if (query === 'timezone') {
    return {
      timezone: snapshot.timezone,
      timezoneAbbr: snapshot.timezoneAbbr,
      utcOffset: snapshot.utcOffset,
      date: snapshot.date,
    };
  }
  if (query === 'date') {
    return {
      date: snapshot.date,
      weekday: snapshot.weekday,
      timezone: snapshot.timezone,
    };
  }
  if (query === 'time') {
    return {
      localTime: snapshot.localTime,
      timeOfDay: snapshot.timeOfDay,
      timezone: snapshot.timezone,
    };
  }
  if (query === 'weekday') {
    return {
      weekday: snapshot.weekday,
      isWeekend: snapshot.isWeekend,
      date: snapshot.date,
      timezone: snapshot.timezone,
    };
  }
  return Object.fromEntries(GREETING_FIELDS.map((key) => [key, snapshot[key]]));
}

export async function handler(args = {}, context = {}, options = {}) {
  const fallback = options.fallbackTimezone || env.DEFAULT_TIMEZONE || 'UTC';
  const requested = String(args.timezone || '').trim();
  const inferred = timezoneFromPhone(phoneFromJid(context.jid), fallback);
  const timezone = isValidTimeZone(requested) ? requested : inferred;
  const now = new Date();
  const parts = partsInZone(now, timezone);
  const hour = Number.parseInt(parts.hour, 10);
  const minute = Number.parseInt(parts.minute, 10);
  const second = Number.parseInt(parts.second, 10);
  const weekday = formatInZone(now, timezone, { weekday: 'long' });
  const snapshot = {
    displayName: context.pushName || null,
    firstName: firstName(context.pushName),
    timezone,
    timezoneAbbr: parts.timeZoneName || timezone,
    utcOffset: parts.timeZoneName || null,
    iso: now.toISOString(),
    unix: Math.floor(now.getTime() / 1000),
    date: formatInZone(now, timezone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    year: Number.parseInt(parts.year, 10),
    month: formatInZone(now, timezone, { month: '2-digit' }),
    monthName: parts.month,
    day: Number.parseInt(parts.day, 10),
    weekday,
    weekdayShort: formatInZone(now, timezone, { weekday: 'short' }),
    weekNumber: weekNumber(now, timezone),
    isWeekend: weekday === 'Saturday' || weekday === 'Sunday',
    localTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    hour,
    minute,
    second,
    hour12: ((hour + 11) % 12) + 1,
    dayPeriod: hour >= 12 ? 'PM' : 'AM',
    timeOfDay: timeOfDay(hour),
    greeting: greetingFor(hour),
  };

  const query = resolveQuery(args.query);
  return {
    ok: true,
    query,
    ...pickFields(snapshot, query),
  };
}
