import * as Phaser from 'phaser';
import type { LogEntry, Player } from '../../types/protocol';
import type { LogEntryAnimationContext } from '../logEntryAnimationPolicy';
import type { CharacterRenderOptions, CharacterRenderProfile } from '../characterRenderConfig';
import {
  getCharacterRenderer,
  getCharacterEffectOffsetY,
  getCharacterOffsetY,
  getAnimationKey,
  resolveCharacterProfile,
} from '../characterRenderConfig';
import { isBossPlayer } from '../bossVisualConfig';
import { getMetadataNumber, describeLogEntryEffect } from '../logEntryPlayback';
import { useGameStore } from '../../store/gameStore';
import { LAYER_EFFECT_BASE, LAYER_EFFECT_TEXT_BASE, worldDepth, LAYER_CHARACTER_BASE } from '../renderLayers';
import { GAME_FONT_FAMILY, RESPAWN_TEXTURE_KEY, RESPAWN_ANIMATION_KEY, LP_ADD_TEXTURE_KEY, LP_ADD_ANIMATION_KEY, LP_MINUS_TEXTURE_KEY, LP_MINUS_ANIMATION_KEY } from '../boardConstants';
import type { BoardAnimationContext } from './eventAnimations';
import { playBossProfileAnimation, isBossReflectDamage, playBossReflectAnimation } from './bossAnimations';

// --- Helper functions ---

function resolveCharacterProfileForPlayer(
  player: Player,
  players: Player[],
  characterRenderOptions?: CharacterRenderOptions
): CharacterRenderProfile {
  const order = players.indexOf(player);
  return resolveCharacterProfile(player, order, characterRenderOptions);
}

function resolveCharacterProfileFromMarker(
  playerId: string,
  players: Player[],
  characterRenderOptions?: CharacterRenderOptions
): CharacterRenderProfile {
  const player = players.find((p) => p.player_id === playerId);
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
    ? resolveCharacterProfileFromMarker(resolvedPlayerId, ctx.players, ctx.characterRenderOptions)
    : null;
  return {
    x: marker.x,
    y: marker.y + (profile ? getCharacterEffectOffsetY(profile) : 0),
  };
}

export function shouldSuppressSettlementEffect(entry: LogEntry, settlementPlayer?: Player | null): boolean {
  if (!settlementPlayer || entry.target !== settlementPlayer.player_id) return false;

  return [
    'damage',
    'heal',
    'fell_down',
    'modify_lp',
    'add_buff',
    'remove_buff',
  ].includes(entry.action_type);
}

// --- Character animation functions ---

// Buff change animation: ring glow, marker pulse, and floating text
export function playBuffChangeAnimation(
  ctx: BoardAnimationContext,
  context: LogEntryAnimationContext,
  followPlayerId?: string | null,
  settlementPlayer?: Player | null
): void {
  const { entry } = context;
  if (shouldSuppressSettlementEffect(entry, settlementPlayer)) return;

  const marker = ctx.playerMarkers.get(entry.target) ?? ctx.playerMarkers.get(followPlayerId || '');
  if (!marker) return;

  const effect = describeLogEntryEffect(entry, useGameStore.getState().definitions);
  const point = getMarkerEffectPoint(marker, ctx, entry.target);
  const x = point.x;
  const y = point.y;

  // Ring glow
  const ring = ctx.scene.add.circle(x, y, 24, effect.color, 0.12);
  ring.setStrokeStyle(4, effect.color, 1);
  ring.setDepth(worldDepth(LAYER_EFFECT_BASE, y));

  // Marker pulse (shrink then restore, more subtle than damage shake)
  ctx.tweens.add({
    targets: marker,
    scale: 0.92,
    duration: 140,
    yoyo: true,
    repeat: 1,
    ease: 'Sine.easeInOut',
  });

  // Ring expand and fade
  ctx.tweens.add({
    targets: ring,
    scale: 2.2,
    alpha: 0,
    duration: 1000,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });

  // Floating text (longer duration than before)
  const text = ctx.scene.add.text(x, y - 42, effect.label, {
    fontFamily: GAME_FONT_FAMILY,
    fontSize: '22px',
    fontStyle: 'bold',
    color: effect.textColor,
    align: 'center',
    stroke: '#0b1020',
    strokeThickness: 5,
  });
  text.setOrigin(0.5, 0.5);
  text.setDepth(worldDepth(LAYER_EFFECT_TEXT_BASE, y));

  ctx.tweens.add({
    targets: text,
    y: y - 88,
    alpha: 0,
    scale: 1.15,
    duration: 1200,
    ease: 'Cubic.easeOut',
    onComplete: () => text.destroy(),
  });
}

