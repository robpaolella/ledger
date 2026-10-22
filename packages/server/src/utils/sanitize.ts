/** Strip HTML tags and trim whitespace from a single string. */
export function sanitizeString(val: string): string {
  return val.replace(/<[^>]*>/g, '').trim();
}

/** Strip HTML tags and trim whitespace from string values in an object. */
export function sanitize<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    const val = result[key];
    if (typeof val === 'string') {
      (result as Record<string, unknown>)[key] = sanitizeString(val);
    }
  }
  return result;
}
