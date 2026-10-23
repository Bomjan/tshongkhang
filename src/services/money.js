export const MAX_CENTS = 999999999999n; // NUMERIC(12,2)

export function toCents(decimal) {
  if (!/^(0|[1-9]\d{0,9})\.\d{2}$/.test(decimal)) throw new Error('Invalid stored money value');
  return BigInt(decimal.replace('.', ''));
}

export function fromCents(cents) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
