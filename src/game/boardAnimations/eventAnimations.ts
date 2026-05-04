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
 * Play the draw_event animation: popup first, then delayed event-specific effect.
 */
export function playDrawEventAnimation(
  ctx: BoardAnimationContext,
  popupCtx: PopupContext,
  context: LogEntryAnimationContext
): void {
  const { entry } = context;
  const eventType = getEventTypeFromEntry(entry);

  const effect = getEventEffectConfig(eventType);
  const duration = effect.duration || 2500;

  // Get event display name from definitions config
  const definitions = useGameStore.getState().definitions;
  const eventName = definitions?.events[eventType]?.name || eventType;

  // 1. Show popup immediately at screen center
  showCenterPopup(popupCtx, eventName, effect.textColor, effect.iconEmoji, duration);

  // 2. Delay the event-specific animation to stagger visual focus
  const animationDelay = 500

  ctx.scene.time.delayedCall(animationDelay, () => {
    if (eventType === 'thunder') {
      playLightningStrikeAnimation(ctx, context);
    } else if (eventType === 'herb') {
      playHerbAnimation(ctx, context);
    } else if (eventType === 'wind_gust') {
      playWindGustAnimation(ctx, context);
    } else if (eventType === 'lucky_bubble') {
      playBubbleAnimation(ctx, context);
    }
  });
}

/**
 * Play the lucky bubble effect: bubble starts at character's feet and floats upward.
 * Screen-fixed at LAYER_FULLSCREEN_EFFECT so it's visible above the popup background.
 */
export function playBubbleAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) return;

  const feetY = marker.y + CHARACTER_HALF_HEIGHT;
  const floatDistance = 80; // pixels to float upward

  const bubbleSprite = ctx.orchestrator.createScreenFixedObject(
    marker.x, feetY,
    LAYER_FULLSCREEN_EFFECT,
    (sx, sy) => {
      const sprite = ctx.scene.add.sprite(sx, sy, 'bubble-effect');
      sprite.setScale(0.8);
      sprite.setOrigin(0.5, 1.0);
      sprite.setAlpha(0.6);
      sprite.play('bubble_anim');
      return sprite;
    }
  );

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
 * Play the herb growth effect at the character's feet.
 * Screen-fixed at LAYER_FULLSCREEN_EFFECT so it's visible above the popup background.
 */
export function playHerbAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) return;

  const feetY = marker.y + CHARACTER_HALF_HEIGHT;

  const herbSprite = ctx.orchestrator.createScreenFixedObject(
    marker.x, feetY,
    LAYER_FULLSCREEN_EFFECT,
    (sx, sy) => {
      const sprite = ctx.scene.add.sprite(sx, sy, 'herb-effect');
      sprite.setScale(1.0);
      sprite.setOrigin(0.5, 1.0);
      sprite.play('herb_anim');
      return sprite;
    }
  );

  ctx.orchestrator.registerCleanupOnAnimationComplete(herbSprite);
}

/**
 * Play the wind gust effect at the character's feet.
 * Screen-fixed at LAYER_FULLSCREEN_EFFECT so it's visible above the popup background.
 */
export function playWindGustAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) return;

  const feetY = marker.y + CHARACTER_HALF_HEIGHT;

  const windSprite = ctx.orchestrator.createScreenFixedObject(
    marker.x, feetY,
    LAYER_FULLSCREEN_EFFECT,
    (sx, sy) => {
      const sprite = ctx.scene.add.sprite(sx, sy, 'wind-gust-effect');
      sprite.setScale(2.0);
      sprite.setOrigin(0.5, 1.0);
      sprite.play('wind_gust_anim');
      return sprite;
    }
  );

  ctx.orchestrator.registerCleanupOnAnimationComplete(windSprite);
}

/**
 * Play the lightning strike effect on the character.
 * Screen-fixed at LAYER_FULLSCREEN_EFFECT so it's visible above the popup background.
 * Also includes a camera flash and character shake.
 */
export function playLightningStrikeAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) return;

  const landingX = marker.x;
  const landingY = marker.y + CHARACTER_HALF_HEIGHT;

  // 1. Lightning sprite at LAYER_FULLSCREEN_EFFECT (screen-fixed)
  const lightningSprite = ctx.orchestrator.createScreenFixedObject(
    landingX, landingY,
    LAYER_FULLSCREEN_EFFECT,
    (sx, sy) => {
      const sprite = ctx.scene.add.sprite(sx, sy, 'lightning-bolt');
      sprite.setScale(2.0);
      sprite.setOrigin(0.5, 1.0);
      sprite.play('lightning_strike_anim');
      return sprite;
    }
  );

  ctx.orchestrator.registerCleanupOnAnimationComplete(lightningSprite);

  // 2. Camera white flash to simulate lightning brightness
  ctx.scene.cameras.main.flash(300, 255, 255, 200);

  // 3. Character shake after lightning strike
  // Use a temporary offset object so the shake tween doesn't directly
  // modify marker.x/y (which conflicts with syncPlayers tween).
  const shakeOriginalX = marker.x;
  const shakeOriginalY = marker.y;
  const shakeOffset = { offsetX: 0, offsetY: 0 };

  ctx.tweens.add({
    targets: shakeOffset,
    offsetX: { from: -4, to: 0 },
    offsetY: { from: -3, to: 0 },
    duration: 80,
    repeat: 8,
    ease: 'Linear',
    yoyo: true,
    onUpdate: () => {
      marker.x = shakeOriginalX + shakeOffset.offsetX;
      marker.y = shakeOriginalY + shakeOffset.offsetY;
    },
    onComplete: () => {
      marker.x = shakeOriginalX;
      marker.y = shakeOriginalY;
    },
  });
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

  // Character shake
  // Use a temporary offset object so the shake tween doesn't directly
  // modify marker.x/y (which conflicts with syncPlayers tween).
  const shakeOriginalX = marker.x;
  const shakeOriginalY = marker.y;
  const shakeOffset = { offsetX: 0, offsetY: 0 };

  ctx.tweens.add({
    targets: shakeOffset,
    offsetX: { from: -4, to: 0 },
    offsetY: { from: -3, to: 0 },
    duration: 80,
    repeat: 8,
    ease: 'Linear',
    yoyo: true,
    onUpdate: () => {
      marker.x = shakeOriginalX + shakeOffset.offsetX;
      marker.y = shakeOriginalY + shakeOffset.offsetY;
    },
    onComplete: () => {
      marker.x = shakeOriginalX;
      marker.y = shakeOriginalY;
    },
  });
}