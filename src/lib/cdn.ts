/** The dff-oo/cdn site, the same default and override Omnia's GAME_CDN_URL uses. */
const CDN_URL = process.env.NEXT_PUBLIC_DFFOO_CDN ?? 'https://dff-oo.github.io/cdn';

/** URL of a file in the CDN, such as `maps/001.png` or `characters/8.png`. */
export function cdnSrc(path: string): string {
  return `${CDN_URL}/${path}`;
}
