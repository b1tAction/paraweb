import * as Phaser from 'phaser';
import type { Player } from '../../types/protocol';
import type { LogEntryAnimationContext } from '../logEntryAnimationPolicy';
import type { AnimationOrchestrator } from '../animationOrchestrator';
import type { CharacterRenderOptions } from '../characterRenderConfig';
import { resolveCharacterProfile, getCharacterEffectOffsetY, getCharacterRenderer, getAnimationKey } from '../characterRenderConfig';
import { LAYER_FULLSCREEN_EFFECT, LAYER_SHADER_OVERLAY, LAYER_LOST_WAY_CHARACTER, worldDepth, LAYER_EFFECT_BASE } from '../renderLayers';
import { CHARACTER_HALF_HEIGHT, LOST_WAY_DISSOLVE_START_DELAY, LOST_WAY_DISSOLVE_DURATION, LOST_WAY_DIZZY_START_DELAY, LOST_WAY_DIZZY_DURATION, LOST_WAY_RECOVERY_START_DELAY, LOST_WAY_RECOVERY_DURATION, LOST_WAY_TOTAL_EFFECT_MS, DIZZY_TINT_COLOR, HIDDEN_BUFF_DISSOLVE_START_DELAY, HIDDEN_BUFF_DISSOLVE_DURATION, HIDDEN_BUFF_RECOVERY_START_DELAY, HIDDEN_BUFF_RECOVERY_DURATION, HIDDEN_BUFF_TOTAL_EFFECT_MS, RELIC_TEXTURE_KEY, RELIC_BOMB_TEXTURE_KEY, RELIC_BOMB_ANIMATION_KEY, RELIC_CHEST_APPEAR_DELAY, RELIC_CHEST_APPEAR_DURATION, RELIC_BOMB_START_DELAY, RELIC_WEAPON_FLY_DELAY, RELIC_WEAPON_FLY_DURATION, RELIC_WEAPON_DISAPPEAR_DELAY, RELIC_WEAPON_DISAPPEAR_DURATION, RELIC_TOTAL_EFFECT_MS, RELIC_CHEST_OFFSET_X, RELIC_CHEST_START_OFFSET_Y, RELIC_CHEST_LAND_OFFSET_Y, RELIC_BOMB_SCALE, RELIC_WEAPON_LANDING_OFFSETS, RELIC_WEAPON_LAND_Y_OFFSET, RELIC_WEAPON_PEAK_HEIGHT_MIN, RELIC_WEAPON_PEAK_HEIGHT_MAX, WEAPON_CATEGORIES, WEAPON_ICON_KEYS, RELIC_WEAPON_COUNT, DIVINE_BLESS_WINGS_TEXTURE_KEY, DIVINE_BLESS_WINGS_SCALE, DIVINE_BLESS_WINGS_OFFSET_Y, DIVINE_BLESS_WINGS_APPEAR_DURATION, DIVINE_BLESS_WINGS_HOLD_DURATION, DIVINE_BLESS_WINGS_DISAPPEAR_DURATION } from '../boardConstants';
import { LOST_WAY_DISSOLVE_SHADER_NAME, LOST_WAY_DISSOLVE_FRAGMENT_SOURCE } from '../shaders/lostWayDissolve';
import { HIDDEN_BUFF_DISSOLVE_SHADER_NAME, HIDDEN_BUFF_DISSOLVE_FRAGMENT_SOURCE } from '../shaders/hiddenBuffDissolve';
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
  } else if (eventType === 'skull_gaze') {
    playSkullGazeBombAnimation(ctx, context);
  } else if (eventType === 'ghost_hit') {
    playGhostHitAnimation(ctx, context);
  } else if (eventType === 'mosquito') {
    playMosquitoAnimation(ctx, context);
  } else if (eventType === 'lost_way') {
    playLostWayAnimation(ctx, context);
  } else if (eventType === 'hidden_buff') {
    playHiddenBuffAnimation(ctx, context);
  } else if (eventType === 'divine_bless') {
    playDivineBlessAnimation(ctx, context);
  } else if (eventType === 'relic') {
    playRelicAnimation(ctx, context);
  }
}

