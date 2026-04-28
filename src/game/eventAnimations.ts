import type { LogEntry } from '../types/protocol';
import { getMetadataString } from './logEntryPlayback';

export type EventAnimationType =
  | 'heal_pop'      // 绿色弹出治疗效果
  | 'damage_flash'  // 红色闪烁伤害效果
  | 'buff_glow'     // 金色发光增益效果
  | 'debuff_spin'   // 紫色旋转减益效果
  | 'item_sparkle'  // 金色闪烁道具效果
  | 'teleport_swap' // 蓝色交换传送效果
  | 'curse_cloud'   // 黑色诅咒云雾效果
  | 'lightning_strike' // 黄色雷击效果
  | 'ghost_attack'  // 灰色幽灵攻击效果
  | 'steal_flash'   // 橙色偷窃闪烁效果
  | 'neutral_pulse'; // 白色中性脉冲效果

export type EventEffectConfig = {
  label: string;
  color: number;
  textColor: string;
  animationType: EventAnimationType;
  iconEmoji?: string;
  particleCount?: number;
  duration?: number;
};

// 事件类型到动画效果的映射
export const EVENT_TYPE_EFFECTS: Record<string, EventEffectConfig> = {
  // 🥰 良性事件
  'herb': {
    label: '采集到草药',
    color: 0x66bb6a,
    textColor: '#e8f5e9',
    animationType: 'heal_pop',
    iconEmoji: '🌿',
    particleCount: 8,
    duration: 2500
  },
  'milk_tea': {
    label: '捡到奶茶，一口就吃到了猪猪欸',
    color: 0xffca28,
    textColor: '#fffde7',
    animationType: 'heal_pop',
    iconEmoji: '🧋',
    particleCount: 6,
    duration: 2500
  },
  'relic': {
    label: '捡到勇士的圣遗物',
    color: 0xffd700,
    textColor: '#fff9c4',
    animationType: 'item_sparkle',
    iconEmoji: '⚔️',
    particleCount: 12,
    duration: 2500
  },
  'divine_bless': {
    label: '受到天使眷顾',
    color: 0x42a5f5,
    textColor: '#e3f2fd',
    animationType: 'buff_glow',
    iconEmoji: '😇',
    particleCount: 15,
    duration: 2500
  },

  // 🫥 中性事件
  'hidden_buff': {
    label: '麻了',
    color: 0x757575,
    textColor: '#f5f5f5',
    animationType: 'neutral_pulse',
    iconEmoji: '😵',
    particleCount: 4,
    duration: 2500
  },
  'exchange': {
    label: '位置交换',
    color: 0x29b6f6,
    textColor: '#e1f5fe',
    animationType: 'teleport_swap',
    iconEmoji: '🔄',
    particleCount: 10,
    duration: 2500
  },
  'taste_test': {
    label: '这是什么？尝一口',
    color: 0x8d6e63,
    textColor: '#efebe9',
    animationType: 'neutral_pulse',
    iconEmoji: '🥤',
    particleCount: 5,
    duration: 2500
  },

  // 🤮 恶性事件
  'mosquito': {
    label: '被蚊虫叮咬',
    color: 0xef5350,
    textColor: '#ffebee',
    animationType: 'damage_flash',
    iconEmoji: '🐛',
    particleCount: 3,
    duration: 2500
  },
  'ghost_hit': {
    label: '偶遇孤魂野鬼',
    color: 0x616161,
    textColor: '#f5f5f5',
    animationType: 'ghost_attack',
    iconEmoji: '👻',
    particleCount: 7,
    duration: 2500
  },
  'dog_poop': {
    label: '踩到了狗屎',
    color: 0x8d6e63,
    textColor: '#efebe9',
    animationType: 'damage_flash',
    iconEmoji: '💩',
    particleCount: 2,
    duration: 2500
  },
  'thief': {
    label: '啊？！贼',
    color: 0xff7043,
    textColor: '#fff3e0',
    animationType: 'steal_flash',
    iconEmoji: '🦹',
    particleCount: 6,
    duration: 2500
  },
  'curse_buddha': {
    label: '虔诚拜三拜路边野佛',
    color: 0x7b1fa2,
    textColor: '#f3e5f5',
    animationType: 'curse_cloud',
    iconEmoji: '🙏',
    particleCount: 9,
    duration: 2500
  },
  'lost_way': {
    label: '迷途',
    color: 0xbf360c,
    textColor: '#ffebee',
    animationType: 'debuff_spin',
    iconEmoji: '🌀',
    particleCount: 8,
    duration: 2500
  },
  'thunder': {
    label: '雷劫',
    color: 0xffd600,
    textColor: '#fffde7',
    animationType: 'lightning_strike',
    iconEmoji: '⚡',
    particleCount: 20,
    duration: 2800
  }
}

/**
 * 获取事件动画配置
 */
export function getEventEffectConfig(eventType: string): EventEffectConfig {
  return EVENT_TYPE_EFFECTS[eventType] || {
    label: eventType,
    color: 0xffffff,
    textColor: '#ffffff',
    animationType: 'neutral_pulse',
    duration: 1500
  };
}

/**
 * 从 LogEntry 中提取事件类型
 */
export function getEventTypeFromEntry(entry: LogEntry): string {
  return getMetadataString(entry.metadata, 'event_type') || '未知事件';
}
