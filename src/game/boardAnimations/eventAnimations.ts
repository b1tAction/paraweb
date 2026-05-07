import * as Phaser from 'phaser';
import type { Player } from '../../types/protocol';
import type { LogEntryAnimationContext } from '../logEntryAnimationPolicy';
import type { AnimationOrchestrator } from '../animationOrchestrator';
import type { CharacterRenderOptions } from '../characterRenderConfig';
import { LAYER_FULLSCREEN_EFFECT, worldDepth, LAYER_EFFECT_BASE } from '../renderLayers';
import { CHARACTER_HALF_HEIGHT } from '../boardConstants';
import { getEventEffectConfig, getEventTypeFromEntry } from '../eventAnimations';
import { useGameStore } from '../../store/gameStore';
import { showCenterPopup, type PopupContext } from './popup';

const EFFECT_START_GAP_MS = 200;

export type BoardAnimationContext = {
  scene: Phaser.Scene;
  orchestrator: AnimationOrchestrator;
  tweens: Phaser.Tweens.TweenManager;
  playerMarkers: Map<string, Phaser.GameObjects.Sprite>;
  players: Player[];
  logDrivenPositions: Map<string, number>;
  cellViews: Map<number, { x: number; y: number; index: number }>;
  characterRenderOptions?: CharacterRenderOptions;
};

/**
 * Play the draw_event animation: popup first, wait for full dismiss,
 * then start the event-specific effect after a small gap.
 */
export async function playDrawEventAnimation(
  ctx: BoardAnimationContext,
  popupCtx: PopupContext,
  context: LogEntryAnimationContext
): Promise<void> {
  const { entry } = context;
  const eventType = getEventTypeFromEntry(entry);

  const effect = getEventEffectConfig(eventType);
  const duration = effect.duration || 2500;

  // Get event display name from definitions config
  const definitions = useGameStore.getState().definitions;
  const eventDesc = definitions?.events[eventType]?.desc || eventType;

  // 1. Show popup and wait for it to fully dismiss
  await showCenterPopup(popupCtx, eventDesc, effect.textColor, effect.iconEmoji, duration);

  // 2. Small gap after popup dismisses before starting effect
  await new Promise<void>((resolve) => ctx.scene.time.delayedCall(EFFECT_START_GAP_MS, resolve));

  // 3. Play the event-specific effect animation
  if (eventType === 'thunder') {
    playLightningStrikeAnimation(ctx, context);
  } else if (eventType === 'herb') {
    playHerbAnimation(ctx, context);
  } else if (eventType === 'wind_gust') {
    playWindGustAnimation(ctx, context);
  } else if (eventType === 'lucky_bubble') {
    playBubbleAnimation(ctx, context);
  } else if (eventType === 'ghost_hit') {
    playGhostHitAnimation(ctx, context);
  }
}

/**
 * Play the lucky bubble effect: bubble starts at character's feet and floats upward.
 * Uses world-space coordinates with LAYER_FULLSCREEN_EFFECT depth so it renders
 * above the popup background without needing scrollFactor(0).
 */
export function playBubbleAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) return;

  const feetY = marker.y + CHARACTER_HALF_HEIGHT;
  const floatDistance = 80; // pixels to float upward

  const bubbleSprite = ctx.scene.add.sprite(marker.x, feetY, 'bubble-effect');
  bubbleSprite.setOrigin(0.5, 1.0);
  bubbleSprite.setAlpha(0.6);
  bubbleSprite.setDepth(LAYER_FULLSCREEN_EFFECT);
  bubbleSprite.play('bubble_anim');

  // Float upward tween - handles cleanup on completion
  ctx.tweens.add({
    targets: bubbleSprite,
    y: bubbleSprite.y - floatDistance,
    alpha: { from: 0.6, to: 0 },
    duration: 1000,
    ease: 'Sine.easeOut',
    onComplete: () => {
      bubbleSprite.destroy();
    }
  });
}

/**
 * Play the ghost hit effect: ghost appears offset from player and strikes quickly.
 * Fast playback (20fps, 8 frames = 0.4s) to minimize delay before damage animation.
 */
