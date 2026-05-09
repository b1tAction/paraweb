import * as Phaser from 'phaser';
import type { LogEntry, Player } from '../../types/protocol';
import type { LogEntryAnimationContext } from '../logEntryAnimationPolicy';
import type { CharacterRenderOptions, CharacterRenderProfile } from '../characterRenderConfig';
import {
  getCharacterRenderer,
  getCharacterEffectOffsetY,
  getAnimationKey,
  resolveCharacterProfile,
  type CharacterAnimationState,
} from '../characterRenderConfig';
import { isBossPlayer } from '../bossVisualConfig';
import { getMetadataString, getMetadataNumber, getMetadataBoolean } from '../logEntryPlayback';
import { LAYER_EFFECT_BASE, LAYER_SHADER_OVERLAY, LAYER_BOSS_BATTLE_CHARACTER, worldDepth } from '../renderLayers';
import { GAME_FONT_FAMILY, CHARACTER_HALF_HEIGHT, PROJECTILE_CHARGE_ANIMATION_KEY, PROJECTILE_SPEAR_ANIMATION_KEY, PROJECTILE_BLACK_CHARGE_ANIMATION_KEY, PROJECTILE_BLUE_CHARGE_ANIMATION_KEY, PROJECTILE_BLACK_CHARGE_SCALE, PROJECTILE_BLUE_CHARGE_SCALE, PROJECTILE_FLY_DURATION_MS, BOSS_BATTLE_DISSOLVE_DURATION, BOSS_BATTLE_HOLD_DURATION, BOSS_BATTLE_RECOVERY_DURATION } from '../boardConstants';
import { BOSS_BATTLE_DISSOLVE_SHADER_NAME, BOSS_BATTLE_DISSOLVE_FRAGMENT_SOURCE } from '../shaders/bossBattleDissolve';
import type { BoardAnimationContext } from './eventAnimations';

// Map profile id to projectile animation key and scale for boss damage crit
const PROFILE_ID_TO_PROJECTILE: Record<string, { animKey: string; scale: number }> = {
  green: { animKey: PROJECTILE_CHARGE_ANIMATION_KEY, scale: 1.5 },
  red: { animKey: PROJECTILE_SPEAR_ANIMATION_KEY, scale: 1.5 },
  white: { animKey: PROJECTILE_BLUE_CHARGE_ANIMATION_KEY, scale: PROJECTILE_BLUE_CHARGE_SCALE },
  black: { animKey: PROJECTILE_BLACK_CHARGE_ANIMATION_KEY, scale: PROJECTILE_BLACK_CHARGE_SCALE },
};

// --- Helper functions ---

export function getBossPlayer(players: Player[]): Player | null {
  return players.find(isBossPlayer) ?? null;
}

export function getBossMarker(players: Player[], playerMarkers: Map<string, Phaser.GameObjects.Sprite>): Phaser.GameObjects.Sprite | null {
  const bossPlayer = getBossPlayer(players);
  return bossPlayer ? playerMarkers.get(bossPlayer.player_id) ?? null : null;
}

export function getBossTargetIds(entry: LogEntry): string[] {
  const rawTargets = entry.metadata?.targets;
  if (Array.isArray(rawTargets)) {
    return rawTargets
      .map((target) => String(target).trim())
      .filter(Boolean);
  }

  return getMetadataString(entry.metadata, 'targets')
    .split(',')
    .map((target) => target.trim())
    .filter(Boolean);
}

function resolveCharacterProfileForPlayer(
  player: Player,
  players: Player[],
  characterRenderOptions?: CharacterRenderOptions
): CharacterRenderProfile {
  const order = players.indexOf(player);
  return resolveCharacterProfile(player, order, characterRenderOptions);
}

