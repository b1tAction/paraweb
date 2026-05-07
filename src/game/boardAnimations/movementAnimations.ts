import * as Phaser from 'phaser';
import type { Player } from '../../types/protocol';
import type { LogEntryAnimationContext } from '../logEntryAnimationPolicy';
import {
  getCharacterRenderer,
  resolveCharacterProfile,
} from '../characterRenderConfig';
import { isAnyDoorTeleportEntry } from '../logEntryAnimationPolicy';
import { getMetadataNumber, getMetadataNumberArray, MOVE_STEP_MS } from '../logEntryPlayback';
import { LAYER_CHARACTER_BASE, LAYER_EFFECT_BASE, worldDepth } from '../renderLayers';
import { GAME_FONT_FAMILY, BLACKHOLE_TEXTURE_KEY, BLACKHOLE_ANIMATION_KEY, BLACKHOLE_SIZE_SCALE, WARP_DOOR_TEXTURE_KEY, WARP_DOOR_ANIMATION_KEY, WARP_DOOR_CELL_OFFSET_Y, WARP_DOOR_DEPTH_OFFSET, WARP_DOOR_PLAYER_FRONT_DEPTH_OFFSET } from '../boardConstants';
import type { BoardAnimationContext } from './eventAnimations';
import { playGenericLogEntryEffect } from './characterAnimations';

// Re-export BoardCellView type for movementAnimations
type BoardCellView = { x: number; y: number; index: number };

export function playMoveAnimation(
  ctx: BoardAnimationContext,
  context: LogEntryAnimationContext,
  activeMoveAnimations: Set<string>,
  refreshCellMarkerStates?: () => void
): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  if (!marker) return;
  const path = getMetadataNumberArray(entry.metadata, 'path');
  if (path.length < 2) {
    const endPos = entry.metadata && Object.prototype.hasOwnProperty.call(entry.metadata, 'end_pos')
      ? getMetadataNumber(entry.metadata, 'end_pos')
      : null;
    if (endPos !== null) {
      console.log('[ForestBoardScene] Directly setting player position from end_pos:', endPos);
      ctx.logDrivenPositions.set(entry.target, endPos);
      refreshCellMarkerStates?.();
    }
    return;
  }

  const startCell = ctx.cellViews.get(path[0]);
  const currentOffsetX = startCell ? marker.x - startCell.x : 0;
  const currentOffsetY = startCell ? marker.y - startCell.y : -16;
  const points = path
    .slice(1)
    .map((cellIndex) => ctx.cellViews.get(cellIndex))
    .filter((cell): cell is BoardCellView => Boolean(cell))
    .map((cell) => ({
      x: cell.x + currentOffsetX,
      y: cell.y + currentOffsetY,
      cellIndex: cell.index,
    }));
  if (points.length === 0) return;

  const player = ctx.players.find(p => p.player_id === entry.target) ?? ctx.players[0];
  const order = ctx.players.indexOf(player);
  const profile = resolveCharacterProfile(player, order, ctx.characterRenderOptions);
  const renderer = getCharacterRenderer(ctx.characterRenderOptions);
  let index = 0;

  renderer.play(ctx.scene, marker, profile, 'move');
  activeMoveAnimations.add(entry.target);
  refreshCellMarkerStates?.();
  ctx.tweens.killTweensOf(marker);

  const runNext = () => {
    const point = points[index];
    if (!point) {
      renderer.play(ctx.scene, marker, profile, 'idle');
      activeMoveAnimations.delete(entry.target);
      refreshCellMarkerStates?.();
      return;
    }
    if (point.x < marker.x) {
      marker.setFlipX(true);
    } else if (point.x > marker.x) {
      marker.setFlipX(false);
    }
    ctx.tweens.add({
      targets: marker,
      x: point.x,
      y: point.y,
      duration: MOVE_STEP_MS,
      ease: 'Linear',
      onUpdate: () => {
        marker.setDepth(worldDepth(LAYER_CHARACTER_BASE, marker.y ?? point.y));
      },
      onComplete: () => {
        ctx.logDrivenPositions.set(entry.target, point.cellIndex);
        refreshCellMarkerStates?.();
        index += 1;
        runNext();
      },
    });
  };
  runNext();
}

