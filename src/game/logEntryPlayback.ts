import { useGameStore } from '../store/gameStore';
import type { DefinitionsConfig, LogEntry, Player } from '../types/protocol';
import { isBossPlayer } from './bossVisualConfig';
import { getEventEffectConfig } from './eventAnimations';

export const DICE_ROLL_MIN_MS = 1200;
export const DICE_RESULT_DISPLAY_MS = 1200;
export const DICE_UPGRADE_FLASH_MS = 720;
export const DICE_UPGRADE_RESULT_MS = 980;
export const DEFAULT_ACTION_ANIMATION_DELAY_MS = 2000;
export const FIRST_ITEM_DESCRIPTION_EXTRA_DELAY_MS = 1800;
export const FIRST_BUFF_DESCRIPTION_EXTRA_DELAY_MS = 1800;
export const MOVE_STEP_MS = 220;
export const PLAYER_STAT_MAX = 8;

// 用于前端展示的动作类型汉化映射表
const ACTION_TYPE_TRANSLATIONS: Record<string, string> = {
  damage: '受到伤害',
  heal: '获得治疗',
  fell_down: '跌落',
  death: '死亡',
  boss_damage: 'Boss 受到伤害',
  boss_attack: 'Boss 攻击',
  boss_skill: 'Boss 技能',
  modify_lp: 'LP 变动',
  move: '移动',
  teleport: '传送',
  respawn: '复活',
  add_buff: '获得 Buff',
  remove_buff: '失去 Buff',
  draw_event: '触发事件',
  draw_item: '获得道具',
  draw_buff: '获得 Buff',
  steal_buff: '窃取 Buff',
  add_item: '获得道具',
  remove_item: '失去道具',
  use_item: '使用道具',
  use_skill: '使用技能',
  dice_roll: '掷骰子',
  dice_upgrade: '升级骰子',
  state: '状态切换',
};

// Fallback dice names for pre-game contexts (matches backend dice definitions)
const FALLBACK_DICE_NAMES: Record<string, string> = {
  wood: '木骰子',
  copper: '铜骰子',
  silver: '银骰子',
  gold: '金骰子',
  normal: '普通骰子',
  dice: '骰子',
};

function translateDice(type?: string, definitions?: DefinitionsConfig | null): string {
  if (!type) return '骰子';
  const lower = type.toLowerCase();
  return definitions?.dice[lower]?.name || FALLBACK_DICE_NAMES[lower] || type;
}

export type DiceRollResult = {
  key: string;
  playerId: string;
  diceType: string;
  steps: number;
};

export type EffectDescriptor = {
  label: string;
  description?: string;
  color: number;
  textColor: string;
  iconEmoji?: string;
};

const ITEM_EFFECT_DESCRIPTIONS: Record<string, string> = {
  reverse_clock: '让目标玩家朝反方向移动',
  any_door: '传送至目标玩家所在的位置',
  dice_upgrade: '提升骰子的品质',
};

const BUFF_EFFECT_DESCRIPTIONS: Record<string, string> = {
  corrupt: '每 2 回合 HP -1，持续 4 回合',
  curse: 'LP -1，持续 3 回合',
  poison: '每回合触发恶性事件，持续 3 回合',
  lost: '下一回合反向移动',
  divine: 'LP +1，持续 3 回合',
  exorcism: '免疫毒瘴，持续 5 回合',
  rain: '每 2 回合 HP +1，持续 4 回合',
  hidden: '免疫任意事件与道具，持续 1 回合',
  fire: '每 3 回合 LP +1',
  thorns: '受伤后反弹 30% 伤害，持续 2 回合',
};

export function getItemEffectDescription(itemType: string) {
  return ITEM_EFFECT_DESCRIPTIONS[itemType] ?? '';
}

export function getBuffEffectDescription(buffType: string) {
  return BUFF_EFFECT_DESCRIPTIONS[buffType] ?? '';
}

function itemDescriptionSeenKey(scope: 'global' | 'self', itemType: string) {
  return `${scope}:${itemType}`;
}

