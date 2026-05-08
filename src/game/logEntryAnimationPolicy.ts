import type { LogEntry } from '../types/protocol';
import {
  DEFAULT_ACTION_ANIMATION_DELAY_MS,
  DICE_RESULT_DISPLAY_MS,
  DICE_ROLL_MIN_MS,
  DICE_UPGRADE_FLASH_MS,
  DICE_UPGRADE_RESULT_MS,
  MOVE_STEP_MS,
  getMetadataBoolean,
  getMetadataNumber,
  getMetadataNumberArray,
  getMetadataString,
} from './logEntryPlayback';
import { BOSS_BATTLE_DISSOLVE_DURATION, BOSS_BATTLE_HOLD_DURATION } from './boardConstants';
import { getEventEffectConfig } from './eventAnimations';

export type LogEntryAnimationContext = {
  entry: LogEntry;
  previousEntry: LogEntry | null;
  nextEntry: LogEntry | null;
  sequenceIndex: number;
};

type AnimationDelayResolver = number | ((context: LogEntryAnimationContext) => number);
type AnimationRenderFilter = boolean | ((context: LogEntryAnimationContext) => boolean);

const IMMEDIATE_NEXT_ACTION_TYPES = new Set(['damage']);
const BOSS_ACTION_TYPES = new Set(['boss_damage', 'boss_attack', 'boss_skill']);


const BOSS_DEFEATED_ANIMATION_DELAY_MS = 2400;

// Gap between popup dismiss and effect start for draw_event
const EFFECT_START_GAP_MS = 200;
// Estimated extra time for draw_event effect animations after popup dismiss
const DRAW_EVENT_EFFECT_EXTRA_MS = 1000;
// Lost way animation total duration (popup 2500 + gap 200 + effect 2300)
const LOST_WAY_ANIMATION_DELAY_MS = 5000;
// Hidden buff animation total duration (popup 2500 + gap 200 + effect 1700)
const HIDDEN_BUFF_ANIMATION_DELAY_MS = 4400;
// Relic animation total duration (popup 2500 + gap 200 + effect 2800 + buffer 200)
const RELIC_ANIMATION_DELAY_MS = 5700;

const ACTION_TRANSITION_DELAY_MS: Record<string, number> = {
  'damage->death': 180,
  'fell_down->death': 180,
  'draw_event->death': 600,
  'death->respawn': 240,
};

export type LogEntryAnimationRule = {
  renderOnBoard?: AnimationRenderFilter;
  delayMs?: AnimationDelayResolver;
};

const DEFAULT_ANIMATION_RULE: Required<LogEntryAnimationRule> = {
  renderOnBoard: true,
  delayMs: DEFAULT_ACTION_ANIMATION_DELAY_MS,
};

export function isReverseClockLostBuffEntry(entry?: LogEntry | null): entry is LogEntry {
  return Boolean(
    entry &&
      entry.action_type === 'add_buff' &&
      entry.source === 'item_reverse_clock_buff' &&
      getMetadataString(entry.metadata, 'buff_type') === 'lost'
  );
}

export function isAnyDoorTeleportEntry(entry?: LogEntry | null): entry is LogEntry {
  return Boolean(entry && entry.action_type === 'teleport' && entry.source === 'item_any_door');
}