export function playTeleportAnimation(
  ctx: BoardAnimationContext,
  context: LogEntryAnimationContext,
  activeMoveAnimations: Set<string>,
  followPlayerId?: string | null,
  settlementPlayer?: Player | null,
  mapTileHeight?: number,
  refreshCellMarkerStates?: () => void
): void {
  const { entry } = context;
  if (!isAnyDoorTeleportEntry(entry)) {
    playBlackholeTeleportAnimation(ctx, context, activeMoveAnimations, refreshCellMarkerStates);
    return;
  }

  const marker = ctx.playerMarkers.get(entry.target);
  const fromPos = getMetadataNumber(entry.metadata, 'from_pos');
  const toPos = getMetadataNumber(entry.metadata, 'to_pos');

  if (!marker || fromPos === null || toPos === null) {
    playGenericLogEntryEffect(ctx, context, followPlayerId, settlementPlayer);
    return;
  }

  const fromCell = ctx.cellViews.get(fromPos);
  const toCell = ctx.cellViews.get(toPos);
  if (!fromCell || !toCell) {
    playGenericLogEntryEffect(ctx, context, followPlayerId, settlementPlayer);
    return;
  }

  const tileHeight = mapTileHeight ?? 32;
  const currentOffsetX = marker.x - fromCell.x;
  const currentOffsetY = marker.y - fromCell.y;
  const targetX = toCell.x + currentOffsetX;
  const targetY = toCell.y + currentOffsetY;
  const travelSign = targetX >= marker.x ? 1 : -1;
  const entranceDoorX = marker.x + travelSign * 30;
  const doorOffsetY = tileHeight * WARP_DOOR_CELL_OFFSET_Y;
  const entranceDoorY = marker.y + 18 + doorOffsetY;
  const exitDoorX = targetX - travelSign * 30;
  const exitDoorY = targetY + 18 + doorOffsetY;
  const depthBase = worldDepth(LAYER_EFFECT_BASE, Math.max(entranceDoorY, exitDoorY)) + 60;
  const entrancePlayerDepth = entranceDoorY + WARP_DOOR_PLAYER_FRONT_DEPTH_OFFSET;
  const exitPlayerDepth = exitDoorY + WARP_DOOR_PLAYER_FRONT_DEPTH_OFFSET;

  const player = ctx.players.find(p => p.player_id === entry.target) ?? ctx.players[0];
  const order = ctx.players.indexOf(player);
  const renderer = getCharacterRenderer(ctx.characterRenderOptions);
  const profile = resolveCharacterProfile(player, order, ctx.characterRenderOptions);
  const profileScale = profile.scale ?? 0.65;
  const profileAlpha = 1;
  const doors: Phaser.GameObjects.GameObject[] = [];
  const doorGlows: Phaser.GameObjects.Sprite[] = [];

  const makeDoor = (x: number, y: number, flipX: boolean) => {
    const door = ctx.scene.add.sprite(x, y, WARP_DOOR_TEXTURE_KEY);
    door.setOrigin(0.5, 1);
    door.setScale(0.76);
    door.setAlpha(0);
    door.setFlipX(flipX);
    door.setDepth(y + WARP_DOOR_DEPTH_OFFSET);
    door.play(WARP_DOOR_ANIMATION_KEY);
    doors.push(door);
    return door;
  };

  const makeGlow = (x: number, y: number, flipX: boolean) => {
    const glow = ctx.scene.add.sprite(x, y, WARP_DOOR_TEXTURE_KEY);
    glow.setOrigin(0.5, 1);
    glow.setScale(1.1);
    glow.setAlpha(0);
    glow.setFlipX(flipX);
    glow.setTint(0x8fefff);
    glow.setDepth(y + WARP_DOOR_DEPTH_OFFSET - 10);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    glow.play(WARP_DOOR_ANIMATION_KEY);
    doors.push(glow);
    doorGlows.push(glow);
    return glow;
  };

  const entranceDoor = makeDoor(entranceDoorX, entranceDoorY, false);
  const exitDoor = makeDoor(exitDoorX, exitDoorY, true);
  makeGlow(entranceDoorX, entranceDoorY, false);
  makeGlow(exitDoorX, exitDoorY, true);
  const label = ctx.scene.add.text((entranceDoorX + exitDoorX) / 2, Math.min(entranceDoorY, exitDoorY) - 76, `${fromPos} -> ${toPos}`, {
    fontFamily: GAME_FONT_FAMILY,
    fontSize: '20px',
    fontStyle: 'bold',
    color: '#e1f5fe',
    stroke: '#062333',
    strokeThickness: 5,
  });
  label.setOrigin(0.5, 0.5);
  label.setDepth(depthBase);
  label.setAlpha(0);
  doors.push(label);

  ctx.logDrivenPositions.set(entry.target, fromPos);
  activeMoveAnimations.add(entry.target);
  refreshCellMarkerStates?.();
  ctx.tweens.killTweensOf(marker);

  ctx.tweens.add({
    targets: [entranceDoor, exitDoor],
    alpha: 1,
    scale: 1.22,
    duration: 220,
    ease: 'Back.easeOut',
  });
  ctx.tweens.add({
    targets: doorGlows,
    alpha: 0.58,
    scale: 1.34,
    duration: 420,
    yoyo: true,
    repeat: 2,
    ease: 'Sine.easeInOut',
  });
  ctx.tweens.add({
    targets: label,
    alpha: { from: 0, to: 1 },
    y: label.y - 16,
    duration: 360,
    yoyo: true,
    hold: 900,
    ease: 'Cubic.easeOut',
  });

  marker.setFlipX(travelSign < 0);
  renderer.play(ctx.scene, marker, profile, 'move');

  ctx.tweens.add({
    targets: marker,
    x: marker.x + travelSign * 14,
    duration: 260,
    ease: 'Sine.easeInOut',
    onUpdate: () => marker.setDepth(entrancePlayerDepth),
    onComplete: () => {
      ctx.tweens.add({
        targets: marker,
        x: entranceDoorX - travelSign * 3,
        alpha: 0,
        duration: 420,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          ctx.logDrivenPositions.set(entry.target, toPos);
          refreshCellMarkerStates?.();
          marker.setPosition(exitDoorX + travelSign * 3, targetY);
          marker.setScale(profileScale, profileScale);
          marker.setAlpha(0);
          marker.setFlipX(travelSign < 0);
          marker.setDepth(exitPlayerDepth);

          ctx.scene.time.delayedCall(120, () => {
            ctx.tweens.add({
              targets: marker,
              x: targetX,
              y: targetY,
              alpha: profileAlpha,
              duration: 520,
              ease: 'Cubic.easeOut',
              onUpdate: () => marker.setDepth(exitPlayerDepth),
              onComplete: () => {
                renderer.play(ctx.scene, marker, profile, 'idle');
                activeMoveAnimations.delete(entry.target);
                refreshCellMarkerStates?.();
              },
            });
          });
        },
      });
    },
  });

  ctx.scene.time.delayedCall(2100, () => {
    ctx.tweens.add({
      targets: doors,
      alpha: 0,
      scale: 0.92,
      duration: 360,
      ease: 'Cubic.easeIn',
      onComplete: () => doors.forEach((object) => object.destroy()),
    });
  });
}

