export function normalizeDate(value?: string): string | undefined {
    if (!value) return undefined;
  
    if (/[zZ]$/.test(value) || /[+-]\d{2}:\d{2}$/.test(value)) {
      return value;
    }
  
    return `${value}Z`;
}