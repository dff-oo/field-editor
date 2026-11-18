import type { GameIconName } from '@dffoogg/omnia-ui';
import { cdnSrc } from '@/lib/cdn';
import type { Kind } from '@/lib/edit';
import type { FieldSiteFile } from '@/lib/field/schema';

/** `gate` joins GameIconName when Omnia publishes it. The sprite is still icons/gate.png. */
const GATE_ICON = 'gate' as GameIconName;

/** The map marker for a site kind; battles show the plain silver helmet. */
export function kindIcon(kind: Kind): GameIconName {
  if (kind === 'gate') return GATE_ICON;
  return kind === 'battle' ? 'helmet-silver' : kind;
}

/** The helmet the game draws for a battle. The two flags are exclusive; the checker reports a battle with both. */
export function battleHelmet(site: { strong_enemy?: boolean; side_quest?: boolean }): GameIconName {
  if (site.strong_enemy) return 'helmet-gold';
  if (site.side_quest) return 'helmet-green';
  return 'helmet-silver';
}

/** URL of a character's head in the CDN. `imageId` is the character's `image_id` in @dffoogg/resources. */
export function characterImageSrc(imageId: number): string {
  return cdnSrc(`characters/${imageId}.png`);
}

/** The sprite drawn on a site's hex. Move strips span several hexes and keep their step numbers instead. */
export function siteIcon(site: FieldSiteFile): GameIconName | null {
  if (site.kind === 'battle') return battleHelmet(site);
  if (site.kind === 'gate') return GATE_ICON;
  if (site.kind === 'cutscene' || site.kind === 'treasure') return site.kind;
  return null;
}
