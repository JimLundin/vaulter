// Identities derived from source anchors, so a re-run assigns the same nodes and transactions, and
// fractional order keys, so inserting between siblings never renumbers them.
import { createHash } from 'node:crypto';

export const uuid = (key: string) => {
  const h = createHash('sha256').update(`vault-migration/v2\n${key}`).digest('hex');
  const variant = ((Number.parseInt(h[16]!, 16) & 3) | 8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 12);

// biome-ignore lint/security/noSecrets: the base-36 digits, not a secret
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
/** A key sorting strictly between two others; null is unbounded. */
export function between(after: string | null, before: string | null): string {
  let lower = after;
  let upper = before;
  let out = '';
  for (let i = 0; ; i++) {
    const lo = lower !== null && i < lower.length ? DIGITS.indexOf(lower[i]!) : 0;
    const hi = upper !== null && i < upper.length ? DIGITS.indexOf(upper[i]!) : 36;
    if (hi - lo > 1) return out + DIGITS[Math.floor((lo + hi) / 2)]!;
    out += DIGITS[lo]!;
    if (lo < hi) upper = null;
    if (lower !== null && i >= lower.length) lower = null;
  }
}
/** Order keys for children within (floor, ceiling), keeping the longest run of their previous keys
 * that is still in order. */
export function orderKeys(
  previous: readonly (string | undefined)[],
  floor: string,
  ceiling: string | null,
): string[] {
  const kept = new Set<number>();
  // Longest increasing subsequence of retained keys.
  const tails: number[] = [];
  const back: number[] = [];
  previous.forEach((key, i) => {
    if (key === undefined || key <= floor || (ceiling !== null && key >= ceiling)) return;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (previous[tails[mid]!]! < key) lo = mid + 1;
      else hi = mid;
    }
    back[i] = lo > 0 ? tails[lo - 1]! : -1;
    tails[lo] = i;
  });
  for (let i = tails.at(-1) ?? -1; i >= 0; i = back[i]!) kept.add(i);
  const out: string[] = [];
  for (let i = 0; i < previous.length; i++) {
    if (kept.has(i)) {
      out.push(previous[i]!);
      continue;
    }
    let next: string | null = ceiling;
    for (let j = i + 1; j < previous.length; j++)
      if (kept.has(j)) {
        next = previous[j]!;
        break;
      }
    out.push(between(out.at(-1) ?? floor, next));
  }
  return out;
}
