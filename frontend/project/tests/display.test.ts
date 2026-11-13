import { describe, expect, test } from 'bun:test';
import { displayValue, evictionNotice, formatMetricValue } from '../src/lib/display';

describe('displayValue', () => {
  test('formats object salaries without dropping raw text or zeroes', () => {
    expect(displayValue({ raw: '₹0–100' })).toBe('₹0–100');
    expect(displayValue({ min: 0, max: 100, currency: 'INR' })).toBe('0–100 INR');
  });
});

describe('formatMetricValue', () => {
  test('renders boolean contact signals as recorded Yes/No values', () => {
    expect(formatMetricValue(true)).toBe('Yes');
    expect(formatMetricValue(false)).toBe('No');
    expect(formatMetricValue(undefined)).toBe('Not recorded');
  });
});

describe('evictionNotice', () => {
  test('stays silent when no resume was evicted', () => {
    expect(evictionNotice(0)).toBe('');
  });

  test('tells the user their oldest resume was deleted', () => {
    expect(evictionNotice(1)).toContain('your oldest resume was deleted');
    expect(evictionNotice(1)).toContain('3 resumes');
  });

  test('counts multiple evicted resumes', () => {
    expect(evictionNotice(2)).toContain('2 older resumes were deleted');
  });
});
