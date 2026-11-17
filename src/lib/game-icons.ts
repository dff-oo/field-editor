import type { GameIconName } from '@dffoogg/omnia-ui';
import type { Kind } from '@/lib/edit';
import type { FieldSiteFile } from '@/lib/field/schema';

/** The map marker for a site kind; battles show the plain silver helmet. */
export function kindIcon(kind: Kind): GameIconName {
  return kind === 'battle' ? 'helmet-silver' : kind;
}

/** The helmet the game draws for a battle. The two flags are exclusive; the checker reports a battle with both. */
export function battleHelmet(site: { strong_enemy?: boolean; side_quest?: boolean }): GameIconName {
  if (site.strong_enemy) return 'helmet-gold';
  if (site.side_quest) return 'helmet-green';
  return 'helmet-silver';
}

/** URL of a character's head, copied from @dffoogg/resources by scripts/copy-character-images.ts. */
export function characterImageSrc(imageId: number): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/characters/${imageId}.png`;
}

/** The sprite drawn on a site's hex. Move strips span several hexes and keep their step numbers instead. */
export function siteIcon(site: FieldSiteFile): GameIconName | null {
  if (site.kind === 'battle') return battleHelmet(site);
  if (site.kind === 'cutscene' || site.kind === 'treasure') return site.kind;
  return null;
}
