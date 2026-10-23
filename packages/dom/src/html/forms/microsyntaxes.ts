// Common microsyntaxes used by <input>: numbers, dates and times, colors, e-mail addresses.
// https://html.spec.whatwg.org/#common-microsyntaxes
//
// Date/time parsing follows jsdom's lib/jsdom/living/helpers/dates-and-times.js and
// number-and-date-inputs.js (MIT, Copyright (c) 2010 Elijah Insua), restructured to return
// plain numbers (milliseconds / months) instead of objects.

/** https://html.spec.whatwg.org/#valid-floating-point-number */
const FLOAT_RE = /^-?(?:\d+|\d*\.\d+)(?:[eE][-+]?\d+)?$/;

export function isValidFloatString(s: string): boolean {
  return FLOAT_RE.test(s);
}

/**
 * https://html.spec.whatwg.org/#rules-for-parsing-floating-point-number-values, restricted to
 * valid floating-point numbers (what value sanitization requires). NaN on error.
 */
export function parseFloatStrict(s: string): number {
  if (!FLOAT_RE.test(s)) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * https://html.spec.whatwg.org/#rules-for-parsing-floating-point-number-values (lenient: used for
 * min/max/step attributes, which accept leading whitespace-free prefixes like "1.5abc"). NaN on error.
 */
export function parseFloatLenient(s: string): number {
  const m = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?/.exec(s);
  if (m === null) return NaN;
  const n = Number(m[0]);
  return Number.isFinite(n) ? (n === 0 ? 0 : n) : NaN;
}

/** https://html.spec.whatwg.org/#best-representation-of-the-number-as-a-floating-point-number */
export function serializeFloat(n: number): string {
  return String(n === 0 ? 0 : n);
}

// --- dates and times ------------------------------------------------------------------------

function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** https://html.spec.whatwg.org/#number-of-days-in-month-month-of-year-year */
export function daysInMonth(month: number, year: number): number {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

/** Date.UTC that does not map years 0–99 onto 1900–1999. */
export function utcMs(year: number, month = 1, day = 1, hour = 0, minute = 0, second = 0, ms = 0): number {
  if (year > 99 || year < 0) return Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second, ms);
  return d.getTime();
}

const MONTH_RE = /^(\d{4,})-(\d{2})$/;
const DATE_RE = /^(\d{4,})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const WEEK_RE = /^(\d{4,})-W(\d{2})$/;

/** https://html.spec.whatwg.org/#valid-date-string (no ECMAScript Date range limit). */
export function isValidDateString(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (m === null) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(month, year);
}

/** https://html.spec.whatwg.org/#valid-month-string */
export function isValidMonthString(s: string): boolean {
  const m = MONTH_RE.exec(s);
  if (m === null) return false;
  const month = Number(m[2]);
  return Number(m[1]) > 0 && month >= 1 && month <= 12;
}

/** https://html.spec.whatwg.org/#valid-week-string */
export function isValidWeekString(s: string): boolean {
  const m = WEEK_RE.exec(s);
  if (m === null) return false;
  const year = Number(m[1]);
  const week = Number(m[2]);
  return year > 0 && week >= 1 && week <= lastWeekNumber(year);
}

/** https://html.spec.whatwg.org/#valid-time-string */
export function isValidTimeString(s: string): boolean {
  return !Number.isNaN(parseTime(s));
}

/**
 * Value sanitization for datetime-local: a valid local date and time string becomes the
 * valid normalized one (T separator, shortest time); anything else becomes "".
 * https://html.spec.whatwg.org/#local-date-and-time-state-(type=datetime-local)
 */
export function normalizeLocalDateTime(s: string): string {
  let sep = s.indexOf("T");
  if (sep === -1) sep = s.indexOf(" ");
  if (sep === -1) return "";
  const date = s.slice(0, sep);
  if (!isValidDateString(date)) return "";
  const time = parseTime(s.slice(sep + 1));
  if (Number.isNaN(time)) return "";
  return date + "T" + serializeTime(time);
}

/** https://html.spec.whatwg.org/#parse-a-month-string → months since 1970-01, or NaN. */
export function parseMonth(s: string): number {
  const m = MONTH_RE.exec(s);
  if (m === null) return NaN;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year <= 0 || month < 1 || month > 12) return NaN;
  return (year - 1970) * 12 + (month - 1);
}