export function playGhostHitAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) return;

  // Position ghost offset to the left of the player so it appears to strike toward them
  const ghostX = marker.x - 80;
  const bodyCenterY = marker.y;

  const ghostSprite = ctx.scene.add.sprite(ghostX, bodyCenterY, 'ghost-effect');
  ghostSprite.setScale(1.0);
  ghostSprite.setOrigin(0.5, 0.5);
  ghostSprite.setDepth(LAYER_FULLSCREEN_EFFECT);
  ghostSprite.play('ghost_hit_anim');

  ghostSprite.on('animationcomplete', () => {
    ctx.tweens.add({
      targets: ghostSprite,
      alpha: { from: 1, to: 0 },
      duration: 200,
      ease: 'Sine.easeOut',
      onComplete: () => {
        ghostSprite.destroy();
      }
    });
  });

  ctx.scene.cameras.main.shake(200, 0.003);
}

/**
 * Play the herb growth effect at the character's feet.
 * Uses world-space coordinates with LAYER_FULLSCREEN_EFFECT depth so it renders
 * above the popup background without needing scrollFactor(0).
 */
export function playHerbAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) return;

  const feetY = marker.y + CHARACTER_HALF_HEIGHT;

  const herbSprite = ctx.scene.add.sprite(marker.x, feetY, 'herb-effect');
  herbSprite.setOrigin(0.5, 1.0);
  herbSprite.setDepth(LAYER_FULLSCREEN_EFFECT);
  herbSprite.play('herb_anim');

  ctx.orchestrator.registerCleanupOnAnimationComplete(herbSprite);
}

/**
 * Play the wind gust effect at the character's feet.
 * Uses world-space coordinates with LAYER_FULLSCREEN_EFFECT depth so it renders
 * above the popup background without needing scrollFactor(0).
 */
export function playWindGustAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) return;

  const feetY = marker.y + CHARACTER_HALF_HEIGHT;

  const windSprite = ctx.scene.add.sprite(marker.x, feetY, 'wind-gust-effect');
  windSprite.setScale(2.0);
  windSprite.setOrigin(0.5, 1.0);
  windSprite.setDepth(LAYER_FULLSCREEN_EFFECT);
  windSprite.play('wind_gust_anim');

  ctx.orchestrator.registerCleanupOnAnimationComplete(windSprite);
}

/**
 * Play the lightning strike effect on the character.
 * Uses world-space coordinates with LAYER_FULLSCREEN_EFFECT depth so the sprite
 * renders above the popup background without needing scrollFactor(0).
 * Also includes a camera flash and character shake.
 */
export function playLightningStrikeAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) return;

  const landingX = marker.x;
  const landingY = marker.y + CHARACTER_HALF_HEIGHT;

  // 1. Lightning sprite at LAYER_FULLSCREEN_EFFECT (world-space depth)
  const lightningSprite = ctx.scene.add.sprite(landingX, landingY, 'lightning-bolt');
  lightningSprite.setScale(2.0);
  lightningSprite.setOrigin(0.5, 1.0);
  lightningSprite.setDepth(LAYER_FULLSCREEN_EFFECT);
  lightningSprite.play('lightning_strike_anim');

  ctx.orchestrator.registerCleanupOnAnimationComplete(lightningSprite);

  // 2. Camera white flash to simulate lightning brightness
  ctx.scene.cameras.main.flash(300, 255, 255, 200);

  // 3. Camera shake to simulate impact (avoids modifying marker.x/y
  // which would conflict with syncPlayers tween).
  ctx.scene.cameras.main.shake(640, 0.005);
}

/**
 * Play the lightning strike animation without popup (for boss_skill thunder).
 * Uses world-space depth for the sprite since there's no popup to conflict with.
 */
export function playLightningStrikeWorldAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) return;

  const landingX = marker.x;
  const landingY = marker.y + CHARACTER_HALF_HEIGHT;

  // Lightning sprite at world-space depth
  const lightningSprite = ctx.scene.add.sprite(landingX, landingY, 'lightning-bolt');
  lightningSprite.setScale(2.0);
  lightningSprite.setOrigin(0.5, 1.0);
  lightningSprite.setDepth(worldDepth(LAYER_EFFECT_BASE, landingY) + 100);
  lightningSprite.play('lightning_strike_anim');

  lightningSprite.on('animationcomplete', () => {
    lightningSprite.destroy();
  });

  // Camera flash
  ctx.scene.cameras.main.flash(300, 255, 255, 200);

  // Camera shake (avoids modifying marker.x/y which would conflict
  // with syncPlayers tween).
  ctx.scene.cameras.main.shake(640, 0.005);
}