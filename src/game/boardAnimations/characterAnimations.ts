import type * as Phaser from 'phaser';
import { useGameStore } from '../../store/gameStore';
import type { LogEntry, Player } from '../../types/protocol';
import {
  GAME_FONT_FAMILY,
  LP_ADD_ANIMATION_KEY,
  LP_ADD_TEXTURE_KEY,
  LP_MINUS_ANIMATION_KEY,
  LP_MINUS_TEXTURE_KEY,
  RESPAWN_ANIMATION_KEY,
  RESPAWN_TEXTURE_KEY,
} from '../boardConstants';
import { isBossPlayer } from '../bossVisualConfig';
import type { CharacterRenderOptions, CharacterRenderProfile } from '../characterRenderConfig';
import {
  getAnimationKey,
  getCharacterEffectOffsetY,
  getCharacterOffsetY,
  getCharacterRenderer,
  resolveCharacterProfile,
} from '../characterRenderConfig';
import type { LogEntryAnimationContext } from '../logEntryAnimationPolicy';
import {
  describeLogEntryEffect,
  FIRST_BUFF_DESCRIPTION_EXTRA_DELAY_MS,
  FIRST_ITEM_DESCRIPTION_EXTRA_DELAY_MS,
  getMetadataNumber,
  getMetadataString,
  markBuffDescriptionSeen,
  markItemDescriptionSeen,
} from '../logEntryPlayback';
import { LAYER_CHARACTER_BASE, LAYER_EFFECT_BASE, LAYER_EFFECT_TEXT_BASE, worldDepth } from '../renderLayers';
import { playPlayerHurtSfx } from '../../utils/characterSfx';
import { isBossReflectDamage, playBossProfileAnimation, playBossReflectAnimation } from './bossAnimations';
import type { BoardAnimationContext } from './eventAnimations';

// --- Helper functions ---

function resolveCharacterProfileForPlayer(
  player: Player,
  players: Player[],
  characterRenderOptions?: CharacterRenderOptions,
): CharacterRenderProfile {
  const order = players.indexOf(player);
  return resolveCharacterProfile(player, order, characterRenderOptions);
}

function resolveCharacterProfileFromMarker(
  playerId: string,
  players: Player[],
  characterRenderOptions?: CharacterRenderOptions,
): CharacterRenderProfile {
  const player = players.find((p) => p.player_id === playerId);
  if (!player) return resolveCharacterProfileForPlayer(players[0], players, characterRenderOptions);
  return resolveCharacterProfileForPlayer(player, players, characterRenderOptions);
}

function getPlayerIdForMarker(
  marker: Phaser.GameObjects.Sprite,
  players: Player[],
  playerMarkers: Map<string, Phaser.GameObjects.Sprite>,
): string | undefined {
  return players.find((player) => playerMarkers.get(player.player_id) === marker)?.player_id;
}

function getMarkerEffectPoint(
  marker: Phaser.GameObjects.Sprite,
  ctx: BoardAnimationContext,
  playerId?: string,
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

  return ['damage', 'heal', 'fell_down', 'modify_lp', 'add_buff', 'remove_buff'].includes(entry.action_type);
}

type BoundsLike = { x: number; y: number; width: number; height: number };

function boundsOverlap(a: BoundsLike, b: BoundsLike): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function expandBounds(bounds: BoundsLike, padding: number): BoundsLike {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  };
}

function pauseOverlappingPlayerNames(
  ctx: BoardAnimationContext,
  descriptionText: Phaser.GameObjects.Text | null,
): () => void {
  if (!descriptionText || !ctx.playerNames) return () => {};

  const descriptionBounds = expandBounds(descriptionText.getBounds(), 6);
  const pausedNames = new Map<Phaser.GameObjects.Text, boolean>();

  ctx.playerNames.forEach((nameText) => {
    if (!nameText.active || !boundsOverlap(descriptionBounds, nameText.getBounds())) return;
    pausedNames.set(nameText, nameText.visible);
    nameText.setVisible(false);
  });

  return () => {
    pausedNames.forEach((wasVisible, nameText) => {
      if (nameText.active) nameText.setVisible(wasVisible);
    });
  };
}

// --- Character animation functions ---

