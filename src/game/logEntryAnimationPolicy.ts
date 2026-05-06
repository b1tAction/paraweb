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


const BOSS_DEFEATED_ANIMATION_DELAY_MS = 1900;

// Gap between popup dismiss and effect start for draw_event
const EFFECT_START_GAP_MS = 200;
// Estimated extra time for draw_event effect animations after popup dismiss
const DRAW_EVENT_EFFECT_EXTRA_MS = 1000;

const ACTION_TRANSITION_DELAY_MS: Record<string, number> = {
  'damage->death': 180,
  'fell_down->death': 180,
  'draw_event->death': 600,
  'death->respawn': 240,
  'boss_attack->damage': 200,
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

      return getMetadataBoolean(entry.metadata, 'is_crit') ? 1500 : 1100;
    },
  },
  boss_attack: {
    renderOnBoard: true,
    delayMs: ({ entry }) => (getMetadataString(entry.metadata, 'attack_type') === 'crit' ? 1400 : 1100),
  },
  boss_skill: {
    renderOnBoard: true,
    delayMs: ({ entry }) => {
      const skillType = getMetadataString(entry.metadata, 'skill_type');
      if (skillType === 'thunder') return 1700;
      if (skillType === 'curse' || skillType === 'rest') return 1500;
      if (skillType === 'thorns') return 1300;
      return 1500;
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
  if (currentActionType === 'draw_event' && currentEventType === 'thunder' && nextActionType === 'damage') {
    return 2800 + EFFECT_START_GAP_MS + DRAW_EVENT_EFFECT_EXTRA_MS;
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