function isSelfTarget(targetPlayerId: string) {
  const myPlayerId = useGameStore.getState().myPlayerId;
  return Boolean(myPlayerId && targetPlayerId === myPlayerId);
}

export function shouldShowFirstItemDescription(itemType: string, targetPlayerId: string) {
  if (!itemType || !getItemEffectDescription(itemType)) return false;
  const { seenItemDescriptionTypes } = useGameStore.getState();
  const scope = isSelfTarget(targetPlayerId) ? 'self' : 'global';
  return !seenItemDescriptionTypes.includes(itemDescriptionSeenKey(scope, itemType));
}

export function markItemDescriptionSeen(itemType: string, targetPlayerId: string) {
  if (!itemType) return;
  const isSelf = isSelfTarget(targetPlayerId);
  const keys = [itemDescriptionSeenKey(isSelf ? 'self' : 'global', itemType)];
  if (isSelf) keys.push(itemDescriptionSeenKey('global', itemType));
  keys.forEach((key) => {
    useGameStore.getState().markItemDescriptionSeen(key);
  });
}

export function shouldShowFirstBuffDescription(buffType: string, targetPlayerId: string) {
  if (!buffType || !getBuffEffectDescription(buffType) || !isSelfTarget(targetPlayerId)) return false;
  const { seenBuffDescriptionTypes } = useGameStore.getState();
  return !seenBuffDescriptionTypes.includes(buffType);
}

export function markBuffDescriptionSeen(buffType: string) {
  if (!buffType) return;
  useGameStore.getState().markBuffDescriptionSeen(buffType);
}

