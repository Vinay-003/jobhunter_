export function safeText(value?: string): string {
  if (!value) return '';
  return value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

export function displayValue(value: unknown): string {
  if (typeof value === 'string') return safeText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.raw === 'string') return safeText(record.raw);
    if (typeof record.min === 'number' || typeof record.max === 'number') {
      const parts = [record.min !== undefined ? String(record.min) : '', record.max !== undefined ? String(record.max) : ''].filter(Boolean);
      return `${parts.join('–')}${record.currency ? ` ${displayValue(record.currency)}` : ''}`;
    }
    try { return safeText(JSON.stringify(value)); } catch { return ''; }
  }
  return '';
}