export function playDivineBlessAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) return;

  const player = ctx.players.find((p) => p.player_id === entry.target);
  const order = player ? ctx.players.indexOf(player) : 0;
  const profile = player ? resolveCharacterProfile(player, order, ctx.characterRenderOptions) : null;
  const effectOffsetY = profile ? getCharacterEffectOffsetY(profile) : 0;
  const startScale = DIVINE_BLESS_WINGS_SCALE * 0.72;
  const endScale = DIVINE_BLESS_WINGS_SCALE * 1.08;

  const wingsSprite = ctx.scene.add.image(
    marker.x,
    marker.y + effectOffsetY + DIVINE_BLESS_WINGS_OFFSET_Y,
    DIVINE_BLESS_WINGS_TEXTURE_KEY
  );
  wingsSprite.setOrigin(0.5, 0.5);
  wingsSprite.setDepth(marker.depth - 1);
  wingsSprite.setScale(startScale);
  wingsSprite.setAlpha(0);

  ctx.orchestrator.registerCleanupOnTimer(
    wingsSprite,
    DIVINE_BLESS_WINGS_APPEAR_DURATION + DIVINE_BLESS_WINGS_HOLD_DURATION + DIVINE_BLESS_WINGS_DISAPPEAR_DURATION + 300
  );

  ctx.tweens.add({
    targets: wingsSprite,
    alpha: { from: 0, to: 0.95 },
    scaleX: { from: startScale, to: DIVINE_BLESS_WINGS_SCALE },
    scaleY: { from: startScale, to: DIVINE_BLESS_WINGS_SCALE },
    duration: DIVINE_BLESS_WINGS_APPEAR_DURATION,
    ease: 'Back.easeOut',
    onComplete: () => {
      ctx.scene.time.delayedCall(DIVINE_BLESS_WINGS_HOLD_DURATION, () => {
        if (!wingsSprite.active) return;
        ctx.tweens.add({
          targets: wingsSprite,
          alpha: { from: wingsSprite.alpha, to: 0 },
          scaleX: { from: DIVINE_BLESS_WINGS_SCALE, to: endScale },
          scaleY: { from: DIVINE_BLESS_WINGS_SCALE, to: endScale },
          duration: DIVINE_BLESS_WINGS_DISAPPEAR_DURATION,
          ease: 'Sine.easeIn',
          onComplete: () => {
            if (wingsSprite.active) wingsSprite.destroy();
          }
        });
      });
    }
  });
}

/**
 * Play the skull gaze + bomb explosion effect for skull_gaze event.
 * Purple skull appears at character's feet, then bomb explosion with purple tint
 * starts shortly after. Skull fades out while explosion continues.
 */
export function playSkullGazeBombAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) return;

  const centerX = marker.x;
  // Center effects at player body mid-point instead of feet
  const bodyCenterY = marker.y;

  // 1. Skull sprite centered at player body
  const skullSprite = ctx.scene.add.sprite(centerX, bodyCenterY, 'skull-gaze-effect');
  skullSprite.setScale(1.5);
  skullSprite.setOrigin(0.5, 0.5);
  skullSprite.setDepth(LAYER_FULLSCREEN_EFFECT);
  skullSprite.play('skull_gaze_anim');

  // 2. Bomb explosion centered at player body (150ms delay)
  ctx.scene.time.delayedCall(150, () => {
    const bombSprite = ctx.scene.add.sprite(centerX, bodyCenterY, 'bomb-effect');
    bombSprite.setScale(2.0);
    bombSprite.setOrigin(0.5, 0.5);
    bombSprite.setDepth(LAYER_FULLSCREEN_EFFECT);
    // Apply purple tint to the explosion
    bombSprite.setTint(0x9c27b0);
    bombSprite.play('bomb_anim');

    bombSprite.on('animationcomplete', () => {
      bombSprite.destroy();
    });
  });

  // 3. Skull fades out after its animation completes
  skullSprite.on('animationcomplete', () => {
    ctx.tweens.add({
      targets: skullSprite,
      alpha: { from: 1, to: 0 },
      duration: 300,
      ease: 'Sine.easeOut',
      onComplete: () => {
        skullSprite.destroy();
      }
    });
  });

  // 4. Camera shake for impact feel
  ctx.scene.cameras.main.shake(400, 0.003);
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

  ctx.scene.cameras.main.shake(640, 0.005);
}