function resolveCharacterProfileFromMarker(
  marker: Phaser.GameObjects.Sprite,
  players: Player[],
  playerMarkers: Map<string, Phaser.GameObjects.Sprite>,
  characterRenderOptions?: CharacterRenderOptions
): CharacterRenderProfile {
  const player = players.find((p) => playerMarkers.get(p.player_id) === marker);
  if (!player) return resolveCharacterProfileForPlayer(players[0], players, characterRenderOptions);
  return resolveCharacterProfileForPlayer(player, players, characterRenderOptions);
}

function getPlayerIdForMarker(
  marker: Phaser.GameObjects.Sprite,
  players: Player[],
  playerMarkers: Map<string, Phaser.GameObjects.Sprite>
): string | undefined {
  return players.find((player) => playerMarkers.get(player.player_id) === marker)?.player_id;
}

function getMarkerEffectPoint(
  marker: Phaser.GameObjects.Sprite,
  ctx: BoardAnimationContext,
  playerId?: string
): { x: number; y: number } {
  const resolvedPlayerId = playerId ?? getPlayerIdForMarker(marker, ctx.players, ctx.playerMarkers);
  const profile = resolvedPlayerId
    ? resolveCharacterProfileFromMarker(marker, ctx.players, ctx.playerMarkers, ctx.characterRenderOptions)
    : null;
  return {
    x: marker.x,
    y: marker.y + (profile ? getCharacterEffectOffsetY(profile) : 0),
  };
}

export function playBossProfileAnimation(
  scene: Phaser.Scene,
  marker: Phaser.GameObjects.Sprite,
  _playerId: string,
  state: CharacterAnimationState,
  players: Player[],
  playerMarkers: Map<string, Phaser.GameObjects.Sprite>,
  characterRenderOptions?: CharacterRenderOptions,
  returnToIdle = true
): boolean {
  const profile = resolveCharacterProfileFromMarker(marker, players, playerMarkers, characterRenderOptions);
  const renderer = getCharacterRenderer(characterRenderOptions);

  if (!profile.animations[state] || !renderer.hasAnimation?.(scene, profile, state)) return false;

  const animationEvent = `animationcomplete-${getAnimationKey(profile, state)}`;
  marker.removeAllListeners(animationEvent);
  renderer.play(scene, marker, profile, state);

  if (returnToIdle) {
    marker.once(animationEvent, () => {
      renderer.play(scene, marker, profile, 'idle');
    });
  }

  return true;
}

// --- Boss battle dissolve wrapper ---

// Edge color presets for different boss action types
const BOSS_EDGE_COLOR_RED: [number, number, number] = [0.9, 0.1, 0.05];
const BOSS_EDGE_COLOR_PURPLE: [number, number, number] = [0.5, 0.15, 0.7];

/**
 * Play the boss battle dissolve animation: a full-screen shader overlay
 * that expands outward from the center position. Preserved character markers
 * (and their name labels) are raised above the overlay to remain visible
 * in the "other space." After dissolve completes, the onDissolveComplete
 * callback fires to play boss-specific effects. The overlay stays at
 * progress=1 during the entire effects phase (black background), then
 * recovers and marker depths are restored.
 */
