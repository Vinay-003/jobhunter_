const countries: Record<string, string[]> = {
  india: ['india'], 'united states': ['united states', 'usa', 'us'], canada: ['canada', 'ca'],
  germany: ['germany', 'de'], 'united kingdom': ['united kingdom', 'uk', 'great britain'], australia: ['australia', 'au'],
};
const usStates = /,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV)\b/i;
const canadianProvinces = /,\s*(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)\b/i;
const cities: Record<string, RegExp> = { india: /\b(?:delhi|mumbai|bengaluru|bangalore|hyderabad|pune|chennai|kolkata|noida|gurugram|gurgaon)\b/i, canada: /\b(?:toronto|vancouver|montreal|ottawa|calgary)\b/i, germany: /\b(?:hamburg|berlin|munich|münchen|frankfurt)\b/i };
export const normalizePlace = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function inferCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const explicit = Object.entries(countries).find(([, aliases]) => aliases.some(a => a.length > 2 && new RegExp(`\\b${a}\\b`, 'i').test(value)));
  if (explicit) return explicit[0];
  if (usStates.test(value)) return 'united states';
  if (canadianProvinces.test(value)) return 'canada';
  return Object.entries(cities).find(([, re]) => re.test(value))?.[0] ?? null;
}
export const countryAliases = countries;