/**
 * Play the mosquito attack effect: mosquito appears offset to the left
 * of the player and attacks, then fades out.
 */
export function playMosquitoAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) return;

  // Position mosquito offset to the left of the player
  const mosquitoX = marker.x - 30;
  const bodyCenterY = marker.y;

  const mosquitoSprite = ctx.scene.add.sprite(mosquitoX, bodyCenterY, 'mosquito-effect');
  mosquitoSprite.setScale(1.0);
  mosquitoSprite.setOrigin(0.5, 0.5);
  mosquitoSprite.setDepth(LAYER_FULLSCREEN_EFFECT);
  mosquitoSprite.play('mosquito_anim');

  mosquitoSprite.on('animationcomplete', () => {
    ctx.tweens.add({
      targets: mosquitoSprite,
      alpha: { from: 1, to: 0 },
      duration: 200,
      ease: 'Sine.easeOut',
      onComplete: () => {
        mosquitoSprite.destroy();
      }
    });
  });

  ctx.scene.cameras.main.shake(200, 0.003);
}

/**
 * Play the lost way effect: character runs in place while background
 * dissolves/glitches to black via a WebGL shader overlay. When fully black,
 * vortex spiral twist distortion activates and character switches to
 * dizzy (hurt+僵直+purple tint), then background recovers, vortex fades,
 * and character returns to idle.
 * Only the affected character remains visible above the overlay.
 */