/** https://html.spec.whatwg.org/#parse-a-date-string → UTC ms at midnight, or NaN. */
export function parseDate(s: string): number {
  const m = DATE_RE.exec(s);
  if (m === null) return NaN;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year <= 0 || month < 1 || month > 12 || day < 1 || day > daysInMonth(month, year)) return NaN;
  return utcMs(year, month, day);
}

/** https://html.spec.whatwg.org/#parse-a-time-string → ms since midnight, or NaN. */
export function parseTime(s: string): number {
  const m = TIME_RE.exec(s);
  if (m === null) return NaN;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = m[3] === undefined ? 0 : Number(m[3]);
  const ms = m[4] === undefined ? 0 : Number(m[4].padEnd(3, "0"));
  if (hour > 23 || minute > 59 || second > 59) return NaN;
  return ((hour * 60 + minute) * 60 + second) * 1000 + ms;
}

/** https://html.spec.whatwg.org/#parse-a-local-date-and-time-string → ms, or NaN. */
export function parseLocalDateTime(s: string): number {
  let sep = s.indexOf("T");
  if (sep === -1) sep = s.indexOf(" ");
  if (sep === -1) return NaN;
  const date = parseDate(s.slice(0, sep));
  if (Number.isNaN(date)) return NaN;
  const time = parseTime(s.slice(sep + 1));
  if (Number.isNaN(time)) return NaN;
  return date + time;
}

/** https://html.spec.whatwg.org/#week-number-of-the-last-day */
function lastWeekNumber(year: number): number {
  const jan1 = new Date(utcMs(year)).getUTCDay();
  return jan1 === 4 || (isLeapYear(year) && jan1 === 3) ? 53 : 52;
}

/** https://html.spec.whatwg.org/#parse-a-week-string → UTC ms of the Monday that starts the week, or NaN. */
export function parseWeek(s: string): number {
  const m = WEEK_RE.exec(s);
  if (m === null) return NaN;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (year <= 0 || week < 1 || week > lastWeekNumber(year)) return NaN;
  const jan1 = utcMs(year);
  // Day of week of Jan 1 relative to Monday (Mon=0 ... Sun=6), then the Monday of week 1 is
  // the Monday of the week containing Jan 4.
  const dow = (new Date(jan1).getUTCDay() + 6) % 7;
  const week1Monday = dow <= 3 ? jan1 - dow * 86400000 : jan1 + (7 - dow) * 86400000;
  return week1Monday + (week - 1) * 7 * 86400000;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

export function serializeDate(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

export function serializeMonth(months: number): string {
  const year = 1970 + Math.floor(months / 12);
  const month = ((months % 12) + 12) % 12;
  return `${pad(year, 4)}-${pad(month + 1, 2)}`;
}

/** Shortest valid time string (https://html.spec.whatwg.org/#valid-normalised-local-date-and-time-string). */
export function serializeTime(ms: number): string {
  const t = ((ms % 86400000) + 86400000) % 86400000;
  const hour = Math.floor(t / 3600000);
  const minute = Math.floor(t / 60000) % 60;
  const second = Math.floor(t / 1000) % 60;
  const milli = Math.round(t % 1000);
  let s = `${pad(hour, 2)}:${pad(minute, 2)}`;
  if (second !== 0 || milli !== 0) {
    s += ":" + pad(second, 2);
    if (milli !== 0) s += "." + pad(milli, 3).replace(/0+$/, "");
  }
  return s;
}

export function serializeLocalDateTime(ms: number): string {
  const dayMs = Math.floor(ms / 86400000) * 86400000;
  return serializeDate(dayMs) + "T" + serializeTime(ms - dayMs);
}

export function serializeWeek(ms: number): string {
  // ISO week-numbering year: the year of the Thursday of this week.
  const d = new Date(ms);
  const dow = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(ms + (3 - dow) * 86400000);
  const year = thursday.getUTCFullYear();
  const jan1 = utcMs(year);
  const week = Math.floor((thursday.getTime() - jan1) / 86400000 / 7) + 1;
  return `${pad(year, 4)}-W${pad(week, 2)}`;
}

// --- colors -------------------------------------------------------------------------------

/** https://html.spec.whatwg.org/#valid-simple-colour (lowercased). */
export function isValidSimpleColor(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

// --- e-mail -------------------------------------------------------------------------------

/** https://html.spec.whatwg.org/#valid-e-mail-address */
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s);
}

/** https://html.spec.whatwg.org/#valid-absolute-url (approximated by the URL parser). */
export function isValidAbsoluteURL(s: string): boolean {
  return URL.canParse(s);
}
