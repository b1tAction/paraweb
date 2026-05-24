/**
 * Score category color mapping for GameOver animation rendering.
 * Each category has a primary color used for floating labels, progress bars,
 * and score breakdown charts.
 */

export const SCORE_CATEGORY_COLORS: Record<string, string> = {
  mini_game: '#FFD700',    // Gold
  boss: '#FF4500',         // Orange-red
  item: '#32CD32',         // Lime green
  achievement: '#9370DB',  // Medium purple
};

/**
 * Faction color mapping for GameOver animation card backgrounds.
 */
export const FACTION_COLORS: Record<string, { primary: string; secondary: string }> = {
  qing_long: { primary: '#00CED1', secondary: '#00796B' },
  zhu_que:   { primary: '#E53935', secondary: '#B71C1C' },
  bai_hu:    { primary: '#FFFFFF', secondary: '#9E9E9E' },
  xuan_wu:   { primary: '#5C6BC0', secondary: '#283593' },
};

/**
 * Rank visual style mapping.
 */
export const RANK_STYLES: Record<number, { color: string; label: string; fontWeight: number }> = {
  1: { color: '#FFD700', label: '第1名', fontWeight: 800 },
  2: { color: '#C0C0C0', label: '第2名', fontWeight: 700 },
  3: { color: '#CD7F32', label: '第3名', fontWeight: 600 },
  4: { color: '#808080', label: '第4名', fontWeight: 500 },
};

/**
 * Get the color for a score category. Falls back to white.
 */
export function getScoreCategoryColor(category: string): string {
  return SCORE_CATEGORY_COLORS[category] ?? '#FFFFFF';
}

/**
 * Get faction colors for a faction string. Falls back to gray.
 */
export function getFactionColors(faction: string): { primary: string; secondary: string } {
  return FACTION_COLORS[faction] ?? { primary: '#9E9E9E', secondary: '#616161' };
}

/**
 * Get rank style for a rank position. Falls back to generic style.
 */
export function getRankStyle(rank: number): { color: string; label: string; fontWeight: number } {
  return RANK_STYLES[rank] ?? { color: '#808080', label: `第${rank}名`, fontWeight: 500 };
}