export function playLostWayAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) return;

  const player = ctx.players.find((p) => p.player_id === entry.target);
  const order = player ? ctx.players.indexOf(player) : 0;
  const profile = player ? resolveCharacterProfile(player, order, ctx.characterRenderOptions) : null;
  if (!profile) return;

  const renderer = getCharacterRenderer(ctx.characterRenderOptions);
  const cam = ctx.scene.cameras.main;
  const canRun = profile.animations.move && renderer.hasAnimation?.(ctx.scene, profile, 'move');
  const canHurt = profile.animations.hurt && renderer.hasAnimation?.(ctx.scene, profile, 'hurt');

  // --- Create shader overlay covering entire viewport ---
  const zoom = cam.zoom || 1;
  const screenCenterX = cam.width / 2;
  const screenCenterY = cam.height / 2;
  const worldX = (screenCenterX - cam.centerX) / zoom + cam.centerX;
  const worldY = (screenCenterY - cam.centerY) / zoom + cam.centerY;
  const worldWidth = cam.width / zoom;
  const worldHeight = cam.height / zoom;

  const progressHolder = { value: 0 };
  const vortexHolder = { value: 0 };
  const shaderObj = ctx.scene.add.shader(
    {
      name: LOST_WAY_DISSOLVE_SHADER_NAME,
      fragmentSource: LOST_WAY_DISSOLVE_FRAGMENT_SOURCE,
      setupUniforms: (setUniform: (name: string, value: any) => void) => {
        setUniform('uProgress', progressHolder.value);
        setUniform('uTime', ctx.scene.time.now / 1000);
        setUniform('uResolution', [cam.width, cam.height]);
        setUniform('uVortex', vortexHolder.value);
      },
    },
    worldX,
    worldY,
    worldWidth,
    worldHeight
  );
  shaderObj.setOrigin(0.5, 0.5);
  shaderObj.setScrollFactor(0);
  shaderObj.setDepth(LAYER_SHADER_OVERLAY);

  // --- Cleanup tracker for interruption safety ---
  const originalDepth = marker.depth;

  const cleanupTracker = ctx.scene.add.container(0, 0);
  ctx.orchestrator.registerCleanupOnTimer(cleanupTracker, LOST_WAY_TOTAL_EFFECT_MS + 500);
  ctx.orchestrator.registerCleanupOnTimer(shaderObj, LOST_WAY_TOTAL_EFFECT_MS + 500);

  cleanupTracker.once('destroy', () => {
    if (marker.active) {
      marker.setDepth(originalDepth);
      marker.clearTint();
    }
    if (marker.active) renderer.play(ctx.scene, marker, profile, 'idle');
    ctx.tweens.killTweensOf(progressHolder);
    ctx.tweens.killTweensOf(vortexHolder);
    if (shaderObj.active) shaderObj.destroy();
  });

  // --- Raise character depth above shader overlay ---
  marker.setDepth(LAYER_LOST_WAY_CHARACTER);

  // --- Phase 1: Start running in place ---
  if (canRun) {
    renderer.play(ctx.scene, marker, profile, 'move');
  }

  // --- Phase 2: Background dissolve (shader progress 0 → 1) ---
  ctx.scene.time.delayedCall(LOST_WAY_DISSOLVE_START_DELAY, () => {
    ctx.tweens.add({
      targets: progressHolder,
      value: 1,
      duration: LOST_WAY_DISSOLVE_DURATION,
      ease: 'Sine.easeIn',
    });
    ctx.scene.cameras.main.shake(200, 0.003);
  });

  // --- Phase 3: Dizzy + vortex twist (hurt+僵直+tint+vortex spiral in void) ---
  ctx.scene.time.delayedCall(LOST_WAY_DIZZY_START_DELAY, () => {
    marker.setTint(DIZZY_TINT_COLOR);
    if (canHurt) {
      const hurtAnimEvent = `animationcomplete-${getAnimationKey(profile, 'hurt')}`;
      marker.removeAllListeners(hurtAnimEvent);
      renderer.play(ctx.scene, marker, profile, 'hurt');
    } else if (canRun) {
      renderer.play(ctx.scene, marker, profile, 'idle');
    }

    // Vortex spiral twist: tween 0 → 1
    ctx.tweens.add({
      targets: vortexHolder,
      value: 1,
      duration: LOST_WAY_DIZZY_DURATION,
      ease: 'Quad.easeIn',
    });
  });

  // --- Phase 5: Background recovery + vortex fades (character keeps dizzy until animation ends) ---
  ctx.scene.time.delayedCall(LOST_WAY_RECOVERY_START_DELAY, () => {
    // Vortex fade out: tween current → 0
    ctx.tweens.add({
      targets: vortexHolder,
      value: 0,
      duration: LOST_WAY_RECOVERY_DURATION,
      ease: 'Sine.easeOut',
    });

    // Recovery: shader progress 1 → 0
    ctx.tweens.add({
      targets: progressHolder,
      value: 0,
      duration: LOST_WAY_RECOVERY_DURATION,
      ease: 'Sine.easeOut',
      onComplete: () => {
        // Stiffness (僵直) only clears when animation fully ends
        marker.clearTint();
        renderer.play(ctx.scene, marker, profile, 'idle');
        marker.setDepth(originalDepth);
        if (shaderObj.active) shaderObj.destroy();
        if (cleanupTracker.active) cleanupTracker.destroy();
      },
    });
  });
}

/**
 * Play the hidden buff effect: character itself disintegrates into blue-purple
 * fragments that scatter outward (phase 1), stays dissolved in void
 * (phase 2), then fragments reassemble back into the character (phase 3).
 *
 * Uses a FULL-SCREEN shader overlay (same approach as lost_way), with the
 * effect localized around the character via the uCenter uniform. This
 * eliminates the rectangular boundary artifact that occurred with the
 * previous localized 200x200 shader quad approach (where uResolution
 * didn't match the actual pixel dimensions due to camera zoom).
 * The character fades out via alpha tween, while the full-screen shader
 * shows fragment scatter visual only near the character position.
 */
