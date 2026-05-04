/**
 * Display name disambiguation utility.
 *
 * When multiple players in the same match share the same display_name,
 * append a short user_id suffix (e.g. "Alice#a3f2") for disambiguation.
 * When only one player uses that name, show it plainly (e.g. "Alice").
 */

export interface DisambiguationPlayer {
  displayName: string;
  userId: string;
}

/**
 * Generate a disambiguated display name.
 *
 * @param displayName - The player's chosen display name
 * @param userId      - The player's unique user/player ID
 * @param allPlayers  - All players in the current match/context
 * @returns Disambiguated name (with #suffix if duplicates exist)
 */
export function getDisambiguatedDisplayName(
  displayName: string,
  userId: string,
  allPlayers: DisambiguationPlayer[]
): string {
  const duplicates = allPlayers.filter(p => p.displayName === displayName);
  if (duplicates.length <= 1) {
    return displayName;
  }
  const shortId = userId.substring(0, 4);
  return `${displayName}#${shortId}`;
}