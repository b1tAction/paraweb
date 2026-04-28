import type { LogEntry, Player } from '../types/protocol';
import { getEventEffectConfig } from './eventAnimations';

export const DICE_ROLL_MIN_MS = 600;
export const DICE_RESULT_DISPLAY_MS = 1200;
export const DEFAULT_ACTION_ANIMATION_DELAY_MS = 2000;
export const MOVE_STEP_MS = 220;

export type DiceRollResult = {
  key: string;
  playerId: string;
  diceType: string;
  steps: number;
};

export type EffectDescriptor = {
  label: string;
  color: number;
  textColor: string;
};

export function getMetadataNumber(metadata: Record<string, any> | undefined, key: string) {
  const value = metadata?.[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getMetadataString(metadata: Record<string, any> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : '';
}

export function getMetadataNumberArray(metadata: Record<string, any> | undefined, key: string) {
  const value = metadata?.[key];
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === 'number') return item;
      if (typeof item === 'string') {
        const parsed = Number(item);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    })
    .filter((item): item is number => item !== null);
}

export function getLogEntryAnimationDelay(entry: LogEntry) {
  if (entry.type !== 'action' && entry.type !== 'boss') return 0;

  if (entry.action_type === 'dice_roll') {
    return DICE_ROLL_MIN_MS + DICE_RESULT_DISPLAY_MS;
  }

  if (entry.action_type === 'move') {
    const path = getMetadataNumberArray(entry.metadata, 'path');
    return Math.max(700, Math.min(3200, Math.max(1, path.length - 1) * MOVE_STEP_MS + 250));
  }

  return DEFAULT_ACTION_ANIMATION_DELAY_MS;
}

export function clonePlayer(player: Player): Player {
  return {
    ...player,
    buffs: player.buffs.map((buff) => ({ ...buff })),
    items: player.items.map((item) => ({ ...item })),
  };
}

export function applyLogEntryToPlayer(player: Player, entry: LogEntry): Player {
  if (entry.target !== player.player_id) return player;

  const next = clonePlayer(player);
  const hpChange = getMetadataNumber(entry.metadata, 'hp_change') ?? 0;
  const lpChange = getMetadataNumber(entry.metadata, 'lp_change') ?? 0;
  const buffType = getMetadataString(entry.metadata, 'buff_type');

  switch (entry.action_type) {
    case 'damage':
    case 'heal':
      next.hp += hpChange;
      break;
    case 'fell_down': {
      next.hp += hpChange;
      const fellPosition = getMetadataNumber(entry.metadata, 'position');
      if (fellPosition !== null) {
        next.position = fellPosition;
      }
      break;
    }
    case 'modify_lp':
      next.lp += lpChange;
      break;
    case 'move': {
      const endPos = getMetadataNumber(entry.metadata, 'end_pos');
      if (endPos !== null) {
        next.position = endPos;
      }
      break;
    }
    case 'teleport': {
      const toPos = getMetadataNumber(entry.metadata, 'to_pos');
      if (toPos !== null) {
        next.position = toPos;
      }
      break;
    }
    case 'respawn': {
      const checkpointPos = getMetadataNumber(entry.metadata, 'checkpoint_pos');
      if (checkpointPos !== null) {
        next.position = checkpointPos;
      }
      next.is_dead = false;
      break;
    }
    case 'add_buff': {
      if (!buffType || next.buffs.some((buff) => buff.type === buffType)) break;
      next.buffs = [
        ...next.buffs,
        {
          type: buffType,
          name: buffType,
          duration: getMetadataNumber(entry.metadata, 'duration') ?? 0,
        },
      ];
      break;
    }
    case 'remove_buff':
      if (buffType) {
        next.buffs = next.buffs.filter((buff) => buff.type !== buffType);
      }
      break;
    default:
      break;
  }

  return next;
}

export function getLatestDiceRollResult(entries: LogEntry[]): DiceRollResult | null {
  if (!entries || entries.length === 0) return null;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.action_type !== 'dice_roll') continue;

    const steps = getMetadataNumber(entry.metadata, 'dice_steps');
    if (!steps) continue;

    return {
      key: `${entry.timestamp}:${entry.target}:${steps}`,
      playerId: entry.target,
      diceType: getMetadataString(entry.metadata, 'dice_type') || 'wood',
      steps,
    };
  }

  return null;
}