export function playGenericLogEntryEffect(
  ctx: BoardAnimationContext,
  context: LogEntryAnimationContext,
  followPlayerId?: string | null,
  settlementPlayer?: Player | null
): void {
  const { entry } = context;

  if (shouldSuppressSettlementEffect(entry, settlementPlayer)) return;

  const marker = ctx.playerMarkers.get(entry.target) ?? ctx.playerMarkers.get(followPlayerId || '');
  if (!marker) return;

  const effect = describeLogEntryEffect(entry, useGameStore.getState().definitions);
  const point = getMarkerEffectPoint(marker, ctx, entry.target);
  const x = point.x;
  const y = point.y;

  const ring = ctx.scene.add.circle(x, y, 24, effect.color, 0.12);
  ring.setStrokeStyle(4, effect.color, 1);
  ring.setDepth(worldDepth(LAYER_EFFECT_BASE, y));

  const text = ctx.scene.add.text(x, y - 42, effect.label, {
    fontFamily: GAME_FONT_FAMILY,
    fontSize: '22px',
    fontStyle: 'bold',
    color: effect.textColor,
    align: 'center',
    stroke: '#0b1020',
    strokeThickness: 5,
  });
  text.setOrigin(0.5, 0.5);
  text.setDepth(worldDepth(LAYER_EFFECT_TEXT_BASE, y));

  ctx.tweens.add({
    targets: marker,
    scale: 0.9,
    duration: 140,
    yoyo: true,
    repeat: 1,
    ease: 'Sine.easeInOut',
  });

  ctx.tweens.add({
    targets: ring,
    scale: 2.2,
    alpha: 0,
    duration: 900,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });

  ctx.tweens.add({
    targets: text,
    y: y - 88,
    alpha: 0,
    scale: 1.15,
    duration: 1050,
    ease: 'Cubic.easeOut',
    onComplete: () => text.destroy(),
  });
}

export function playDamageAnimation(
  ctx: BoardAnimationContext,
  context: LogEntryAnimationContext,
  activeMoveAnimations: Set<string>,
  followPlayerId?: string | null,
  settlementPlayer?: Player | null
): void {
  const { entry } = context;
  if (isBossReflectDamage(entry)) {
    playBossReflectAnimation(ctx, context);
  }

  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) {
    playGenericLogEntryEffect(ctx, context, followPlayerId, settlementPlayer);
    return;
  }

  const profile = resolveCharacterProfileFromMarker(entry.target, ctx.players, ctx.characterRenderOptions);
  const renderer = getCharacterRenderer(ctx.characterRenderOptions);

  if (profile.animations.hurt && renderer.hasAnimation?.(ctx.scene, profile, 'hurt')) {
    const hurtAnimationEvent = `animationcomplete-${getAnimationKey(profile, 'hurt')}`;
    marker.removeAllListeners(hurtAnimationEvent);
    renderer.play(ctx.scene, marker, profile, 'hurt');
    marker.once(hurtAnimationEvent, () => {
      const nextState = activeMoveAnimations.has(entry.target) ? 'move' : 'idle';
      renderer.play(ctx.scene, marker, profile, nextState);
    });
  }

  playGenericLogEntryEffect(ctx, context, followPlayerId, settlementPlayer);
}

export function playDeathAnimation(
  ctx: BoardAnimationContext,
  context: LogEntryAnimationContext,
  followPlayerId?: string | null,
  settlementPlayer?: Player | null
): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) {
    playGenericLogEntryEffect(ctx, context, followPlayerId, settlementPlayer);
    return;
  }

  const profile = resolveCharacterProfileFromMarker(entry.target, ctx.players, ctx.characterRenderOptions);
  const renderer = getCharacterRenderer(ctx.characterRenderOptions);
  const targetPlayer = ctx.players.find((player) => player.player_id === entry.target);
  if (
    targetPlayer &&
    isBossPlayer(targetPlayer) &&
    playBossProfileAnimation(
      ctx.scene, marker, targetPlayer.player_id, 'defeated',
      ctx.players, ctx.playerMarkers, ctx.characterRenderOptions, false
    )
  ) {
    playGenericLogEntryEffect(ctx, context, followPlayerId, settlementPlayer);
    return;
  }

  if (profile.animations.dead && renderer.hasAnimation?.(ctx.scene, profile, 'dead')) {
    const deadAnimationEvent = `animationcomplete-${getAnimationKey(profile, 'dead')}`;
    marker.removeAllListeners(deadAnimationEvent);
    renderer.play(ctx.scene, marker, profile, 'dead');
  }

  playGenericLogEntryEffect(ctx, context, followPlayerId, settlementPlayer);
}

