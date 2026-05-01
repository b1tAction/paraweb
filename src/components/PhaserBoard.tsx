import React, { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';
import type { MapConfig, Player } from '../types/protocol';
import { ForestBoardScene } from '../game/ForestBoardScene';
import type { LogEntryAnimationContext } from '../game/logEntryAnimationPolicy';

type PhaserBoardProps = {
  mapConfig: MapConfig;
  players: Player[];
  /** 摄像头跟随的玩家 ID；通常传当前客户端自己的 myPlayerId */
  followPlayerId?: string | null;
  selfPlayerId?: string | null;
  /** 当前正在播放的日志条目，用于棋盘上的特效提示 */
  activeAnimationContext?: LogEntryAnimationContext | null;
  /** TurnEnd 结算目标；用于抑制当前玩家附近的 HP/LP/Buff 提示 */
  settlementPlayer?: Player | null;
};

export const PhaserBoard: React.FC<PhaserBoardProps> = ({
  mapConfig,
  players,
  followPlayerId,
  selfPlayerId,
  activeAnimationContext,
  settlementPlayer,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

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
  // 添加 preload 配置
  scene: {
    preload: function(this: Phaser.Scene) {
      this.load.spritesheet('red_idle', 'assets/figures/red_idle.png', {
        frameWidth: 68,
        frameHeight: 68
      });
    }
  },
});

    game.scene.add('ForestBoardScene', ForestBoardScene, true, {
      mapConfig,
      players,
      followPlayerId,
      selfPlayerId,
      activeAnimationContext,
      settlementPlayer,
    });

    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = gameRef.current?.scene.getScene(
      'ForestBoardScene'
    ) as ForestBoardScene | undefined;

    scene?.updateFromReact(mapConfig, players, followPlayerId, selfPlayerId, activeAnimationContext, settlementPlayer);
  }, [mapConfig, players, followPlayerId, selfPlayerId, activeAnimationContext, settlementPlayer]);

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