export function playBlackholeTeleportAnimation(
  ctx: BoardAnimationContext,
  context: LogEntryAnimationContext,
  activeMoveAnimations: Set<string>,
  refreshCellMarkerStates?: () => void
): void {
  const { entry } = context;
  const marker = ctx.playerMarkers.get(entry.target);
  const fromPos = getMetadataNumber(entry.metadata, 'from_pos');
  const toPos = getMetadataNumber(entry.metadata, 'to_pos');

  if (!marker || fromPos === null || toPos === null) return;

  const fromCell = ctx.cellViews.get(fromPos);
  const toCell = ctx.cellViews.get(toPos);
  if (!fromCell || !toCell) return;

  const currentOffsetX = marker.x - fromCell.x;
  const currentOffsetY = marker.y - fromCell.y;
  const targetX = toCell.x + currentOffsetX;
  const targetY = toCell.y + currentOffsetY;
  const sourceDepth = worldDepth(LAYER_EFFECT_BASE, marker.y) + 60;
  const targetDepth = worldDepth(LAYER_EFFECT_BASE, targetY) + 60;

  const player = ctx.players.find(p => p.player_id === entry.target) ?? ctx.players[0];
  const order = ctx.players.indexOf(player);
  const renderer = getCharacterRenderer(ctx.characterRenderOptions);
  const profile = resolveCharacterProfile(player, order, ctx.characterRenderOptions);

  const profileScale = profile.scale ?? 0.65;
  const characterWidth = profile.animations.idle.frameWidth * profileScale;
  const centerY = marker.y;

  // Phase 1: blackhole appears and covers character (0-400ms)
  const blackholeAppearDuration = 400;
  const sourceBlackhole = ctx.scene.add.sprite(marker.x, centerY, BLACKHOLE_TEXTURE_KEY);
  sourceBlackhole.setOrigin(0.5, 0.5);
  sourceBlackhole.setDisplaySize(10, 10);
  sourceBlackhole.setAlpha(1);
  sourceBlackhole.setDepth(sourceDepth + 1);
  sourceBlackhole.play(BLACKHOLE_ANIMATION_KEY);

  ctx.tweens.add({
    targets: sourceBlackhole,
    displayWidth: characterWidth * BLACKHOLE_SIZE_SCALE,
    displayHeight: characterWidth * BLACKHOLE_SIZE_SCALE,
    duration: blackholeAppearDuration,
    ease: 'Back.easeOut',
  });

  // Phase 2: blackhole absorbs character, rotates and disappears together (400-800ms)
  ctx.scene.time.delayedCall(blackholeAppearDuration, () => {
    const rotatingBlackhole = ctx.scene.add.sprite(marker.x, centerY, BLACKHOLE_TEXTURE_KEY);
    rotatingBlackhole.setOrigin(0.5, 0.5);
    rotatingBlackhole.setDisplaySize(characterWidth * BLACKHOLE_SIZE_SCALE, characterWidth * BLACKHOLE_SIZE_SCALE);
    rotatingBlackhole.setAlpha(1);
    rotatingBlackhole.setDepth(sourceDepth + 1);
    rotatingBlackhole.play(BLACKHOLE_ANIMATION_KEY);

    sourceBlackhole.destroy();

    ctx.tweens.add({
      targets: marker,
      scaleX: profileScale * 0.3,
      scaleY: profileScale * 0.3,
      alpha: 0,
      duration: 400,
      ease: 'Cubic.easeIn',
    });

    ctx.tweens.add({
      targets: rotatingBlackhole,
      displayWidth: 20,
      displayHeight: 20,
      alpha: 0,
      duration: 400,
      ease: 'Back.easeIn',
    });

    // Phase 3: blackhole appears at target location (800-1200ms)
    ctx.scene.time.delayedCall(400, () => {
      ctx.logDrivenPositions.set(entry.target, toPos);
      refreshCellMarkerStates?.();

      marker.setPosition(targetX, targetY);
      marker.setScale(profileScale * 0.3, profileScale * 0.3);
      marker.setAlpha(0);
      marker.setDepth(targetDepth);

      const exitBlackhole = ctx.scene.add.sprite(targetX, targetY, BLACKHOLE_TEXTURE_KEY);
      exitBlackhole.setOrigin(0.5, 0.5);
      exitBlackhole.setDisplaySize(10, 10);
      exitBlackhole.setAlpha(1);
      exitBlackhole.setDepth(targetDepth + 1);
      exitBlackhole.play(BLACKHOLE_ANIMATION_KEY);

      ctx.tweens.add({
        targets: exitBlackhole,
        displayWidth: characterWidth * BLACKHOLE_SIZE_SCALE,
        displayHeight: characterWidth * BLACKHOLE_SIZE_SCALE,
        duration: 400,
        ease: 'Back.easeOut',
      });

      // Phase 4: blackhole disappears, character appears (1200-1600ms)
      ctx.scene.time.delayedCall(400, () => {
        exitBlackhole.destroy();

        ctx.tweens.killTweensOf(marker);
        ctx.tweens.add({
          targets: marker,
          scaleX: profileScale,
          scaleY: profileScale,
          alpha: 1,
          duration: 400,
          ease: 'Cubic.easeOut',
          onComplete: () => {
            renderer.play(ctx.scene, marker, profile, 'idle');
            activeMoveAnimations.delete(entry.target);
            refreshCellMarkerStates?.();
          },
        });
      });
    });
  });

  ctx.logDrivenPositions.set(entry.target, fromPos);
  activeMoveAnimations.add(entry.target);
  refreshCellMarkerStates?.();
  ctx.tweens.killTweensOf(marker);
}