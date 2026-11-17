import type { GameIconName } from '@dffoogg/omnia-ui';
import type { Kind } from '@/lib/edit';

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
