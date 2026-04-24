import React, { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';
import type { MapConfig, Player } from '../types/protocol';
import { ForestBoardScene } from '../game/ForestBoardScene';

type PhaserBoardProps = {
  mapConfig: MapConfig;
  players: Player[];
  /** 摄像头跟随的玩家 ID；通常传当前客户端自己的 myPlayerId */
  followPlayerId?: string | null;
};

export const PhaserBoard: React.FC<PhaserBoardProps> = ({
  mapConfig,
  players,
  followPlayerId,
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
      backgroundColor: '#1b1b1b',
      pixelArt: true,
      scale: {
        mode: Phaser.Scale.ENVELOP,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [],
    });

    game.scene.add('ForestBoardScene', ForestBoardScene, true, {
      mapConfig,
      players,
      followPlayerId,
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

    scene?.updateFromReact(mapConfig, players, followPlayerId);
  }, [mapConfig, players, followPlayerId]);

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