function playBossBattleDissolveAnimation(
  ctx: BoardAnimationContext,
  centerMarker: Phaser.GameObjects.Sprite,
  preservedPlayerIds: string[],
  onDissolveComplete: () => void,
  effectsDurationMs: number,
  edgeColor: [number, number, number] = BOSS_EDGE_COLOR_RED
): void {
  const cam = ctx.scene.cameras.main;
  const zoom = cam.zoom || 1;
  const screenCenterX = cam.width / 2;
  const screenCenterY = cam.height / 2;
  const worldX = (screenCenterX - cam.centerX) / zoom + cam.centerX;
  const worldY = (screenCenterY - cam.centerY) / zoom + cam.centerY;
  const worldWidth = cam.width / zoom;
  const worldHeight = cam.height / zoom;

  // Compute center marker's normalized viewport position for uCenter.
  // If centerMarker is outside the camera viewport (e.g. player on a distant
  // part of the map), uCenter would fall outside [0,1] range, causing the
  // dissolve expansion to never reach all viewport pixels even at progress=1.
  // Fallback to viewport center (0.5, 0.5) when marker is off-screen so the
  // shader always covers the entire viewport.
  const screenX = (centerMarker.x - cam.worldView.x) * zoom;
  const screenY = (centerMarker.y - cam.worldView.y) * zoom;
  const isOffScreen = screenX < 0 || screenX > cam.width || screenY < 0 || screenY > cam.height;
  const uCenterX = isOffScreen ? 0.5 : screenX / cam.width;
  const uCenterY = isOffScreen ? 0.5 : 1.0 - screenY / cam.height;

  const progressHolder = { value: 0 };
  const shaderObj = ctx.scene.add.shader(
    {
      name: BOSS_BATTLE_DISSOLVE_SHADER_NAME,
      fragmentSource: BOSS_BATTLE_DISSOLVE_FRAGMENT_SOURCE,
      setupUniforms: (setUniform: (name: string, value: any) => void) => {
        setUniform('uProgress', progressHolder.value);
        setUniform('uTime', ctx.scene.time.now / 1000);
        setUniform('uResolution', [cam.width, cam.height]);
        setUniform('uCenter', [uCenterX, uCenterY]);
        setUniform('uEdgeColor', edgeColor);
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

  // --- Raise preserved markers above overlay ---
  // Only preservedPlayerIds markers are raised; other characters remain
  // hidden behind the shader overlay (part of the "other space" visual).
  // Use reference counting on marker data to prevent concurrent animations
  // from overwriting the true original depth.
  preservedPlayerIds.forEach((playerId) => {
    const marker = ctx.playerMarkers.get(playerId);
    if (marker) {
      const dissolveCount = marker.getData('bossBattleDissolveCount') || 0;
      if (dissolveCount === 0) {
        // Only record true original depth on first dissolve entry
        marker.setData('bossBattleOriginalDepth', marker.depth);
      }
      marker.setData('bossBattleDissolveCount', dissolveCount + 1);
      marker.setDepth(LAYER_BOSS_BATTLE_CHARACTER);
      marker.setData('bossBattleDissolve', true);
    }
  });

  // --- Cleanup tracker for interruption safety ---
  const cleanupTracker = ctx.scene.add.container(0, 0);
  const totalDuration = BOSS_BATTLE_DISSOLVE_DURATION + BOSS_BATTLE_HOLD_DURATION + effectsDurationMs + BOSS_BATTLE_RECOVERY_DURATION + 500;
  ctx.orchestrator.registerCleanupOnTimer(cleanupTracker, totalDuration);
  ctx.orchestrator.registerCleanupOnTimer(shaderObj, totalDuration);

  cleanupTracker.once('destroy', () => {
    // Decrement reference count; only restore depth when all animations finish
    preservedPlayerIds.forEach((playerId) => {
      const marker = ctx.playerMarkers.get(playerId);
      if (marker && marker.active) {
        const count = (marker.getData('bossBattleDissolveCount') || 1) - 1;
        marker.setData('bossBattleDissolveCount', Math.max(0, count));
        if (count <= 0) {
          const origDepth = marker.getData('bossBattleOriginalDepth');
          if (origDepth !== undefined) {
            marker.setDepth(origDepth);
          }
          marker.setData('bossBattleDissolve', false);
          marker.setData('bossBattleOriginalDepth', undefined);
        }
      }
    });
    ctx.tweens.killTweensOf(progressHolder);
    if (shaderObj.active) shaderObj.destroy();
  });

  // --- Phase 1: Dissolve (progress 0→1) ---
  ctx.tweens.add({
    targets: progressHolder,
    value: 1,
    duration: BOSS_BATTLE_DISSOLVE_DURATION,
    ease: 'Sine.easeIn',
  });

  ctx.scene.cameras.main.shake(150, 0.003);

  // --- Phase 2: Brief hold then fire effects callback ---
  ctx.scene.time.delayedCall(BOSS_BATTLE_DISSOLVE_DURATION + BOSS_BATTLE_HOLD_DURATION, () => {
    if (!shaderObj.active) return;
    onDissolveComplete();
  });

  // --- Phase 3: Recovery (progress 1→0) ---
  // Recovery starts ONLY after effects are done, keeping the background
  // fully black during the entire effects phase (like lost_way).
  ctx.scene.time.delayedCall(BOSS_BATTLE_DISSOLVE_DURATION + BOSS_BATTLE_HOLD_DURATION + effectsDurationMs, () => {
    if (!shaderObj.active) return;
    ctx.tweens.add({
      targets: progressHolder,
      value: 0,
      duration: BOSS_BATTLE_RECOVERY_DURATION,
      ease: 'Sine.easeOut',
      onComplete: () => {
        // Destruction triggers cleanupTracker.once('destroy') which handles
        // reference-counted depth restoration — no duplicate logic here.
        if (shaderObj.active) shaderObj.destroy();
        if (cleanupTracker.active) cleanupTracker.destroy();
      },
    });
  });
}

// --- Boss animation helper functions (with depthBase for dissolve mode) ---

function playProjectileFly(
  ctx: BoardAnimationContext,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  animKey: string,
  scale: number,
  depthBase = LAYER_EFFECT_BASE
): void {
  const projectile = ctx.scene.add.sprite(fromX, fromY, animKey);
  projectile.setOrigin(0.5, 0.5);
  projectile.setDepth(worldDepth(depthBase, fromY) + 50);
  projectile.setScale(scale);
  projectile.play(animKey);

  ctx.tweens.add({
    targets: projectile,
    x: toX,
    y: toY,
    duration: PROJECTILE_FLY_DURATION_MS,
    ease: 'Quad.easeIn',
    onComplete: () => projectile.destroy(),
  });
}

export function playBossPulse(
  ctx: BoardAnimationContext,
  marker: Phaser.GameObjects.Sprite,
  label: string,
  color: number,
  textColor = '#ffebee',
  scale = 2.2,
  playerId?: string,
  depthBase = LAYER_EFFECT_BASE
): void {
  const { x, y } = getMarkerEffectPoint(marker, ctx, playerId);

  const ring = ctx.scene.add.circle(x, y, 28, color, 0.14);
  ring.setStrokeStyle(4, color, 1);
  ring.setDepth(worldDepth(depthBase, y));

  const text = ctx.scene.add.text(x, y - 46, label, {
    fontFamily: GAME_FONT_FAMILY,
    fontSize: '22px',
    fontStyle: 'bold',
    color: textColor,
    align: 'center',
    stroke: '#0b1020',
    strokeThickness: 5,
  });
  text.setOrigin(0.5, 0.5);
  text.setDepth(worldDepth(depthBase + 100, y));

  ctx.tweens.add({
    targets: ring,
    scale,
    alpha: 0,
    duration: 900,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });

  ctx.tweens.add({
    targets: text,
    y: y - 92,
    alpha: 0,
    scale: 1.08,
    duration: 1050,
    ease: 'Cubic.easeOut',
    onComplete: () => text.destroy(),
  });
}

export function playBossLineEffect(
  ctx: BoardAnimationContext,
  fromMarker: Phaser.GameObjects.Sprite,
  toMarker: Phaser.GameObjects.Sprite,
  color: number,
  label?: string,
  depthBase = LAYER_EFFECT_BASE
): void {
  const fromPoint = getMarkerEffectPoint(fromMarker, ctx);
  const toPoint = getMarkerEffectPoint(toMarker, ctx);
  const fromX = fromPoint.x;
  const fromY = fromPoint.y - 10;
  const toX = toPoint.x;
  const toY = toPoint.y - 10;
  const depth = worldDepth(depthBase, Math.max(fromMarker.y, toMarker.y)) + 60;

  const line = ctx.scene.add.graphics();
  line.lineStyle(6, color, 0.92);
  line.beginPath();
  line.moveTo(fromX, fromY);
  line.lineTo(toX, toY);
  line.strokePath();
  line.setDepth(depth);

  const impactRing = ctx.scene.add.circle(toPoint.x, toPoint.y, 18, color, 0.12);
  impactRing.setStrokeStyle(3, color, 1);
  impactRing.setDepth(depth + 1);

  const cleanupTargets: Phaser.GameObjects.GameObject[] = [line, impactRing];
  if (label) {
    const text = ctx.scene.add.text((fromX + toX) / 2, (fromY + toY) / 2 - 16, label, {
      fontFamily: GAME_FONT_FAMILY,
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffebee',
      stroke: '#0b1020',
      strokeThickness: 4,
    });
    text.setOrigin(0.5, 0.5);
    text.setDepth(depth + 2);
    cleanupTargets.push(text);
  }

  ctx.tweens.add({
    targets: cleanupTargets,
    alpha: 0,
    duration: 760,
    ease: 'Cubic.easeOut',
    onComplete: () => cleanupTargets.forEach((target) => target.destroy()),
  });
}

export function playBossThornsPulse(
  ctx: BoardAnimationContext,
  marker: Phaser.GameObjects.Sprite,
  depthBase = LAYER_EFFECT_BASE
): void {
  playBossPulse(ctx, marker, 'Boss 荆棘', 0x8e24aa, '#f3e5f5', 2.05, undefined, depthBase);

  const { x: centerX, y: centerY } = getMarkerEffectPoint(marker, ctx);
  const spikes = ctx.scene.add.graphics();
  spikes.lineStyle(4, 0x8e24aa, 0.95);

  for (let index = 0; index < 10; index += 1) {
    const angle = (Math.PI * 2 * index) / 10;
    const innerRadius = 30;
    const outerRadius = 46;
    spikes.beginPath();
    spikes.moveTo(centerX + Math.cos(angle) * innerRadius, centerY + Math.sin(angle) * innerRadius);
    spikes.lineTo(centerX + Math.cos(angle) * outerRadius, centerY + Math.sin(angle) * outerRadius);
    spikes.strokePath();
  }

  spikes.setDepth(worldDepth(depthBase, centerY) + 26);
  ctx.tweens.add({
    targets: spikes,
    alpha: 0,
    duration: 1100,
    ease: 'Cubic.easeOut',
    onComplete: () => spikes.destroy(),
  });
}

export function isBossReflectDamage(entry: LogEntry): boolean {
  return entry.action_type === 'damage' && entry.source === 'buff_thorns';
}

export function playBossThunderFlash(
  ctx: BoardAnimationContext,
  marker: Phaser.GameObjects.Sprite,
  playerId?: string,
  depthBase = LAYER_EFFECT_BASE
): void {
  const { x, y } = getMarkerEffectPoint(marker, ctx, playerId);

  const sprite = ctx.scene.add.sprite(x, y, 'skill-thunder1');
  sprite.setScale(2.0);
  sprite.setOrigin(0.5, 1.0);
  sprite.setDepth(worldDepth(depthBase, y) + 100);
  sprite.play('skill_thunder1_anim');

  sprite.on('animationcomplete', () => {
    sprite.destroy();
  });
}

export function playBossThunderStrike(
  ctx: BoardAnimationContext,
  marker: Phaser.GameObjects.Sprite,
  depthBase = LAYER_EFFECT_BASE
): void {
  const landingX = marker.x;
  const landingY = marker.y + CHARACTER_HALF_HEIGHT;

  const sprite = ctx.scene.add.sprite(landingX, landingY, 'skill-thunder2');
  sprite.setScale(2.0);
  sprite.setOrigin(0.5, 1.0);
  sprite.setDepth(worldDepth(depthBase, landingY) + 100);
  sprite.play('skill_thunder2_anim');

  sprite.on('animationcomplete', () => {
    sprite.destroy();
  });

  // Camera flash and shake
  ctx.scene.cameras.main.flash(300, 255, 255, 200);
  ctx.scene.cameras.main.shake(640, 0.005);
}

// --- Boss effect functions (pure effects, no dissolve) ---
// These are called inside the dissolve wrapper callback,
// using LAYER_BOSS_BATTLE_CHARACTER as depthBase so they
// render above the shader overlay.

function playBossDamageEffects(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const bossPlayer = getBossPlayer(ctx.players);
  const bossMarker = getBossMarker(ctx.players, ctx.playerMarkers);
  if (!bossPlayer || !bossMarker) return;

  const damage = getMetadataNumber(entry.metadata, 'damage') ?? 0;
  const isCrit = getMetadataBoolean(entry.metadata, 'is_crit');
  const remainingHp = getMetadataNumber(entry.metadata, 'boss_remaining_hp');
  const isDefeated = remainingHp !== null ? remainingHp <= 0 : bossPlayer.is_dead || bossPlayer.hp <= 0;
  const color = isCrit ? 0xff1744 : 0xef5350;
  const label = damage > 0 ? `Boss -${damage}${isCrit ? ' CRIT' : ''}` : `Boss 受击${isCrit ? ' CRIT' : ''}`;

  const sourceMarker = ctx.playerMarkers.get(entry.source);
  const depthBase = LAYER_BOSS_BATTLE_CHARACTER;

  if (sourceMarker && sourceMarker !== bossMarker) {
    // Play player attack animation
    const sourcePlayer = ctx.players.find((p) => p.player_id === entry.source);
    const sourceProfile = sourcePlayer
      ? resolveCharacterProfileForPlayer(sourcePlayer, ctx.players, ctx.characterRenderOptions)
      : null;
    const sourceRenderer = getCharacterRenderer(ctx.characterRenderOptions);
    const sourceProfileId = sourceProfile?.id;

    // Face boss direction
    sourceMarker.setFlipX(bossMarker.x < sourceMarker.x);

    if (isCrit && sourceProfile) {
      // Crit: play attack_crit pose then launch projectile
      const attackState: CharacterAnimationState = 'attack_crit';
      const attackAnimEvent = `animationcomplete-${getAnimationKey(sourceProfile, attackState)}`;

      if (sourceProfile.animations[attackState] && sourceRenderer.hasAnimation?.(ctx.scene, sourceProfile, attackState)) {
        sourceMarker.removeAllListeners(attackAnimEvent);
        sourceRenderer.play(ctx.scene, sourceMarker, sourceProfile, attackState);
        sourceMarker.once(attackAnimEvent, () => {
          sourceRenderer.play(ctx.scene, sourceMarker, sourceProfile, 'idle');
        });
      }

      // Launch projectile from source to boss
      const projectileConfig = sourceProfileId ? PROFILE_ID_TO_PROJECTILE[sourceProfileId] : undefined;
      if (projectileConfig) {
        const sourcePoint = getMarkerEffectPoint(sourceMarker, ctx, entry.source);
        const bossPoint = getMarkerEffectPoint(bossMarker, ctx, bossPlayer.player_id);
        playProjectileFly(ctx, sourcePoint.x, sourcePoint.y, bossPoint.x, bossPoint.y, projectileConfig.animKey, projectileConfig.scale, depthBase);
      }
    } else if (sourceProfile) {
      // Normal: random attack_1 or attack_2
      const attackState: CharacterAnimationState = Math.random() < 0.5 ? 'attack_1' : 'attack_2';
      const attackAnimEvent = `animationcomplete-${getAnimationKey(sourceProfile, attackState)}`;

      if (sourceProfile.animations[attackState] && sourceRenderer.hasAnimation?.(ctx.scene, sourceProfile, attackState)) {
        sourceMarker.removeAllListeners(attackAnimEvent);
        sourceRenderer.play(ctx.scene, sourceMarker, sourceProfile, attackState);
        sourceMarker.once(attackAnimEvent, () => {
          sourceRenderer.play(ctx.scene, sourceMarker, sourceProfile, 'idle');
        });
      }
    }

    playBossLineEffect(ctx, sourceMarker, bossMarker, color, isCrit ? 'CRIT' : 'HIT', depthBase);
  }

  playBossProfileAnimation(
    ctx.scene,
    bossMarker,
    bossPlayer.player_id,
    'hurt',
    ctx.players,
    ctx.playerMarkers,
    ctx.characterRenderOptions,
    !isDefeated
  );

  bossMarker.setTint(0xffffff);
  ctx.scene.time.delayedCall(120, () => bossMarker.clearTint());
  playBossPulse(ctx, bossMarker, label, color, '#ffebee', isCrit ? 2.75 : 2.2, bossPlayer.player_id, depthBase);

  if (isCrit) {
    ctx.scene.cameras.main.flash(120, 255, 235, 235);
  }

  if (isDefeated) {
    ctx.scene.time.delayedCall(260, () => {
      const currentBossPlayer = getBossPlayer(ctx.players);
      const currentBossMarker = getBossMarker(ctx.players, ctx.playerMarkers);
      if (!currentBossPlayer || !currentBossMarker) return;

      playBossProfileAnimation(
        ctx.scene, currentBossMarker, currentBossPlayer.player_id, 'defeated',
        ctx.players, ctx.playerMarkers, ctx.characterRenderOptions, false
      );
    });
  }
}

function playBossAttackEffects(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const bossPlayer = getBossPlayer(ctx.players);
  const bossMarker = getBossMarker(ctx.players, ctx.playerMarkers);
  if (!bossPlayer || !bossMarker) return;

  const depthBase = LAYER_BOSS_BATTLE_CHARACTER;
  const targetMarker = ctx.playerMarkers.get(entry.target);
  if (targetMarker) {
    bossMarker.setFlipX(targetMarker.x < bossMarker.x);
  }

  playBossProfileAnimation(
    ctx.scene, bossMarker, bossPlayer.player_id, 'attack',
    ctx.players, ctx.playerMarkers, ctx.characterRenderOptions
  );

  const attackType = getMetadataString(entry.metadata, 'attack_type') || 'normal';
  const isCrit = attackType === 'crit' || getMetadataBoolean(entry.metadata, 'is_crit');
  const color = isCrit ? 0xff1744 : 0xd32f2f;
  playBossPulse(ctx, bossMarker, isCrit ? 'Boss 暴击' : 'Boss 普攻', color, '#ffebee', isCrit ? 2.4 : 2.0, bossPlayer.player_id, depthBase);

  if (targetMarker) {
    playBossLineEffect(ctx, bossMarker, targetMarker, color, isCrit ? 'CRIT' : 'ATTACK', depthBase);
  }
}

function playBossSkillEffects(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const bossPlayer = getBossPlayer(ctx.players);
  const bossMarker = getBossMarker(ctx.players, ctx.playerMarkers);
  if (!bossPlayer || !bossMarker) return;

  const depthBase = LAYER_BOSS_BATTLE_CHARACTER;

  playBossProfileAnimation(
    ctx.scene, bossMarker, bossPlayer.player_id, 'skill_cast',
    ctx.players, ctx.playerMarkers, ctx.characterRenderOptions
  );

  const skillType = getMetadataString(entry.metadata, 'skill_type') || 'skill';
  const targetIds = getBossTargetIds(entry);
  const targetMarkers = targetIds
    .map((targetId) => ctx.playerMarkers.get(targetId))
    .filter((marker): marker is Phaser.GameObjects.Sprite => Boolean(marker));

  switch (skillType) {
    case 'thunder':
      playBossThunderFlash(ctx, bossMarker, bossPlayer.player_id, depthBase);
      // Delay per-player strikes so they start after the boss flash finishes
      ctx.scene.time.delayedCall(500, () => {
        targetIds.forEach((targetId) => {
          const targetMarker = ctx.playerMarkers.get(targetId);
          if (!targetMarker) return;
          playBossThunderStrike(ctx, targetMarker, depthBase);
        });
      });
      break;
    case 'curse':
      playBossPulse(ctx, bossMarker, 'Boss 诅咒', 0x7e57c2, '#f3e5f5', 2.1, bossPlayer.player_id, depthBase);
      targetMarkers.forEach((marker) => playBossPulse(ctx, marker, '诅咒', 0x7e57c2, '#f3e5f5', 1.8, undefined, depthBase));
      break;
    case 'rest':
      playBossPulse(ctx, bossMarker, 'Boss 回复', 0x66bb6a, '#e8f5e9', 2.2, bossPlayer.player_id, depthBase);
      break;
    case 'thorns':
      playBossThornsPulse(ctx, bossMarker, depthBase);
      break;
    default:
      playBossPulse(ctx, bossMarker, `Boss ${skillType}`, 0x90a4ae, '#eceff1', 2.0, bossPlayer.player_id, depthBase);
      break;
  }
}

// --- Boss animation entry points (with dissolve wrapper) ---

export function playBossDamageAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const bossPlayer = getBossPlayer(ctx.players);
  const bossMarker = getBossMarker(ctx.players, ctx.playerMarkers);
  if (!bossPlayer || !bossMarker) return;

  const sourceMarker = ctx.playerMarkers.get(entry.source);
  if (!sourceMarker) {
    // No source marker: skip dissolve, play effects directly
    playBossDamageEffects(ctx, context);
    return;
  }

  // Dissolve from attacker position, preserve attacker and boss
  playBossBattleDissolveAnimation(
    ctx,
    sourceMarker,
    [entry.source, bossPlayer.player_id],
    () => playBossDamageEffects(ctx, context),
    1500,
    BOSS_EDGE_COLOR_RED
  );
}

export function playBossAttackAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const bossPlayer = getBossPlayer(ctx.players);
  const bossMarker = getBossMarker(ctx.players, ctx.playerMarkers);
  if (!bossPlayer || !bossMarker) return;

  const targetMarker = ctx.playerMarkers.get(entry.target);

  // Dissolve from boss position, preserve boss and target
  const preservedIds = targetMarker
    ? [bossPlayer.player_id, entry.target]
    : [bossPlayer.player_id];

  playBossBattleDissolveAnimation(
    ctx,
    bossMarker,
    preservedIds,
    () => playBossAttackEffects(ctx, context),
    1500,
    BOSS_EDGE_COLOR_RED
  );
}

export function playBossSkillAnimation(
  ctx: BoardAnimationContext,
  context: LogEntryAnimationContext
): void {
  const { entry } = context;
  const bossPlayer = getBossPlayer(ctx.players);
  const bossMarker = getBossMarker(ctx.players, ctx.playerMarkers);
  if (!bossPlayer || !bossMarker) return;

  const skillType = getMetadataString(entry.metadata, 'skill_type') || 'skill';

  // Self-targeting skills: only keep boss visible
  // Attack/debuff skills: keep all characters visible (they are all targets)
  const selfTargetingSkills = ['rest', 'thorns'];
  const preservedIds = selfTargetingSkills.includes(skillType)
    ? [bossPlayer.player_id]
    : ctx.players.map((p) => p.player_id);

  const effectsDuration = skillType === 'thunder' ? 2000 : 1500;

  playBossBattleDissolveAnimation(
    ctx,
    bossMarker,
    preservedIds,
    () => playBossSkillEffects(ctx, context),
    effectsDuration,
    BOSS_EDGE_COLOR_PURPLE
  );
}

export function playBossReflectAnimation(ctx: BoardAnimationContext, context: LogEntryAnimationContext): void {
  const { entry } = context;
  const bossMarker = getBossMarker(ctx.players, ctx.playerMarkers);
  const targetMarker = ctx.playerMarkers.get(entry.target);
  if (!bossMarker || !targetMarker) return;

  bossMarker.setFlipX(targetMarker.x < bossMarker.x);
  playBossThornsPulse(ctx, bossMarker);
  playBossLineEffect(ctx, bossMarker, targetMarker, 0x8e24aa, '反刺');
}