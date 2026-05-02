import type { LogEntry } from '../types/protocol';
import {
  DEFAULT_ACTION_ANIMATION_DELAY_MS,
  DICE_RESULT_DISPLAY_MS,
  DICE_ROLL_MIN_MS,
  DICE_UPGRADE_FLASH_MS,
  DICE_UPGRADE_RESULT_MS,
  MOVE_STEP_MS,
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
  draw_event: {
    renderOnBoard: true,
    delayMs: ({ entry }) => {
      const eventType = getMetadataString(entry.metadata, 'event_type');
      const config = getEventEffectConfig(eventType);
      return config.duration || DEFAULT_ACTION_ANIMATION_DELAY_MS;
    },
  },
  add_buff: {
    renderOnBoard: ({ entry }) => !isReverseClockLostBuffEntry(entry),
    delayMs: ({ entry }) => (isReverseClockLostBuffEntry(entry) ? 1800 : DEFAULT_ACTION_ANIMATION_DELAY_MS),
  },
  remove_item: {
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
  if (context.nextEntry && IMMEDIATE_NEXT_ACTION_TYPES.has(context.nextEntry.action_type)) return 0;

  const delay = LOG_ENTRY_ANIMATION_RULES[context.entry.action_type]?.delayMs ?? DEFAULT_ANIMATION_RULE.delayMs;
  return typeof delay === 'function' ? delay(context) : delay;
}
