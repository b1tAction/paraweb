import * as Phaser from 'phaser';
import type React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import {
  type CharacterRenderOptions,
  getCharacterProfileByFaction,
  getCharacterRenderer,
} from '../game/characterRenderConfig';
import type { Player } from '../types/protocol';

type PhaserCharacterPreviewProps = {
  faction?: string | null;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  characterRenderOptions?: CharacterRenderOptions;
  xOffset?: number;
  yOffset?: number;
};

const PREVIEW_SCENE_KEY = 'CharacterPreviewScene';

export const PhaserCharacterPreview: React.FC<PhaserCharacterPreviewProps> = ({
  faction,
  width = 256,
  height = 256,
  className,
  style,
  characterRenderOptions,
  xOffset = 0,
  yOffset = 0,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  const profile = useMemo(
    () => getCharacterProfileByFaction(faction, characterRenderOptions),
    [faction, characterRenderOptions],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const renderer = getCharacterRenderer(characterRenderOptions);
    const dummyPlayer = {
      player_id: 'preview',
      display_name: 'preview',
      faction: faction ?? '',
      position: 0,
      hp: 0,
      max_hp: 8,
      lp: 0,
      buffs: [],
      items: [],
      charge: 0,
      fire_counter: 0,
      is_dead: false,
      skip_turn: false,
    } satisfies Player;

    class CharacterPreviewScene extends Phaser.Scene {
      constructor() {
        super(PREVIEW_SCENE_KEY);
      }

      preload() {
        renderer.preload(this, profile);
      }

      create() {
        renderer.ensureAnimations(this, profile);
        const sprite = renderer.createSprite({
          scene: this,
          player: dummyPlayer,
          profile,
          x: width / 2 + xOffset,
          y: height / 2 + yOffset,
        });
        const idleConfig = profile.animations.idle;
        const fitScale = Math.min(width / idleConfig.frameWidth, height / idleConfig.frameHeight) * 0.85;
        sprite.setScale(fitScale);
        renderer.play(this, sprite, profile, 'idle');
      }
    }

    const game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent: containerRef.current,
      width,
      height,
      transparent: true,
      pixelArt: true,
      antialias: false,
      antialiasGL: false,
      roundPixels: true,
      scene: CharacterPreviewScene,
      scale: {
        mode: Phaser.Scale.NONE,
      },
    });

    gameRef.current = game;

    const canvas = game.canvas;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [characterRenderOptions, faction, height, profile, width, xOffset, yOffset]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        ...style,
      }}
    />
  );
};
