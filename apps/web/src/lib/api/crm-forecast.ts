export function formatMoney(value: number | string, currency: string, locale = 'en'): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n || 0);
  } catch {
    return `${Math.round(n || 0)} ${currency}`;
  }
}

export function columnTotal(deals: Array<{ value: number | string }>): number {
  return deals.reduce((s, d) => s + (typeof d.value === 'string' ? parseFloat(d.value) : d.value || 0), 0);
}