export const LOG_ENTRY_ANIMATION_RULES: Record<string, LogEntryAnimationRule> = {
  dice_roll: {
    renderOnBoard: false,
    delayMs: DICE_ROLL_MIN_MS + DICE_RESULT_DISPLAY_MS,
  },
  dice_upgrade: {
    renderOnBoard: false,
    delayMs: DICE_UPGRADE_FLASH_MS + DICE_UPGRADE_RESULT_MS,
  },
  move: {
    renderOnBoard: true,
    delayMs: ({ entry }) => {
      const path = getMetadataNumberArray(entry.metadata, 'path');
      return Math.max(700, Math.min(3200, Math.max(1, path.length - 1) * MOVE_STEP_MS + 250));
    },
  },
  teleport: {
    renderOnBoard: true,
    delayMs: ({ entry }) => (isAnyDoorTeleportEntry(entry) ? 2600 : 2600),
  },
  draw_event: {
    renderOnBoard: true,
    delayMs: ({ entry }) => {
      const eventType = getMetadataString(entry.metadata, 'event_type');
      const config = getEventEffectConfig(eventType);
      return (config.duration || DEFAULT_ACTION_ANIMATION_DELAY_MS) + EFFECT_START_GAP_MS + DRAW_EVENT_EFFECT_EXTRA_MS;
    },
  },
  add_buff: {
    renderOnBoard: ({ entry }) => !isReverseClockLostBuffEntry(entry),
    delayMs: ({ entry }) => (isReverseClockLostBuffEntry(entry) ? 1800 : 1200),
  },
  remove_buff: {
    renderOnBoard: true,
    delayMs: 1200,
  },
  boss_damage: {
    renderOnBoard: true,
    delayMs: ({ entry }) => {
      const remainingHp = getMetadataNumber(entry.metadata, 'boss_remaining_hp');
      if (remainingHp !== null && remainingHp <= 0) return BOSS_DEFEATED_ANIMATION_DELAY_MS;

      return getMetadataBoolean(entry.metadata, 'is_crit') ? 2000 : 1800;
    },
  },
  boss_attack: {
    renderOnBoard: true,
    delayMs: ({ entry }) => (getMetadataString(entry.metadata, 'attack_type') === 'crit' ? 1900 : 1800),
  },
  boss_skill: {
    renderOnBoard: true,
    delayMs: ({ entry }) => {
      const skillType = getMetadataString(entry.metadata, 'skill_type');
      if (skillType === 'thunder') return 2300;
      if (skillType === 'curse' || skillType === 'rest') return 1900;
      if (skillType === 'thorns') return 1800;
      return 1900;
    },
  },
  death: {
    renderOnBoard: true,
    delayMs: 900,
  },
  respawn: {
    renderOnBoard: true,
    delayMs: 950,
  },
  modify_lp: {
    renderOnBoard: true,
    delayMs: DEFAULT_ACTION_ANIMATION_DELAY_MS,
  },
  remove_item: {
    renderOnBoard: false,
    delayMs: 0,
  },
  add_item: {
    renderOnBoard: false,
    delayMs: 0,
  },
};

export function isLogEntryAnimationCandidate(entry?: LogEntry | null) {
  return Boolean(entry && (entry.type === 'action' || entry.type === 'boss'));
}

export function createLogEntryAnimationContext(
  playedEntries: LogEntry[],
  pendingEntries: LogEntry[]
): LogEntryAnimationContext | null {
  const entry = pendingEntries[0];
  if (!entry) return null;

  return {
    entry,
    previousEntry: playedEntries[playedEntries.length - 1] ?? null,
    nextEntry: pendingEntries[1] ?? null,
    sequenceIndex: playedEntries.length,
  };
}

export function shouldRenderBoardLogEntryAnimation(context?: LogEntryAnimationContext | null) {
  if (!context || !isLogEntryAnimationCandidate(context.entry)) return false;

  const filter = LOG_ENTRY_ANIMATION_RULES[context.entry.action_type]?.renderOnBoard ?? DEFAULT_ANIMATION_RULE.renderOnBoard;
  return typeof filter === 'function' ? filter(context) : filter;
}