export function playRespawnAnimation(
  ctx: BoardAnimationContext,
  context: LogEntryAnimationContext,
  followPlayerId?: string | null,
  settlementPlayer?: Player | null,
  refreshCellMarkerStates?: () => void
): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) {
    playGenericLogEntryEffect(ctx, context, followPlayerId, settlementPlayer);
    return;
  }

  const profile = resolveCharacterProfileFromMarker(entry.target, ctx.players, ctx.characterRenderOptions);
  const renderer = getCharacterRenderer(ctx.characterRenderOptions);
  const checkpointPos = getMetadataNumber(entry.metadata, 'checkpoint_pos');
  const respawnScale = profile.scale ?? 0.65;

  const playRespawnEffectAt = (x: number, y: number, depth: number) => {
    const respawnSprite = ctx.scene.add.sprite(x, y, RESPAWN_TEXTURE_KEY);
    respawnSprite.setScale(2.3);
    respawnSprite.setOrigin(0.5, 0.5);
    respawnSprite.setDepth(depth + 30);
    respawnSprite.play(RESPAWN_ANIMATION_KEY);
    respawnSprite.once('animationcomplete', () => {
      respawnSprite.destroy();
    });
  };

  if (checkpointPos !== null) {
    const checkpointCell = ctx.cellViews.get(checkpointPos);
    if (checkpointCell) {
      const targetPlayer = ctx.players.find((player) => player.player_id === entry.target);
      const playerIndex = ctx.players.findIndex((player) => player.player_id === entry.target);
      const order = playerIndex >= 0 ? playerIndex : 0;
      const offsetX = targetPlayer && isBossPlayer(targetPlayer) ? 0 : (order % 4) * 10 - 15;
      const targetX = checkpointCell.x + offsetX;
      const targetY = checkpointCell.y + getCharacterOffsetY(profile);

      ctx.logDrivenPositions.set(entry.target, checkpointPos);
      refreshCellMarkerStates?.();

      ctx.tweens.killTweensOf(marker);
      ctx.tweens.add({
        targets: marker,
        alpha: 0,
        duration: 120,
        ease: 'Sine.easeIn',
        onComplete: () => {
          marker.setOrigin(profile.originX ?? 0.5, profile.originY ?? 0.5);
          marker.setPosition(targetX, targetY);
          marker.setDepth(worldDepth(LAYER_CHARACTER_BASE, targetY));
          marker.setScale(respawnScale);
          marker.setAlpha(1);
          renderer.play(ctx.scene, marker, profile, 'idle');
          playRespawnEffectAt(targetX, targetY, marker.depth);
          playGenericLogEntryEffect(ctx, context, followPlayerId, settlementPlayer);
        },
      });
      return;
    }
  }

  marker.setOrigin(profile.originX ?? 0.5, profile.originY ?? 0.5);
  renderer.play(ctx.scene, marker, profile, 'idle');
  marker.setScale(respawnScale);
  playRespawnEffectAt(marker.x, marker.y, marker.depth);

  playGenericLogEntryEffect(ctx, context, followPlayerId, settlementPlayer);
}

export function playHealAnimation(
  ctx: BoardAnimationContext,
  context: LogEntryAnimationContext,
  followPlayerId?: string | null,
  settlementPlayer?: Player | null
): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) {
    playGenericLogEntryEffect(ctx, context, followPlayerId, settlementPlayer);
    return;
  }

  const x = marker.x;
  const y = marker.y;

  const healSprite = ctx.scene.add.sprite(x, y, 'heal-effect');
  healSprite.setScale(1.5);
  healSprite.setOrigin(0.5, 0.5);
  healSprite.setDepth(worldDepth(LAYER_EFFECT_BASE, y));
  healSprite.play('heal_anim');

  healSprite.on('animationcomplete', () => {
    healSprite.destroy();
  });

  const effect = describeLogEntryEffect(entry, useGameStore.getState().definitions);
  const text = ctx.scene.add.text(x, y - 42, effect.label, {
    fontFamily: GAME_FONT_FAMILY,
    fontSize: '22px',
    fontStyle: 'bold',
    color: effect.textColor,
    align: 'center',
    stroke: '#0b1020',
    strokeThickness: 5,
  });
  text.setOrigin(0.5, 0.5);
  text.setDepth(worldDepth(LAYER_EFFECT_TEXT_BASE, y));

  ctx.tweens.add({
    targets: text,
    y: y - 88,
    alpha: 0,
    scale: 1.15,
    duration: 1050,
    ease: 'Cubic.easeOut',
    onComplete: () => text.destroy(),
  });
}