// Buff change animation: ring glow, marker pulse, and floating text
export function playBuffChangeAnimation(
  ctx: BoardAnimationContext,
  context: LogEntryAnimationContext,
  followPlayerId?: string | null,
  settlementPlayer?: Player | null,
): void {
  const { entry } = context;
  if (shouldSuppressSettlementEffect(entry, settlementPlayer)) return;

  const marker = ctx.playerMarkers.get(entry.target) ?? ctx.playerMarkers.get(followPlayerId || '');
  if (!marker) return;

  const effect = describeLogEntryEffect(entry, useGameStore.getState().definitions);
  const point = getMarkerEffectPoint(marker, ctx, entry.target);
  const x = point.x;
  const y = point.y;
  const hasDescription = Boolean(effect.description);
  const textStartY = hasDescription ? y - 62 : y - 42;
  const descriptionStartY = y - 34;

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
  const text = ctx.scene.add.text(x, textStartY, effect.label, {
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

  const descriptionText = effect.description
    ? ctx.scene.add.text(x, descriptionStartY, effect.description, {
        fontFamily: GAME_FONT_FAMILY,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#fff7d6',
        align: 'center',
        stroke: '#0b1020',
        strokeThickness: 4,
      })
    : null;
  descriptionText?.setOrigin(0.5, 0.5);
  descriptionText?.setDepth(worldDepth(LAYER_EFFECT_TEXT_BASE, y));
  const restorePausedPlayerNames = pauseOverlappingPlayerNames(ctx, descriptionText);

  ctx.tweens.add({
    targets: descriptionText ? [text, descriptionText] : text,
    y: descriptionText
      ? (_target: unknown, _key: string, _value: number, index: number) => (index === 0 ? y - 102 : y - 74)
      : y - 88,
    alpha: 0,
    scale: 1.15,
    delay: descriptionText ? FIRST_BUFF_DESCRIPTION_EXTRA_DELAY_MS : 0,
    duration: 1200,
    ease: 'Cubic.easeOut',
    onComplete: () => {
      if (entry.action_type === 'add_buff' && effect.description) {
        markBuffDescriptionSeen(getMetadataString(entry.metadata, 'buff_type'));
      }
      restorePausedPlayerNames();
      text.destroy();
      descriptionText?.destroy();
    },
  });
}

export function playGenericLogEntryEffect(
  ctx: BoardAnimationContext,
  context: LogEntryAnimationContext,
  followPlayerId?: string | null,
  settlementPlayer?: Player | null,
): void {
  const { entry } = context;

  if (shouldSuppressSettlementEffect(entry, settlementPlayer)) return;

  const marker = ctx.playerMarkers.get(entry.target) ?? ctx.playerMarkers.get(followPlayerId || '');
  if (!marker) return;

  const effect = describeLogEntryEffect(entry, useGameStore.getState().definitions);
  const point = getMarkerEffectPoint(marker, ctx, entry.target);
  const x = point.x;
  const y = point.y;
  const hasDescription = Boolean(effect.description);
  const descriptionLabel = effect.description ? `道具效果：${effect.description}` : null;
  const textStartY = hasDescription ? y - 62 : y - 42;
  const descriptionStartY = y - 34;

  const ring = ctx.scene.add.circle(x, y, 24, effect.color, 0.12);
  ring.setStrokeStyle(4, effect.color, 1);
  ring.setDepth(worldDepth(LAYER_EFFECT_BASE, y));

  const text = ctx.scene.add.text(x, textStartY, effect.label, {
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

  const descriptionText = descriptionLabel
    ? ctx.scene.add.text(x, descriptionStartY, descriptionLabel, {
        fontFamily: GAME_FONT_FAMILY,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#fff7d6',
        align: 'center',
        stroke: '#0b1020',
        strokeThickness: 4,
      })
    : null;
  descriptionText?.setOrigin(0.5, 0.5);
  descriptionText?.setDepth(worldDepth(LAYER_EFFECT_TEXT_BASE, y));
  const restorePausedPlayerNames = pauseOverlappingPlayerNames(ctx, descriptionText);

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
    targets: descriptionText ? [text, descriptionText] : text,
    y: (_target: unknown, _key: string, _value: number, index: number) => (index === 0 ? y - 102 : y - 74),
    alpha: 0,
    scale: 1.15,
    delay: descriptionText ? FIRST_ITEM_DESCRIPTION_EXTRA_DELAY_MS : 0,
    duration: 1050,
    ease: 'Cubic.easeOut',
    onComplete: () => {
      if (entry.action_type === 'draw_item' && effect.description) {
        markItemDescriptionSeen(getMetadataString(entry.metadata, 'item_type'), entry.target);
      }
      restorePausedPlayerNames();
      text.destroy();
      descriptionText?.destroy();
    },
  });
}

export function playDamageAnimation(
  ctx: BoardAnimationContext,
  context: LogEntryAnimationContext,
  activeMoveAnimations: Set<string>,
  followPlayerId?: string | null,
  settlementPlayer?: Player | null,
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
    
    // Play player hurt sound effect
    playPlayerHurtSfx();
    
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
  settlementPlayer?: Player | null,
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
      ctx.scene,
      marker,
      targetPlayer.player_id,
      'defeated',
      ctx.players,
      ctx.playerMarkers,
      ctx.characterRenderOptions,
      false,
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
  refreshCellMarkerStates?: () => void,
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
  settlementPlayer?: Player | null,
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
  settlementPlayer?: Player | null,
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
  settlementPlayer?: Player | null,
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
  settlementPlayer?: Player | null,
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
