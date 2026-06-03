import * as Phaser from 'phaser';
import type React from 'react';
import { useEffect, useRef } from 'react';
import type { CharacterRenderOptions } from '../game/characterRenderConfig';
import { ForestBoardScene } from '../game/ForestBoardScene';
import type { LogEntryAnimationContext } from '../game/logEntryAnimationPolicy';
import type { MapConfig, Player } from '../types/protocol';

type PhaserBoardProps = {
  mapConfig: MapConfig;
  players: Player[];
  /** 相机跟随的玩家 ID，通常传当前客户端自己的 `myPlayerId`。 */
  followPlayerId?: string | null;
  selfPlayerId?: string | null;
  /** 当前正在播放的日志动画上下文，用于棋盘上的特效提示。 */
  activeAnimationContext?: LogEntryAnimationContext | null;
  /** TurnEnd 结算目标，用于抑制当前玩家附近的 HP/LP/Buff 提示。 */
  settlementPlayer?: Player | null;
  /** 需要向 React 回传屏幕坐标的棋盘格。 */
  guideCellIndex?: number | null;
  characterRenderOptions?: CharacterRenderOptions;
};

export const PhaserBoard: React.FC<PhaserBoardProps> = ({
  mapConfig,
  players,
  followPlayerId,
  selfPlayerId,
  activeAnimationContext,
  settlementPlayer,
  guideCellIndex,
  characterRenderOptions,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const initialSceneDataRef = useRef({
    mapConfig,
    players,
    followPlayerId,
    selfPlayerId,
    activeAnimationContext,
    settlementPlayer,
    guideCellIndex,
    characterRenderOptions,
  });

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent: containerRef.current,
      width: 1280,
      height: 960,
      pixelArt: true,
      antialias: false,
      antialiasGL: false,
      roundPixels: true,
      scale: { mode: Phaser.Scale.ENVELOP, autoCenter: Phaser.Scale.CENTER_BOTH },
    });

    game.scene.add('ForestBoardScene', ForestBoardScene, true, initialSceneDataRef.current);

    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = gameRef.current?.scene.getScene('ForestBoardScene') as ForestBoardScene | undefined;

    scene?.updateFromReact(
      mapConfig,
      players,
      followPlayerId,
      selfPlayerId,
      activeAnimationContext,
      settlementPlayer,
      guideCellIndex,
      characterRenderOptions,
    );
  }, [
    mapConfig,
    players,
    followPlayerId,
    selfPlayerId,
    activeAnimationContext,
    settlementPlayer,
    guideCellIndex,
    characterRenderOptions,
  ]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        background: '#000',
        overflow: 'hidden',
      }}
    />
  );
};