export function playModifyLpAnimation(
  ctx: BoardAnimationContext,
  context: LogEntryAnimationContext,
  followPlayerId?: string | null,
  settlementPlayer?: Player | null
): void {
  const { entry } = context;
  const lpChange = getMetadataNumber(entry.metadata, 'lp_change') ?? 0;

  if (lpChange > 0) {
    playLpAddEffect(ctx, context, followPlayerId, settlementPlayer);
    return;
  }

  if (lpChange < 0) {
    playLpMinusEffect(ctx, context, followPlayerId, settlementPlayer);
    return;
  }

  playGenericLogEntryEffect(ctx, context, followPlayerId, settlementPlayer);
}

export function playLpAddEffect(
  ctx: BoardAnimationContext,
  context: LogEntryAnimationContext,
  followPlayerId?: string | null,
  settlementPlayer?: Player | null
): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) {
    playGenericLogEntryEffect(ctx, context, followPlayerId, settlementPlayer);
    return;
  }

  const x = marker.x;
  const y = marker.y;

  const lpAddSprite = ctx.scene.add.sprite(x, y, LP_ADD_TEXTURE_KEY);
  lpAddSprite.setScale(2.0);
  lpAddSprite.setOrigin(0.5, 0.5);
  lpAddSprite.setDepth(worldDepth(LAYER_EFFECT_BASE, y));
  lpAddSprite.play(LP_ADD_ANIMATION_KEY);

  lpAddSprite.once('animationcomplete', () => {
    lpAddSprite.destroy();
  });

  const effect = describeLogEntryEffect(entry, useGameStore.getState().definitions);
  const text = ctx.scene.add.text(x, y - 42, effect.label, {
    fontFamily: GAME_FONT_FAMILY,
    fontSize: '22px',
    fontStyle: 'bold',
    color: effect.textColor,
    align: 'center',
    stroke: '#0b1020',
    strokeThickness: 5,
  });
  text.setOrigin(0.5, 0.5);
  text.setDepth(worldDepth(LAYER_EFFECT_TEXT_BASE, y));

  ctx.tweens.add({
    targets: text,
    y: y - 88,
    alpha: 0,
    scale: 1.15,
    duration: 1050,
    ease: 'Cubic.easeOut',
    onComplete: () => text.destroy(),
  });
}

export function playLpMinusEffect(
  ctx: BoardAnimationContext,
  context: LogEntryAnimationContext,
  followPlayerId?: string | null,
  settlementPlayer?: Player | null
): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) {
    playGenericLogEntryEffect(ctx, context, followPlayerId, settlementPlayer);
    return;
  }

  const x = marker.x;
  const y = marker.y;

  const lpMinusSprite = ctx.scene.add.sprite(x, y, LP_MINUS_TEXTURE_KEY);
  lpMinusSprite.setScale(2.0);
  lpMinusSprite.setOrigin(0.5, 0.5);
  lpMinusSprite.setDepth(worldDepth(LAYER_EFFECT_BASE, y));
  lpMinusSprite.play(LP_MINUS_ANIMATION_KEY);

  lpMinusSprite.once('animationcomplete', () => {
    lpMinusSprite.destroy();
  });

  const effect = describeLogEntryEffect(entry, useGameStore.getState().definitions);
  const text = ctx.scene.add.text(x, y - 42, effect.label, {
    fontFamily: GAME_FONT_FAMILY,
    fontSize: '22px',
    fontStyle: 'bold',
    color: effect.textColor,
    align: 'center',
    stroke: '#0b1020',
    strokeThickness: 5,
  });
  text.setOrigin(0.5, 0.5);
  text.setDepth(worldDepth(LAYER_EFFECT_TEXT_BASE, y));

  ctx.tweens.add({
    targets: text,
    y: y - 88,
    alpha: 0,
    scale: 1.15,
    duration: 1050,
    ease: 'Cubic.easeOut',
    onComplete: () => text.destroy(),
  });
}