export function playHiddenBuffAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) return;

  const player = ctx.players.find((p) => p.player_id === entry.target);
  const order = player ? ctx.players.indexOf(player) : 0;
  const profile = player ? resolveCharacterProfile(player, order, ctx.characterRenderOptions) : null;
  if (!profile) return;

  const renderer = getCharacterRenderer(ctx.characterRenderOptions);
  const HIDDEN_BUFF_TINT_COLOR = 0x1a237e;  // deep indigo tint for dimensional shift feel

  // --- Create full-screen shader overlay (same approach as lost_way) ---
  const cam = ctx.scene.cameras.main;
  const zoom = cam.zoom || 1;
  const screenCenterX = cam.width / 2;
  const screenCenterY = cam.height / 2;
  const worldX = (screenCenterX - cam.centerX) / zoom + cam.centerX;
  const worldY = (screenCenterY - cam.centerY) / zoom + cam.centerY;
  const worldWidth = cam.width / zoom;
  const worldHeight = cam.height / zoom;

  // Compute character's normalized position in the viewport (0-1)
  // for the uCenter uniform that localizes the effect around the character.
  const screenX = (marker.x - cam.worldView.x) * zoom;
  const screenY = (marker.y - cam.worldView.y) * zoom;
  const uCenterX = screenX / cam.width;
  const uCenterY = 1.0 - screenY / cam.height;

  const progressHolder = { value: 0 };
  const disintegrateHolder = { value: 0 };
  const shaderObj = ctx.scene.add.shader(
    {
      name: HIDDEN_BUFF_DISSOLVE_SHADER_NAME,
      fragmentSource: HIDDEN_BUFF_DISSOLVE_FRAGMENT_SOURCE,
      setupUniforms: (setUniform: (name: string, value: any) => void) => {
        setUniform('uProgress', progressHolder.value);
        setUniform('uTime', ctx.scene.time.now / 1000);
        setUniform('uResolution', [cam.width, cam.height]);
        setUniform('uDisintegrate', disintegrateHolder.value);
        setUniform('uCenter', [uCenterX, uCenterY]);
      },
    },
    worldX,
    worldY,
    worldWidth,
    worldHeight
  );
  shaderObj.setOrigin(0.5, 0.5);
  shaderObj.setScrollFactor(0);
  shaderObj.setDepth(LAYER_SHADER_OVERLAY);

  // --- Cleanup tracker for interruption safety ---
  const originalDepth = marker.depth;

  const cleanupTracker = ctx.scene.add.container(0, 0);
  ctx.orchestrator.registerCleanupOnTimer(cleanupTracker, HIDDEN_BUFF_TOTAL_EFFECT_MS + 500);
  ctx.orchestrator.registerCleanupOnTimer(shaderObj, HIDDEN_BUFF_TOTAL_EFFECT_MS + 500);

  cleanupTracker.once('destroy', () => {
    if (marker.active) {
      marker.setDepth(originalDepth);
      marker.clearTint();
      marker.setAlpha(1);
    }
    if (marker.active) renderer.play(ctx.scene, marker, profile, 'idle');
    ctx.tweens.killTweensOf(progressHolder);
    ctx.tweens.killTweensOf(disintegrateHolder);
    if (shaderObj.active) shaderObj.destroy();
  });

  // --- Apply tint for dimensional shift feel ---
  marker.setTint(HIDDEN_BUFF_TINT_COLOR);

  // --- Phase 1: Disintegrate (character fades out, fragments scatter outward) ---
  ctx.scene.time.delayedCall(HIDDEN_BUFF_DISSOLVE_START_DELAY, () => {
    // Character alpha: fade out (1→0)
    ctx.tweens.add({
      targets: marker,
      alpha: { from: 1, to: 0 },
      duration: HIDDEN_BUFF_DISSOLVE_DURATION,
      ease: 'Sine.easeIn',
    });

    // Shader progress: fragment scatter effect appears
    ctx.tweens.add({
      targets: progressHolder,
      value: 1,
      duration: HIDDEN_BUFF_DISSOLVE_DURATION,
      ease: 'Sine.easeIn',
    });

    // Disintegrate scatter: fragments fly outward
    ctx.tweens.add({
      targets: disintegrateHolder,
      value: 1,
      duration: HIDDEN_BUFF_DISSOLVE_DURATION,
      ease: 'Quad.easeIn',
    });

    ctx.scene.cameras.main.shake(200, 0.003);
  });

  // --- Phase 3: Reassembly (character fades in, fragments converge inward) ---
  ctx.scene.time.delayedCall(HIDDEN_BUFF_RECOVERY_START_DELAY, () => {
    // Scatter converges inward: fragments fly back
    ctx.tweens.add({
      targets: disintegrateHolder,
      value: 0,
      duration: HIDDEN_BUFF_RECOVERY_DURATION,
      ease: 'Sine.easeOut',
    });

    // Recovery: shader progress 1→0 (void fades away)
    ctx.tweens.add({
      targets: progressHolder,
      value: 0,
      duration: HIDDEN_BUFF_RECOVERY_DURATION,
      ease: 'Sine.easeOut',
    });

    // Character alpha: fade in (0→1)
    ctx.tweens.add({
      targets: marker,
      alpha: { from: 0, to: 1 },
      duration: HIDDEN_BUFF_RECOVERY_DURATION,
      ease: 'Sine.easeOut',
      onComplete: () => {
        marker.clearTint();
        marker.setAlpha(1);
        renderer.play(ctx.scene, marker, profile, 'idle');
        marker.setDepth(originalDepth);
        if (shaderObj.active) shaderObj.destroy();
        if (cleanupTracker.active) cleanupTracker.destroy();
      },
    });
  });
}

