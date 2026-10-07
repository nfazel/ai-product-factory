export function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseDay(value: string | undefined, endOfDay: boolean) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
}