export function getLogEntryAnimationDelay(context?: LogEntryAnimationContext | null) {
  if (!context || !isLogEntryAnimationCandidate(context.entry)) return 0;

  const currentActionType = context.entry.action_type;
  const nextActionType = context.nextEntry?.action_type;
  const currentEventType = getMetadataString(context.entry.metadata, 'event_type');

  // Thunder draw_event should not be skipped by immediate damage chaining.
  // Total: popup 2800ms + gap 200ms + lightning effect ~700ms + hit pause 200ms = 3900ms
  if (currentActionType === 'draw_event' && currentEventType === 'thunder' && nextActionType === 'damage') {
    return 2800 + EFFECT_START_GAP_MS + 700;
  }

  // Ghost_hit draw_event should chain to damage with overlap (popup must finish first).
  if (currentActionType === 'draw_event' && currentEventType === 'ghost_hit' && nextActionType === 'damage') {
    return 2900;
  }

  // Mosquito draw_event should chain to damage with fast transition (popup must finish first).
  if (currentActionType === 'draw_event' && currentEventType === 'mosquito' && nextActionType === 'damage') {
    return 2900;
  }

  // Lost way draw_event has a longer animation (dissolve + recovery phases).
  if (currentActionType === 'draw_event' && currentEventType === 'lost_way') {
    return LOST_WAY_ANIMATION_DELAY_MS;
  }

  // Hidden buff draw_event has a custom animation (disintegrate + void + reassemble phases).
  if (currentActionType === 'draw_event' && currentEventType === 'hidden_buff') {
    return HIDDEN_BUFF_ANIMATION_DELAY_MS;
  }

  // Relic draw_event has a custom animation (chest appear + bomb + weapon fly-out + disappear).
  if (currentActionType === 'draw_event' && currentEventType === 'relic') {
    return RELIC_ANIMATION_DELAY_MS;
  }

  // Boss battle dynamic transition delays.
  // Derived entries should be consumed shortly after the boss dissolve
  // animation's "hit moment" (dissolve + hold), not after the full animation.
  // The hit moment is when onDissolveComplete fires the attack/skill effects.
  // Hit moment = BOSS_BATTLE_DISSOLVE_DURATION + BOSS_BATTLE_HOLD_DURATION + ~200ms pause
  const bossHitMomentDelay = BOSS_BATTLE_DISSOLVE_DURATION + BOSS_BATTLE_HOLD_DURATION + 200;

  if (currentActionType === 'boss_damage' && context.nextEntry) {
    const remainingHp = getMetadataNumber(context.entry.metadata, 'boss_remaining_hp');
    if (remainingHp !== null && remainingHp <= 0) {
      return BOSS_DEFEATED_ANIMATION_DELAY_MS;
    }
    const baseDelay = getMetadataBoolean(context.entry.metadata, 'is_crit') ? 2000 : 1800;
    return Math.max(baseDelay, bossHitMomentDelay);
  }

  if (currentActionType === 'boss_attack' && context.nextEntry) {
    const baseDelay = getMetadataString(context.entry.metadata, 'attack_type') === 'crit' ? 1900 : 1800;
    return Math.max(baseDelay, bossHitMomentDelay);
  }

  if (currentActionType === 'boss_skill' && context.nextEntry) {
    const skillType = getMetadataString(context.entry.metadata, 'skill_type');
    const baseDelay = skillType === 'thunder' ? 2300 : (skillType === 'curse' || skillType === 'rest' ? 1900 : 1800);
    return Math.max(baseDelay, bossHitMomentDelay);
  }

  if (context.nextEntry) {
    const transitionKey = `${context.entry.action_type}->${context.nextEntry.action_type}`;
    const transitionDelay = ACTION_TRANSITION_DELAY_MS[transitionKey];
    if (typeof transitionDelay === 'number') return transitionDelay;
  }

  if (
    context.nextEntry &&
    IMMEDIATE_NEXT_ACTION_TYPES.has(context.nextEntry.action_type) &&
    context.entry.action_type !== 'draw_event' &&
    !BOSS_ACTION_TYPES.has(context.entry.action_type)
  ) {
    return 0;
  }

  const delay = LOG_ENTRY_ANIMATION_RULES[context.entry.action_type]?.delayMs ?? DEFAULT_ANIMATION_RULE.delayMs;
  return typeof delay === 'function' ? delay(context) : delay;
}