/**
 * Shuffle an array in-place using Fisher-Yates algorithm.
 */
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Pick a random icon key from a weapon category.
 */
function randomWeaponIconKey(category: string): string {
  const icons = WEAPON_ICON_KEYS[category as keyof typeof WEAPON_ICON_KEYS];
  if (!icons || icons.length === 0) return '';
  const iconName = icons[Math.floor(Math.random() * icons.length)];
  return `weapon-${category}-${iconName}`;
}

/**
 * Play the relic chest animation: chest drops from above to the player's front,
 * explodes (smaller scale), then weapons fly out in parabolic arcs and land
 * near the player's feet level, before sparkling and fading away.
 */
export function playRelicAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) return;

  // Chest lands slightly above feet level (visual centering), offset to the right
  const feetY = marker.y + CHARACTER_HALF_HEIGHT;
  const chestTargetX = marker.x + RELIC_CHEST_OFFSET_X;
  const chestTargetY = feetY + RELIC_CHEST_LAND_OFFSET_Y; // slightly above feet for better visual
  const chestStartY = chestTargetY + RELIC_CHEST_START_OFFSET_Y; // start above (drops down)

  // --- Phase 1: Chest drops from above (scale 0→1.5, y from above to landing) ---
  const chestSprite = ctx.scene.add.image(chestTargetX, chestStartY, RELIC_TEXTURE_KEY);
  chestSprite.setOrigin(0.5, 0.5);
  chestSprite.setScale(0);
  chestSprite.setAlpha(0);
  chestSprite.setDepth(LAYER_FULLSCREEN_EFFECT);

  ctx.orchestrator.registerCleanupOnTimer(chestSprite, RELIC_TOTAL_EFFECT_MS + 500);

  ctx.scene.time.delayedCall(RELIC_CHEST_APPEAR_DELAY, () => {
    ctx.tweens.add({
      targets: chestSprite,
      scaleX: { from: 0, to: 1.5 },
      scaleY: { from: 0, to: 1.5 },
      alpha: { from: 0, to: 1 },
      y: { from: chestStartY, to: chestTargetY },
      duration: RELIC_CHEST_APPEAR_DURATION,
      ease: 'Bounce.easeOut', // bouncing landing feel
    });
  });

  // --- Phase 2: Chest fade out + Bomb explosion (smaller scale, at chest position) ---
  ctx.scene.time.delayedCall(RELIC_BOMB_START_DELAY, () => {
    // Fade out chest
    ctx.tweens.add({
      targets: chestSprite,
      alpha: { from: 1, to: 0 },
      duration: 200,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (chestSprite.active) chestSprite.destroy();
      },
    });

    // Play bomb explosion spritesheet (smaller scale to just cover the chest)
    const bombSprite = ctx.scene.add.sprite(chestTargetX, chestTargetY, RELIC_BOMB_TEXTURE_KEY);
    bombSprite.setScale(RELIC_BOMB_SCALE);
    bombSprite.setOrigin(0.5, 0.5);
    bombSprite.setDepth(LAYER_FULLSCREEN_EFFECT);
    bombSprite.setTint(0xffd700); // golden tint
    bombSprite.play(RELIC_BOMB_ANIMATION_KEY);

    ctx.orchestrator.registerCleanupOnAnimationComplete(bombSprite);

    ctx.scene.cameras.main.shake(300, 0.004);
  });

  // --- Phase 3: Weapon parabolic fly-out (rise then fall to feet) ---
  ctx.scene.time.delayedCall(RELIC_WEAPON_FLY_DELAY, () => {
    const categories = shuffleArray([...WEAPON_CATEGORIES]).slice(0, RELIC_WEAPON_COUNT);
    const weaponSprites: Phaser.GameObjects.Image[] = [];

    categories.forEach((category, i) => {
      const textureKey = randomWeaponIconKey(category);
      if (!textureKey) return;

      const landingX = chestTargetX + RELIC_WEAPON_LANDING_OFFSETS[i];
      const peakHeight = RELIC_WEAPON_PEAK_HEIGHT_MIN + Math.random() * (RELIC_WEAPON_PEAK_HEIGHT_MAX - RELIC_WEAPON_PEAK_HEIGHT_MIN);
      const peakY = chestTargetY - peakHeight;

      const weaponSprite = ctx.scene.add.image(chestTargetX, chestTargetY, textureKey);
      weaponSprite.setScale(0);
      weaponSprite.setAlpha(0);
      weaponSprite.setOrigin(0.5, 0.5);
      weaponSprite.setDepth(LAYER_FULLSCREEN_EFFECT);
      weaponSprites.push(weaponSprite);

      // Quick appear
      ctx.tweens.add({
        targets: weaponSprite,
        scaleX: { from: 0, to: 0.8 },
        scaleY: { from: 0, to: 0.8 },
        alpha: { from: 0, to: 1 },
        duration: 100,
      });

      // X-axis: horizontal movement to landing position (full duration)
      ctx.tweens.add({
        targets: weaponSprite,
        x: landingX,
        duration: RELIC_WEAPON_FLY_DURATION,
        ease: 'Sine.easeInOut',
      });

      // Y-axis rise phase: fly upward (decelerating)
      ctx.tweens.add({
        targets: weaponSprite,
        y: peakY,
        duration: 300,
        ease: 'Quad.easeOut',
      });

      // Y-axis fall phase: fall back down to landing level (accelerating, delayed after rise)
      ctx.tweens.add({
        targets: weaponSprite,
        y: feetY + RELIC_WEAPON_LAND_Y_OFFSET, // land slightly above feet height
        delay: 300,
        duration: 400,
        ease: 'Quad.easeIn',
      });
    });

    // --- Phase 4: Weapons sparkle + fade out (after landing and staying briefly) ---
    ctx.scene.time.delayedCall(RELIC_WEAPON_DISAPPEAR_DELAY - RELIC_WEAPON_FLY_DELAY, () => {
      weaponSprites.forEach((sprite) => {
        // Golden sparkle tint
        sprite.setTint(0xffd700);

        ctx.tweens.add({
          targets: sprite,
          alpha: { from: 1, to: 0 },
          scaleX: { from: 0.8, to: 1.2 },
          scaleY: { from: 0.8, to: 1.2 },
          duration: RELIC_WEAPON_DISAPPEAR_DURATION,
          ease: 'Sine.easeOut',
          onComplete: () => {
            if (sprite.active) sprite.destroy();
          },
        });
      });
    });
  });
}
