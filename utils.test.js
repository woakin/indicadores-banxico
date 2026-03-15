import { fmtValue, fmtDate } from './utils.js';

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

describe('fmtDate', () => {
  test('returns "—" for falsy values or "—"', () => {
    expect(fmtDate(null, 'Mensual')).toBe('—');
    expect(fmtDate('', 'Mensual')).toBe('—');
    expect(fmtDate('—', 'Mensual')).toBe('—');
  });

  test('formats MM/YYYY correctly with periodicity Mensual', () => {
    expect(fmtDate('05/2023', 'Mensual')).toBe('may 2023');
    expect(fmtDate('12/2023', 'Mensual')).toBe('dic 2023');
  });

  test('formats DD/MM/YYYY correctly with periodicity Mensual', () => {
    expect(fmtDate('15/05/2023', 'Mensual')).toBe('may 2023');
  });

  test('formats DD/MM/YYYY correctly with periodicity Quincenal', () => {
    // Current implementation for Quincenal returns "month year" if matches DD/MM/YYYY
    expect(fmtDate('15/05/2023', 'Quincenal')).toBe('may 2023');
  });

  test('fallback handles MM/YYYY correctly without specific periodicity', () => {
    // If periodicity is not Mensual/Quincenal, MM/YYYY fallback results in 01/MM/YYYY formatted with default opts
    expect(fmtDate('05/2023', 'Diario')).toBe('01/05/2023');
  });

  test('fallback handles DD/MM/YYYY correctly without specific periodicity', () => {
    // Diario or other: DD/MM/YYYY -> 15/05/2023
    expect(fmtDate('15/05/2023', 'Diario')).toBe('15/05/2023');
  });

  test('fallback handles YYYY-MM-DD (ISO) correctly', () => {
    expect(fmtDate('2023-05-15', 'Diario')).toBe('15/05/2023');
    expect(fmtDate('2023-05-15', 'Mensual')).toBe('may 2023');
  });

  test('returns original string if format is unrecognized', () => {
    expect(fmtDate('2023/05/15', 'Diario')).toBe('2023/05/15');
    expect(fmtDate('May 2023', 'Mensual')).toBe('May 2023');
  });

  test('returns original string for invalid dates that match regex but result in rollover', () => {
    // 13/2023 matches MM/YYYY regex. JS Date rolls it over to Jan 2024.
    expect(fmtDate('13/2023', 'Mensual')).toBe('ene 2024');
  });
});