export function getMetadataNumber(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getMetadataString(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : '';
}
export function getMetadataBoolean(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  return false;
}

export function getMetadataNumberArray(metadata: Record<string, unknown> | undefined, key: string) {
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

export function clonePlayer(player: Player): Player {
  return {
    ...player,
    hp: normalizeHp(player),
    lp: normalizeLp(player),
    buffs: player.buffs.map((buff) => ({ ...buff })),
    items: player.items.map((item) => ({ ...item })),
  };
}

export function clampPlayerStat(value: number) {
  return Math.max(0, Math.min(PLAYER_STAT_MAX, value));
}

function clampBossStat(value: number) {
  return Math.max(0, value);
}

function normalizeHp(player: Player) {
  const maxHp = player.max_hp || PLAYER_STAT_MAX;
  return Math.max(0, Math.min(maxHp, player.hp));
}

function normalizeLp(player: Player) {
  return isBossPlayer(player) ? clampBossStat(player.lp) : clampPlayerStat(player.lp);
}

export function normalizePlayerStats(player: Player): Player {
  return {
    ...player,
    hp: normalizeHp(player),
    lp: normalizeLp(player),
  };
}

export function applyLogEntryToPlayer(player: Player, entry: LogEntry): Player {
  if (entry.target !== player.player_id) return player;

  const next = clonePlayer(player);
  const hpChange = getMetadataNumber(entry.metadata, 'hp_change') ?? 0;
  const lpChange = getMetadataNumber(entry.metadata, 'lp_change') ?? 0;
  const damage = getMetadataNumber(entry.metadata, 'damage') ?? 0;
  const bossRemainingHp = getMetadataNumber(entry.metadata, 'boss_remaining_hp');
  const buffType = getMetadataString(entry.metadata, 'buff_type');
  const buffDuration = getMetadataNumber(entry.metadata, 'duration');

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
    case 'death':
      next.is_dead = true;
      break;
    case 'boss_damage':
      next.hp = bossRemainingHp ?? next.hp - damage;
      break;
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
      // Filter hidden buffs from local display (backend BuildBuffs also filters them from StateSync)
      const definitions = useGameStore.getState().definitions;
      const buffDef = definitions?.buffs[buffType];
      if (buffDef?.is_hidden) break;
      const buffDisplayName = buffDef?.name || buffType;
      next.buffs = [
        ...next.buffs,
        {
          type: buffType,
          name: buffDisplayName,
          duration: buffDuration ?? 0,
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

  return normalizePlayerStats(next);
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

export function describeLogEntryEffect(entry: LogEntry, definitions?: DefinitionsConfig | null): EffectDescriptor {
  const num = (key: string) => getMetadataNumber(entry.metadata, key) ?? 0;
  const str = (key: string) => getMetadataString(entry.metadata, key);
  const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);

  // Helper: 从配置表里寻找官方名称
  const eventName = (type: string) => definitions?.events[type]?.name || type;
  const buffName = (type: string) => definitions?.buffs[type]?.name || type;
  const itemName = (type: string) => definitions?.items[type]?.name || type;

  switch (entry.action_type) {
    case 'damage':
    case 'fell_down':
      return { label: `HP ${signed(num('hp_change'))}`, color: 0xef5350, textColor: '#ffebee' };
    case 'death':
      return { label: '死亡', color: 0xb71c1c, textColor: '#ffebee' };
    case 'heal':
      return { label: `HP +${Math.abs(num('hp_change'))}`, color: 0x66bb6a, textColor: '#e8f5e9' };
    case 'modify_lp':
      return { label: `LP ${signed(num('lp_change'))}`, color: 0x42a5f5, textColor: '#e3f2fd' };
    case 'add_buff':
      return {
        label: `+${buffName(str('buff_type'))}`,
        description: shouldShowFirstBuffDescription(str('buff_type'), entry.target)
          ? getBuffEffectDescription(str('buff_type'))
          : undefined,
        color: 0x7e57c2,
        textColor: '#f3e5f5',
      };
    case 'remove_buff':
      return { label: `-${buffName(str('buff_type'))}`, color: 0xff7043, textColor: '#fff3e0' };
    case 'draw_event': {
      const eventType = str('event_type');
      const effect = getEventEffectConfig(eventType);
      return {
        label: eventName(eventType),
        color: effect.color,
        textColor: effect.textColor,
        iconEmoji: effect.iconEmoji,
      };
    }
    case 'draw_item': {
      const itemType = str('item_type');
      return {
        label: `获得道具「${itemName(itemType)}」`,
        description: shouldShowFirstItemDescription(itemType, entry.target) ? getItemEffectDescription(itemType) : undefined,
        color: 0xffca28,
        textColor: '#fffde7',
      };
    }
    case 'draw_buff': {
      const buffType = str('buff_type');
      return { label: `获得「${buffName(buffType)}」Buff`, color: 0x7e57c2, textColor: '#f3e5f5' };
    }
    case 'steal_buff': {
      const buffType = str('buff_type');
      return { label: `窃取 ${buffName(buffType)}`, color: 0x8e24aa, textColor: '#f3e5f5' };
    }
    case 'move':
      return { label: `移动 ${num('steps')}步`, color: 0xffa726, textColor: '#fff8e1' };
    case 'dice_roll': {
      const diceType = translateDice(str('dice_type'), definitions);
      return { label: `${diceType} ${num('dice_steps')}点`, color: 0xffffff, textColor: '#ffffff' };
    }
    case 'dice_upgrade': {
      const fromDice = translateDice(str('from_dice'), definitions);
      const toDice = translateDice(str('to_dice'), definitions);
      return { label: `${fromDice} -> ${toDice}`, color: 0xfff176, textColor: '#fffde7' };
    }
    case 'respawn':
      return { label: '复活', color: 0x4fc3f7, textColor: '#e1f5fe' };
    case 'boss_damage':
      return { label: `Boss -${num('damage')} HP`, color: 0xef5350, textColor: '#ffebee' };
    case 'boss_attack': {
      const attackType = str('attack_type');
      return {
        label: attackType ? `Boss ${attackType}` : 'Boss 攻击',
        color: 0xd32f2f,
        textColor: '#ffebee',
      };
    }
    case 'boss_skill': {
      const skillType = str('skill_type');
      return {
        label: skillType ? `Boss技能 ${skillType}` : 'Boss 技能',
        color: 0xc2185b,
        textColor: '#fce4ec',
      };
    }
    case 'teleport':
      return { label: `传送 ${num('from_pos')} -> ${num('to_pos')}`, color: 0x29b6f6, textColor: '#e1f5fe' };
    case 'use_item':
      return { label: `使用 ${itemName(str('item_type'))}`, color: 0xffca28, textColor: '#fffde7' };
    case 'use_skill': {
      const rawSkill = str('skill_type');
      // Try both formats: backend uses "qing_long", old format was "qinglong"
      const factionDef = definitions?.factions[rawSkill] || definitions?.factions[rawSkill?.replace(/_/g, '')];
      const skillName = factionDef?.skill_name || factionDef?.name || rawSkill || '';
      return { label: `技能 ${skillName}`.trim(), color: 0xab47bc, textColor: '#f3e5f5' };
    }
    default: {
      const rawType = entry.action_type || entry.type;
      const translatedType = ACTION_TYPE_TRANSLATIONS[rawType] || rawType;
      return { label: translatedType, color: 0xffffff, textColor: '#ffffff' };
    }
  }
}

export function describeSettlementChange(
  player: Player,
  entry?: LogEntry | null,
  definitions?: DefinitionsConfig | null,
): EffectDescriptor | null {
  if (!entry || entry.target !== player.player_id) return null;

  const num = (key: string) => getMetadataNumber(entry.metadata, key) ?? 0;
  const str = (key: string) => getMetadataString(entry.metadata, key);
  const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);
  const reason = formatChangeReason(entry, definitions);

  const buffName = (type: string) => definitions?.buffs[type]?.name || type;

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
        label: `+${buffName(str('buff_type'))}  ·  原因：${reason}`,
        color: 0x7e57c2,
        textColor: '#f3e5f5',
      };
    case 'remove_buff':
      return {
        label: `-${buffName(str('buff_type'))}  ·  原因：${reason}`,
        color: 0xff7043,
        textColor: '#fff3e0',
      };
    default:
      return null;
  }
}

export function formatChangeReason(entry: LogEntry, definitions?: DefinitionsConfig | null) {
  const source = entry.source || entry.action_type || '系统';

  // 常见游戏格类型和系统级标识符
  const labels: Record<string, string> = {
    Buff_Expiry: 'Buff 到期',
    TurnEndRespawn: '回合结束复活',
    FragileCell: '脆弱格',
    DiceRollFellDown: '移动跌落',
    system_turn_end_respawn: '回合结束复活',
    system_boss_attack_respawn: 'Boss 攻击复活',
    system_boss_skill_respawn: 'Boss 技能复活',
    system_checkpoint_treasure: '检查点宝箱',
    system_dice_roll_checkpoint: '经过检查点',
    system_dice_roll_fell_down: '移动跌落',
    fragile_cell: '脆弱格',
    death_respawn: '死亡复活',
    system: '系统',
    System: '系统',
    normal: '普通格',
    fragile: '脆弱格',
    fog: '迷雾格',
    checkpoint: '复活点',
    boss: 'Boss格',
    event: '事件格',
  };

  if (labels[source]) return labels[source];

  // 补充翻译，防止源为 "damage", "fell_down" 时显示原始英文
  if (ACTION_TYPE_TRANSLATIONS[source]) return ACTION_TYPE_TRANSLATIONS[source];

  if (source.startsWith('Buff_')) {
    const buffType = source.replace(/^Buff_/, '').toLowerCase();
    return definitions?.buffs[buffType]?.name || source.replace(/^Buff_/, 'Buff ');
  }
  if (source.startsWith('Event_')) {
    const eventType = source.replace(/^Event_/, '').toLowerCase();
    return definitions?.events[eventType]?.name || source.replace(/^Event_/, '事件 ');
  }
  if (source.startsWith('Item_')) {
    const itemType = source.replace(/^Item_/, '').toLowerCase();
    return definitions?.items[itemType]?.name || source.replace(/^Item_/, '道具 ');
  }
  if (source.startsWith('Cell')) {
    return source.replace(/^Cell/, '格子 ');
  }

  return source;
}
