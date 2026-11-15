/**
 * Cinema Business Day Cycle Helper (4:00 AM IST - 03:59:59 AM IST)
 * In cinema operations, movie screenings run until 2-3 AM.
 * Orders placed between 12:00 AM and 03:59 AM are considered part of the previous day's business cycle.
 */

const IST_OFFSET_MS = 19800000; // 5 hours 30 minutes in milliseconds
const FOUR_HOURS_MS = 14400000; // 4 hours in milliseconds
const CYCLE_START_OFFSET_MS = 5400000; // 1.5 hours in ms (19800000 - 14400000)
const CYCLE_END_OFFSET_MS = 80999999; // 86400000 - 5400000 - 1 ms

function normalizeDateInput(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  // If DD-MM-YYYY format (e.g. 15-11-2026)
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('-');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // If DD/MM/YYYY format
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return trimmed;
}

/**
 * Returns UTC ISO string for 4:00:00 AM IST on the given 'YYYY-MM-DD' or 'DD-MM-YYYY' date.
 * Example: '2026-10-07' or '07-10-2026' -> '2026-10-06T22:30:00.000Z' (which is 2026-10-07 04:00:00 IST)
 */
export function getCinemaCycleStart(dateStr) {
  if (!dateStr) return null;
  try {
    const normalized = normalizeDateInput(dateStr);
    const utcDate = new Date(`${normalized}T00:00:00Z`);
    if (isNaN(utcDate.getTime())) return null;
    return new Date(utcDate.getTime() - CYCLE_START_OFFSET_MS).toISOString();
  } catch (err) {
    return null;
  }
}

/**
 * Returns UTC ISO string for 03:59:59.999 AM IST on the day AFTER the given 'YYYY-MM-DD' or 'DD-MM-YYYY' date.
 * Example: '2026-10-07' or '07-10-2026' -> '2026-10-07T22:29:59.999Z' (which is 2026-10-08 03:59:59.999 IST)
 */
export function getCinemaCycleEnd(dateStr) {
  if (!dateStr) return null;
  try {
    const normalized = normalizeDateInput(dateStr);
    const utcDate = new Date(`${normalized}T00:00:00Z`);
    if (isNaN(utcDate.getTime())) return null;
    return new Date(utcDate.getTime() + CYCLE_END_OFFSET_MS).toISOString();
  } catch (err) {
    return null;
  }
}

/**
 * Returns the current active Cinema Business Date as 'YYYY-MM-DD'.
 * If current IST time is before 4:00 AM (00:00 to 03:59), the business date is yesterday's calendar date.
 */
export function getCurrentCinemaBusinessDate() {
  const now = new Date();
  const istFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false
  });

  const parts = istFormatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);

  const businessDate = new Date(`${year}-${month}-${day}T00:00:00Z`);

  // If before 4:00 AM IST, rolls back to previous calendar day
  if (hour < 4) {
    businessDate.setUTCDate(businessDate.getUTCDate() - 1);
  }

  const pad = (n) => String(n).padStart(2, '0');
  return `${businessDate.getUTCFullYear()}-${pad(businessDate.getUTCMonth() + 1)}-${pad(businessDate.getUTCDate())}`;
}

/**
 * Returns human-friendly text describing the 24-hr 4am-4am cycle for a date or date range.
 */
export function getCinemaCycleDescription(startDate, endDate) {
  if (!startDate && !endDate) {
    return 'All time (24hr cycle: 4:00 AM - 4:00 AM next day)';
  }
  if (startDate && (!endDate || startDate === endDate)) {
    return `${startDate} (4:00 AM to next morning 4:00 AM)`;
  }
  return `${startDate} 4:00 AM to ${endDate} +1 morning 4:00 AM`;
}

export function getISTNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

export function toDateStr(d) {
  const pad = (n) => n < 10 ? '0' + n : n;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Converts an order UTC timestamp into its Cinema Business Date ('YYYY-MM-DD').
 * Hours 00:00 - 03:59:59 IST belong to the previous day's 4:00 AM - 4:00 AM cycle.
 */
export function getOrderBusinessDate(timestamp) {
  if (!timestamp) return null;
  const d = typeof timestamp === 'string' && (timestamp.endsWith('Z') || timestamp.includes('+'))
    ? new Date(timestamp)
    : new Date(timestamp + 'Z');
  if (isNaN(d.getTime())) return null;

  // IST offset = 5 hours 30 mins = 19,800,000 ms
  const istTime = new Date(d.getTime() + 19800000);
  const istHour = istTime.getUTCHours();
  if (istHour < 4) {
    istTime.setUTCDate(istTime.getUTCDate() - 1);
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${istTime.getUTCFullYear()}-${pad(istTime.getUTCMonth() + 1)}-${pad(istTime.getUTCDate())}`;
}
