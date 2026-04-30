/**
 * DebugLogEntry - Debug log entry display component
 *
 * Formats a single LogEntry for the debug log panel, following the same
 * format conventions as the CLI displayLogEntry (internal/cli/player/cli_ui.go).
 * Only displays entries with type === 'action'.
 */

import React from 'react';
import type { LogEntry, Player } from '../types/protocol';

// Metadata helpers (consistent with BoardScene.tsx)
function getMetaNum(meta: Record<string, any> | undefined, key: string): number | null {
  const value = meta?.[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getMetaStr(meta: Record<string, any> | undefined, key: string): string {
  const value = meta?.[key];
  return typeof value === 'string' ? value : '';
}

function getMetaBool(meta: Record<string, any> | undefined, key: string): boolean {
  const value = meta?.[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  return false;
}

function formatDuration(duration: number): string {
  return duration < 0 ? '永久' : `${duration}`;
}

// Resolve display name from player list
function resolveDisplayName(target: string, players: Player[]): string {
  if (target === 'beeeeeef-beef-beef-beef-beeeeeeeeeef') return 'Boss';
  for (const p of players) {
    if (p.player_id === target) {
      return p.display_name || p.player_id;
    }
  }
  return target;
}

function resolveBuffDuration(targetPlayerId: string, buffType: string, players: Player[]): number | null {
  if (!targetPlayerId || !buffType) return null;
  const player = players.find((p) => p.player_id === targetPlayerId);
  if (!player) return null;
  const buff = player.buffs.find((b) => b.type === buffType);
  return typeof buff?.duration === 'number' ? buff.duration : null;
}

// Format a single entry as a string (mirrors CLI displayLogEntry)
function formatEntry(entry: LogEntry, players: Player[]): string {
  const targetName = resolveDisplayName(entry.target, players);
  const sourceName = resolveDisplayName(entry.source, players);
  const meta = entry.metadata || {};

  switch (entry.action_type) {
    case 'damage': {
      const hpChange = getMetaNum(meta, 'hp_change') ?? 0;
      const blockedBy = getMetaStr(meta, 'blocked_by');
      const piercing = getMetaBool(meta, 'piercing');
      let extra = '';
      if (blockedBy) extra += ` [blocked by ${blockedBy}]`;
      if (piercing) extra += ' [piercing]';
      return `[damage] ${targetName} HP${hpChange} from ${sourceName}${extra}`;
    }
    case 'heal': {
      const hpChange = getMetaNum(meta, 'hp_change') ?? 0;
      return `[heal] ${targetName} HP+${hpChange} from ${sourceName}`;
    }
    case 'modify_lp': {
      const lpChange = getMetaNum(meta, 'lp_change') ?? 0;
      const sign = lpChange >= 0 ? '+' : '';
      return `[modify_lp] ${targetName} LP${sign}${lpChange} from ${sourceName}`;
    }
    case 'move': {
      const steps = getMetaNum(meta, 'steps') ?? 0;
      const startPos = getMetaNum(meta, 'start_pos') ?? 0;
      const endPos = getMetaNum(meta, 'end_pos') ?? 0;
      return `[move] ${targetName} ${steps} steps (${startPos} -> ${endPos}) from ${sourceName}`;
    }
    case 'add_buff': {
      const buffType = getMetaStr(meta, 'buff_type');
      const duration = resolveBuffDuration(entry.target, buffType, players);
      const durationText = duration !== null ? formatDuration(duration) : '?';
      return `[add_buff] ${targetName} gained ${buffType} (${durationText}) from ${sourceName}`;
    }
    case 'remove_buff': {
      const buffType = getMetaStr(meta, 'buff_type');
      return `[remove_buff] ${targetName} lost ${buffType} from ${sourceName}`;
    }
    case 'draw_event': {
      const eventType = getMetaStr(meta, 'event_type');
      return `[draw_event] ${targetName} drew event ${eventType}`;
    }
    case 'draw_item': {
      const itemType = getMetaStr(meta, 'item_type');
      return `[draw_item] ${targetName} drew item ${itemType}`;
    }
    case 'dice_roll': {
      const diceType = getMetaStr(meta, 'dice_type');
      const diceSteps = getMetaNum(meta, 'dice_steps') ?? 0;
      return `[dice_roll] ${targetName} rolled ${diceType} dice: ${diceSteps} steps`;
    }
    case 'fell_down': {
      const position = getMetaNum(meta, 'position') ?? 0;
      const hpChange = getMetaNum(meta, 'hp_change') ?? 0;
      return `[fell_down] ${targetName} fell at pos ${position} HP${hpChange} from ${sourceName}`;
    }
    case 'respawn': {
      const checkpointPos = getMetaNum(meta, 'checkpoint_pos') ?? 0;
      return `[respawn] ${targetName} respawn at pos ${checkpointPos} from ${sourceName}`;
    }
    case 'boss_damage': {
      const damage = getMetaNum(meta, 'damage') ?? 0;
      const isCrit = getMetaBool(meta, 'is_crit');
      const bossHP = getMetaNum(meta, 'boss_remaining_hp') ?? 0;
      const critMark = isCrit ? ' [CRIT!]' : '';
      return `[boss_damage] Boss HP-${damage}${critMark} (remaining: ${bossHP}) by ${sourceName}`;
    }
    case 'boss_attack': {
      const attackType = getMetaStr(meta, 'attack_type');
      const damage = getMetaNum(meta, 'damage') ?? 0;
      return `[boss_attack] Boss attacked ${targetName} (${attackType}) HP-${damage}`;
    }
    case 'boss_skill': {
      const skillType = getMetaStr(meta, 'skill_type');
      const targetsRaw = getMetaStr(meta, 'targets');
      const targets = targetsRaw
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .map((id) => resolveDisplayName(id, players))
        .join(', ');
      return `[boss_skill] Boss used ${skillType} on ${targets}`;
    }
    case 'teleport': {
      const fromPos = getMetaNum(meta, 'from_pos') ?? 0;
      const toPos = getMetaNum(meta, 'to_pos') ?? 0;
      return `[teleport] ${targetName} ${fromPos} -> ${toPos} from ${sourceName}`;
    }
    case 'steal_buff': {
      const stolenByName = resolveDisplayName(getMetaStr(meta, 'stolen_by'), players);
      const buffType = getMetaStr(meta, 'buff_type');
      return `[steal_buff] ${targetName} stolen ${buffType} by ${stolenByName}`;
    }
    case 'use_item': {
      const itemType = getMetaStr(meta, 'item_type');
      return `[use_item] ${targetName} used ${itemType} from ${sourceName}`;
    }
    case 'use_skill': {
      const skillType = getMetaStr(meta, 'skill_type');
      return `[use_skill] ${targetName} used ${skillType} from ${sourceName}`;
    }
    default: {
      const typeStr = entry.action_type || entry.type;
      return `[${typeStr}] ${targetName} from ${sourceName}`;
    }
  }
}

// Color coding based on action type
function getEntryColor(actionType: string): string {
  const damageTypes = ['damage', 'fell_down', 'boss_attack', 'boss_skill'];
  const healTypes = ['heal'];
  const buffTypes = ['add_buff'];
  const debuffTypes = ['remove_buff', 'steal_buff'];
  const moveTypes = ['move', 'teleport', 'dice_roll'];
  const drawTypes = ['draw_event', 'draw_item'];

  if (damageTypes.includes(actionType)) return '#ef5350';
  if (healTypes.includes(actionType)) return '#66bb6a';
  if (buffTypes.includes(actionType)) return '#42a5f5';
  if (debuffTypes.includes(actionType)) return '#ab47bc';
  if (moveTypes.includes(actionType)) return '#ffa726';
  if (drawTypes.includes(actionType)) return '#78909c';
  return '#b0bec5';
}

interface DebugLogEntryProps {
  entry: LogEntry;
  players: Player[];
}

export const DebugLogEntry: React.FC<DebugLogEntryProps> = ({ entry, players }) => {
  const text = formatEntry(entry, players);
  const color = getEntryColor(entry.action_type);

  return (
    <div
      style={{
        padding: '3px 6px',
        fontSize: '11px',
        lineHeight: 1.4,
        color: color,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {text}
    </div>
  );
};

export default DebugLogEntry;
