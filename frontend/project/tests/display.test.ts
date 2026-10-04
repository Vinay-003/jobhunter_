import { describe, expect, test } from 'bun:test';
import { displayValue } from '../src/lib/display';

describe('displayValue', () => {
  test('formats object salaries without dropping raw text or zeroes', () => {
    expect(displayValue({ raw: '₹0–100' })).toBe('₹0–100');
    expect(displayValue({ min: 0, max: 100, currency: 'INR' })).toBe('0–100 INR');
  });
});
