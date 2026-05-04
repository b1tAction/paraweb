/**
 * Nakama 客户端初始化
 *
 * 导出 nakama-js 的类型和 Client 类
 */

export { Client } from '@heroiclabs/nakama-js';
export type { Session, Socket, Match, MatchData, Presence } from '@heroiclabs/nakama-js';

/**
 * RoomLabel - parsed match label JSON structure
 *
 * The label is stored as a JSON string in the match metadata.
 * When the backend enriches labels, this structure will include
 * host display name and match status.
 */
export interface RoomLabel {
  max_players: number;
  game: string;
  status?: string;
  host_display_name?: string;
}

/**
 * Parse a match label string into a RoomLabel object.
 * Returns null if the label is empty or invalid JSON.
 */
export function parseRoomLabel(label: string | undefined): RoomLabel | null {
  if (!label) return null;
  try {
    return JSON.parse(label) as RoomLabel;
  } catch {
    return null;
  }
}
