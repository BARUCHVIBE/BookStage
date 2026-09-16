// Only these opaque, explicitly public upload routes may be used as relative URLs.
export function publicImageUrl(value: string | null | undefined) {
  if (!value) return null;
  if (/^\/api\/public\/(artist-assets|branding-assets)\/[a-f0-9-]{36}$/i.test(value)) return value;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}
