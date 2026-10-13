const p2 = (n: number) => String(n).padStart(2, '0');

/** 本地日期 YYYY-MM-DD（不是 UTC，避免日本/中国时区跨日错误） */
export function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** 本地时间 HH:mm:ss */
export function localTime(d: Date = new Date()): string {
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

export function localMonth(d: Date = new Date()): string {
  return localDate(d).slice(0, 7);
}

export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s);

// ---------- 表示用（日本語）。内部の日付キー（YYYY-MM-DD）は変更しない ----------

const jaDate = new Intl.DateTimeFormat('ja-JP', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
const jaMonth = new Intl.DateTimeFormat('ja-JP', { timeZone: 'UTC', year: 'numeric', month: 'long' });

/** '2026-10-13' → '2026年10月13日'（保存済みの日付文字列をそのまま整形するのでタイムゾーンでずれない） */
export function fmtDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return jaDate.format(new Date(Date.UTC(y, m - 1, d)));
}

/** '2026-10' → '2026年10月' */
export function fmtMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return jaMonth.format(new Date(Date.UTC(y, m - 1, 1)));
}

/** '12:05:09' → '12:05' */
export const fmtTime = (time: string): string => time.slice(0, 5);

/** → '2026年10月13日 12:05' */
export const fmtDateTime = (date: string, time: string): string => `${fmtDate(date)} ${fmtTime(time)}`;
