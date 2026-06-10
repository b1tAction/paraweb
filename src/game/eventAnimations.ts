import type { LogEntry } from '../types/protocol';
import { getMetadataString } from './logEntryPlayback';

export type EventAnimationType =
  | 'heal_pop' // green healing pop effect
  | 'damage_flash' // red damage flash effect
  | 'buff_glow' // golden buff glow effect
  | 'debuff_spin' // purple debuff spin effect
  | 'item_sparkle' // golden item sparkle effect
  | 'teleport_swap' // blue teleport swap effect
  | 'skull_gaze_bomb' // purple skull + bomb explosion effect
  | 'lightning_strike' // yellow lightning strike effect
  | 'ghost_attack' // grey ghost attack effect
  | 'wind_gust' // orange wind gust effect
  | 'neutral_pulse' // white neutral pulse effect
  | 'bubble_float' // blue bubble float effect
  | 'mosquito_attack' // mosquito sprite attack effect
  | 'lost_way_dissolve' // dark dissolve/glitch overlay effect
  | 'hidden_buff_disintegrate' // blue-purple fragment scatter + void + reassemble effect
  | 'dizzy_stars' // hurt+僵直+spinning stars dizzy effect
  | 'relic_open' // chest appear + bomb explosion + weapon fly-out + disappear effect
  | 'magic_flute_absorb'; // violet spell absorb spiral effect

export type EventEffectConfig = {
  color: number;
  textColor: string;
  animationType: EventAnimationType;
  iconEmoji?: string;
  particleCount?: number;
  duration?: number;
};

// Event type → animation effect mapping
// Display names (label) are no longer hardcoded here; they come from DefinitionsConfig.
export const EVENT_TYPE_EFFECTS: Record<string, EventEffectConfig> = {
  // Good events
  herb: {
    color: 0x66bb6a,
    textColor: '#e8f5e9',
    animationType: 'heal_pop',
    iconEmoji: '🌿',
    particleCount: 8,
    duration: 2500,
  },
  lucky_bubble: {
    color: 0x80deea,
    textColor: '#e0f7fa',
    animationType: 'bubble_float',
    iconEmoji: '🫧',
    particleCount: 8,
    duration: 2500,
  },
  relic: {
    color: 0xffd700,
    textColor: '#fff9c4',
    animationType: 'relic_open',
    iconEmoji: '⚔️',
    particleCount: 12,
    duration: 2500,
  },
  divine_bless: {
    color: 0x42a5f5,
    textColor: '#e3f2fd',
    animationType: 'buff_glow',
    iconEmoji: '😇',
    particleCount: 15,
    duration: 2500,
  },

  // Neutral events
  hidden_buff: {
    color: 0x1a237e,
    textColor: '#e8eaf6',
    animationType: 'hidden_buff_disintegrate',
    iconEmoji: '👁️',
    particleCount: 6,
    duration: 2500,
  },
  exchange: {
    color: 0x29b6f6,
    textColor: '#e1f5fe',
    animationType: 'teleport_swap',
    iconEmoji: '🔄',
    particleCount: 10,
    duration: 2500,
  },
  taste_test: {
    color: 0x8d6e63,
    textColor: '#efebe9',
    animationType: 'neutral_pulse',
    iconEmoji: '🥤',
    particleCount: 5,
    duration: 2500,
  },

  // Bad events
  mosquito: {
    color: 0xef5350,
    textColor: '#ffebee',
    animationType: 'mosquito_attack',
    iconEmoji: '🦟',
    particleCount: 3,
    duration: 2500,
  },
  ghost_hit: {
    color: 0x616161,
    textColor: '#f5f5f5',
    animationType: 'ghost_attack',
    iconEmoji: '👻',
    particleCount: 7,
    duration: 2500,
  },
  dog_poop: {
    color: 0x8d6e63,
    textColor: '#efebe9',
    animationType: 'damage_flash',
    iconEmoji: '💩',
    particleCount: 2,
    duration: 2500,
  },
  wind_gust: {
    color: 0xff7043,
    textColor: '#fff3e0',
    animationType: 'wind_gust',
    iconEmoji: '💨',
    particleCount: 6,
    duration: 2500,
  },
  skull_gaze: {
    color: 0x7b1fa2,
    textColor: '#f3e5f5',
    animationType: 'skull_gaze_bomb',
    iconEmoji: '💀',
    particleCount: 9,
    duration: 2800,
  },
  lost_way: {
    color: 0xbf360c,
    textColor: '#ffebee',
    animationType: 'lost_way_dissolve',
    iconEmoji: '🌀',
    particleCount: 8,
    duration: 2500,
  },
  thunder: {
    color: 0xffd600,
    textColor: '#fffde7',
    animationType: 'lightning_strike',
    iconEmoji: '⚡',
    particleCount: 20,
    duration: 2800,
  },
};

/**
 * Get event animation config (visual parameters only).
 * Display names come from DefinitionsConfig, not this mapping.
 */
export function getEventEffectConfig(eventType: string): EventEffectConfig {
  return (
    EVENT_TYPE_EFFECTS[eventType] || {
      color: 0xffffff,
      textColor: '#ffffff',
      animationType: 'neutral_pulse',
      duration: 1500,
    }
  );
}

/**
 * Extract event type from LogEntry metadata.
 */
export function getEventTypeFromEntry(entry: LogEntry): string {
  return getMetadataString(entry.metadata, 'event_type') || '';
}
