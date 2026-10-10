// Dates, the one place they are formatted. The vault's dates are strings ("2026", "2026-09", "2026-09-28")
// on the Stockholm calendar; YAML may hand an unquoted one back as a Date.

/** A frontmatter date (string, Date or missing) as its string form. */
export const dateStr = (v: unknown) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? '' : String(v);

/** Today in Stockholm, the vault's clock. */
export const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });

/** A month or year counts until its last day. */
export const lastDay = (d: string) =>
  d.length === 4 ? `${d}-12-31` : d.length === 7 ? `${d}-31` : d;

const fmt = (d: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...o });

/** "28 Sep 2026" (or without the year); "Sep 2026"; "2026". */
export const fmtDay = (d: string, withYear = true) =>
  d.length === 4
    ? d
    : d.length === 7
      ? fmt(`${d}-15`, { month: 'short', year: 'numeric' })
      : fmt(d, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
/** "Mon, 28 Sep" */
export const shortDay = (d: string) => fmt(d, { weekday: 'short', day: 'numeric', month: 'short' });
/** "Monday 28 September" */
export const longDay = (d: string) => fmt(d, { weekday: 'long', day: 'numeric', month: 'long' });
/** "28 Sep" */
export const dayMonth = (d: string) => (d ? fmt(d, { day: 'numeric', month: 'short' }) : '');
/** "Mon 28" */
export const weekdayDay = (d: string) => fmt(d, { weekday: 'short', day: 'numeric' });
/** "2026-09" -> "September 2026"; "2026" stays. */
export const monthName = (k: string) =>
  k.length === 4 ? k : fmt(`${k}-15`, { month: 'long', year: 'numeric' });
