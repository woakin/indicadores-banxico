import { fmtValue } from './utils.js';

describe('fmtValue', () => {
  test('returns "—" for null, undefined, empty string or "N/E"', () => {
    expect(fmtValue({}, null)).toBe('—');
    expect(fmtValue({}, undefined)).toBe('—');
    expect(fmtValue({}, '')).toBe('—');
    expect(fmtValue({}, 'N/E')).toBe('—');
  });

  test('formats numbers correctly with default decimals (2)', () => {
    // Note: Node.js en-MX locale might use comma as thousands separator and dot as decimal in recent versions,
    // but the system environment might vary.
    // Based on previous node -e check, 1234.56 -> 1,234.56
    expect(fmtValue({}, 1234.56)).toBe('1,234.56');
    expect(fmtValue({}, '1234.56')).toBe('1,234.56');
  });

  test('handles comma as decimal separator in input', () => {
    expect(fmtValue({}, '1234,56')).toBe('1,234.56');
  });

  test('cleans non-numeric characters from input', () => {
    expect(fmtValue({}, '$1,234.56 MXN')).toBe('1,234.56');
  });

  test('formats with custom decimals', () => {
    expect(fmtValue({ decimals: 4 }, 1.23456)).toBe('1.2346');
    expect(fmtValue({ decimals: 0 }, 1234.56)).toBe('1,235');
  });

  test('formats currency correctly', () => {
    // Default MXN
    // Result of (1234.56).toLocaleString("es-MX", {style: "currency", currency: "MXN"})
    // usually is $1,234.56
    const res = fmtValue({ type: 'currency' }, 1234.56);
    expect(res).toMatch(/\$1,234\.56/);

    // Custom currency
    const resUsd = fmtValue({ type: 'currency', currency: 'USD' }, 1234.56);
    expect(resUsd).toMatch(/USD/);
    expect(resUsd).toMatch(/1,234\.56/);
  });

  test('formats percent correctly', () => {
    // 5.25 in percent type means 5.25% which is 0.0525
    // fmtValue divides by 100 before formatting as percent
    // (5.25 / 100).toLocaleString("es-MX", {style: "percent"}) -> 5.25%
    expect(fmtValue({ type: 'percent' }, 5.25)).toBe('5.25%');
    expect(fmtValue({ type: 'percent', decimals: 1 }, 10.55)).toBe('10.6%');
  });

  test('returns original string if not a number', () => {
    expect(fmtValue({}, 'not-a-number')).toBe('not-a-number');
  });
});