export function describeLogEntryEffect(entry: LogEntry): EffectDescriptor {
  const num = (key: string) => getMetadataNumber(entry.metadata, key) ?? 0;
  const str = (key: string) => getMetadataString(entry.metadata, key);
  const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);

  switch (entry.action_type) {
    case 'damage':
    case 'fell_down':
      return { label: `HP ${signed(num('hp_change'))}`, color: 0xef5350, textColor: '#ffebee' };
    case 'heal':
      return { label: `HP +${Math.abs(num('hp_change'))}`, color: 0x66bb6a, textColor: '#e8f5e9' };
    case 'modify_lp':
      return { label: `LP ${signed(num('lp_change'))}`, color: 0x42a5f5, textColor: '#e3f2fd' };
    case 'add_buff':
      return { label: `+${str('buff_type') || 'Buff'}`, color: 0x7e57c2, textColor: '#f3e5f5' };
    case 'remove_buff':
      return { label: `-${str('buff_type') || 'Buff'}`, color: 0xff7043, textColor: '#fff3e0' };
    case 'draw_event': {
      const eventType = str('event_type');
      const effect = getEventEffectConfig(eventType);
      return { label: effect.label, color: effect.color, textColor: effect.textColor };
    }
    case 'draw_item':
      return { label: `道具 ${str('item_type') || ''}`, color: 0xffca28, textColor: '#fffde7' };
    case 'move':
      return { label: `移动 ${num('steps')}`, color: 0xffa726, textColor: '#fff8e1' };
    case 'dice_roll':
      return { label: `${str('dice_type') || 'dice'} ${num('dice_steps')}`, color: 0xffffff, textColor: '#ffffff' };
    case 'respawn':
      return { label: '复活', color: 0x4fc3f7, textColor: '#e1f5fe' };
    case 'boss_damage':
      return { label: `Boss -${num('damage')}`, color: 0xef5350, textColor: '#ffebee' };
    case 'boss_attack':
      return { label: `HP -${num('damage')}`, color: 0xd32f2f, textColor: '#ffebee' };
    case 'teleport':
      return { label: `${num('from_pos')} -> ${num('to_pos')}`, color: 0x29b6f6, textColor: '#e1f5fe' };
    case 'use_item':
      return { label: `使用 ${str('item_type') || '道具'}`, color: 0xffca28, textColor: '#fffde7' };
    case 'use_skill':
      return { label: `技能 ${str('skill_type') || ''}`, color: 0xab47bc, textColor: '#f3e5f5' };
    default:
      return { label: entry.action_type || entry.type, color: 0xffffff, textColor: '#ffffff' };
  }
}

export function describeSettlementChange(player: Player, entry?: LogEntry | null): EffectDescriptor | null {
  if (!entry || entry.target !== player.player_id) return null;

  const num = (key: string) => getMetadataNumber(entry.metadata, key) ?? 0;
  const str = (key: string) => getMetadataString(entry.metadata, key);
  const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);
  const reason = formatChangeReason(entry);

  switch (entry.action_type) {
    case 'damage':
    case 'fell_down': {
      const hpChange = num('hp_change');
      return {
        label: `HP ${signed(hpChange)}  ·  原因：${reason}`,
        color: 0xef5350,
        textColor: '#ffebee',
      };
    }
    case 'heal': {
      const hpChange = Math.abs(num('hp_change'));
      return {
        label: `HP +${hpChange}  ·  原因：${reason}`,
        color: 0x66bb6a,
        textColor: '#e8f5e9',
      };
    }
    case 'modify_lp': {
      const lpChange = num('lp_change');
      return {
        label: `LP ${signed(lpChange)}  ·  原因：${reason}`,
        color: lpChange >= 0 ? 0x42a5f5 : 0xef5350,
        textColor: lpChange >= 0 ? '#e3f2fd' : '#ffebee',
      };
    }
    case 'add_buff':
      return {
        label: `Buff +${str('buff_type') || '未知'}  ·  原因：${reason}`,
        color: 0x7e57c2,
        textColor: '#f3e5f5',
      };
    case 'remove_buff':
      return {
        label: `Buff -${str('buff_type') || '未知'}  ·  原因：${reason}`,
        color: 0xff7043,
        textColor: '#fff3e0',
      };
    default:
      return null;
  }
}

export function formatChangeReason(entry: LogEntry) {
  const source = entry.source || entry.action_type || '系统';
  const labels: Record<string, string> = {
    Buff_Expiry: 'Buff 到期',
    TurnEndRespawn: '回合结束复活',
    FragileCell: '脆弱格',
    DiceRollFellDown: '移动跌落',
  };

  if (labels[source]) return labels[source];
  if (source.startsWith('Buff_')) return source.replace(/^Buff_/, 'Buff ');
  if (source.startsWith('Event_')) return source.replace(/^Event_/, '事件 ');
  if (source.startsWith('Item_')) return source.replace(/^Item_/, '道具 ');
  if (source.startsWith('Cell')) return source.replace(/^Cell/, '格子 ');

  return source;
}
