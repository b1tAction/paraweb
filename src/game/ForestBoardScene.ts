import * as Phaser from 'phaser';
import type { MapConfig, MapCellConfig, Player } from '../types/protocol';
import { getTiledProperty } from './tiledHelpers';
import {
  shouldRenderBoardLogEntryAnimation,
  type LogEntryAnimationContext,
} from './logEntryAnimationPolicy';
import {
  getAnimationKey,
  getCharacterNameOffsetY,
  getCharacterOffsetX,
  getCharacterOffsetY,
  getCharacterProfiles,
  getCharacterRenderer,
  resolveCharacterProfile,
  type CharacterRenderOptions,
  type CharacterRenderProfile,
} from './characterRenderConfig';
import { isBossPlayer } from './bossVisualConfig';
import { AnimationOrchestrator } from './animationOrchestrator';
import {
  GAME_FONT_FAMILY,
  PLAYER_NAME_SCREEN_FONT_SIZE,
  CELL_LABEL_SCREEN_FONT_SIZE,
  PLAYER_NAME_TEXTURE_RESOLUTION,
  LOGIC_CELL_MARKER_SCALE,
  RESPAWN_TEXTURE_KEY,
  RESPAWN_ANIMATION_KEY,
  RESPAWN_FRAME_WIDTH,
  RESPAWN_FRAME_HEIGHT,
  RESPAWN_FRAME_COUNT,
  RESPAWN_FRAME_RATE,
  LP_ADD_TEXTURE_KEY,
  LP_ADD_ANIMATION_KEY,
  LP_ADD_FRAME_WIDTH,
  LP_ADD_FRAME_HEIGHT,
  LP_ADD_FRAME_COUNT,
  LP_ADD_FRAME_RATE,
  LP_MINUS_TEXTURE_KEY,
  LP_MINUS_ANIMATION_KEY,
  LP_MINUS_FRAME_WIDTH,
  LP_MINUS_FRAME_HEIGHT,
  LP_MINUS_FRAME_COUNT,
  LP_MINUS_FRAME_RATE,
  BLACKHOLE_TEXTURE_KEY,
  BLACKHOLE_ANIMATION_KEY,
  BLACKHOLE_ANI_TEXTURE_KEY,
  BLACKHOLE_ANI_ANIMATION_KEY,
  BLACKHOLE_FRAME_COUNT,
  BLACKHOLE_FRAME_RATE,
  BLACKHOLE_ANI_FRAME_COUNT,
  BLACKHOLE_ANI_FRAME_RATE,
  WARP_DOOR_TEXTURE_KEY,
  WARP_DOOR_ANIMATION_KEY,
  WATER_TELEPORT_TEXTURE_KEY,
  WATER_TELEPORT_ANIMATION_KEY,
  WATER_TELEPORT_FRAME_COUNT,
  WATER_TELEPORT_FRAME_RATE,
  SHRINE_TEXTURE_KEY,
  SHRINE_TILESET_NAME,
  PROJECTILE_CHARGE_TEXTURE_KEY,
  PROJECTILE_CHARGE_ANIMATION_KEY,
  PROJECTILE_CHARGE_FRAME_COUNT,
  PROJECTILE_SPEAR_TEXTURE_KEY,
  PROJECTILE_SPEAR_ANIMATION_KEY,
  PROJECTILE_SPEAR_FRAME_COUNT,
  PROJECTILE_MAGIC_SPHERE_TEXTURE_KEY,
  PROJECTILE_MAGIC_SPHERE_ANIMATION_KEY,
  PROJECTILE_MAGIC_SPHERE_FRAME_COUNT,
  PROJECTILE_FIREBALL_TEXTURE_KEY,
  PROJECTILE_FIREBALL_ANIMATION_KEY,
  PROJECTILE_FIREBALL_FRAME_COUNT,
  PROJECTILE_FRAME_RATE,
} from './boardConstants';
import { type PopupContext } from './boardAnimations/popup';
import type { BoardAnimationContext } from './boardAnimations/eventAnimations';
import { playDrawEventAnimation } from './boardAnimations/eventAnimations';
import { playBossDamageAnimation, playBossAttackAnimation, playBossSkillAnimation } from './boardAnimations/bossAnimations';
import { playGenericLogEntryEffect, playDamageAnimation, playDeathAnimation, playRespawnAnimation, playHealAnimation, playModifyLpAnimation, playBuffChangeAnimation } from './boardAnimations/characterAnimations';
import { playMoveAnimation, playTeleportAnimation } from './boardAnimations/movementAnimations';

type PathNode = {
  index: number;
  x: number;
  y: number;
  name?: string;
};

type BoardCellView = MapCellConfig & {
  x: number;
  y: number;
};

type TilesetImageConfig = {
  tiledNames: string[];
  key: string;
  url: string;
};

type CellMarkerView = {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
};

type BoardAnimationRenderer = (context: LogEntryAnimationContext) => void;

const TILESET_IMAGES: TilesetImageConfig[] = [
  {
    tiledNames: ['grass'],
    key: 'tiles-grass',
    url: '/assets/tilesets/forest/surface/Grass.png',
  },
  {
    tiledNames: ['Grass 2 layer'],
    key: 'tiles-grass-2-layer',
    url: '/assets/tilesets/forest/surface/Grass 2 layer.png',
  },
  {
    tiledNames:[
      'pine tree',
      'assets/forest/trees/pixellab-one-tree--a-tall--green-pine-t-1776597824607.png',
    ],
    key: 'tiles-pine-tree',
    url: '/assets/tilesets/forest/trees/pixellab-one-tree--a-tall--green-pine-t-1776597824607.png',
  },
  {
    tiledNames: ['Plants'],
    key: 'tiles-plants',
    url: '/assets/tilesets/forest/trees/Plants.png',
  },
];

const CAMERA_VIEW_TILES_X = 30;
const CAMERA_VIEW_TILES_Y = 20;

export class ForestBoardScene extends Phaser.Scene {
  private mapConfig!: MapConfig;
  private players: Player[] =[];
  private followPlayerId?: string | null;
  private selfPlayerId?: string | null;
  private activeAnimationContext?: LogEntryAnimationContext | null;
  private settlementPlayer?: Player | null;
  private characterRenderOptions?: CharacterRenderOptions;
  private mapTileWidth = 32;
  private mapTileHeight = 32;

  private pathNodes = new Map<number, PathNode>();
  private cellViews = new Map<number, BoardCellView>();

  private cellMarkers = new Map<number, CellMarkerView>();
  // Player markers are rendered as sprites so they can play animation clips.
  private playerMarkers = new Map<string, Phaser.GameObjects.Sprite>();
  private playerNames = new Map<string, Phaser.GameObjects.Text>();

  private logDrivenPositions = new Map<string, number>();
  private activeMoveAnimations = new Set<string>();
  private lastEffectKey = '';
  private ready = false;
  private orchestrator!: AnimationOrchestrator;

  private buildAnimationCtx(): BoardAnimationContext {
    return {
      scene: this,
      orchestrator: this.orchestrator,
      tweens: this.tweens,
      playerMarkers: this.playerMarkers,
      players: this.players,
      logDrivenPositions: this.logDrivenPositions,
      cellViews: this.cellViews as Map<number, { x: number; y: number; index: number }>,
      characterRenderOptions: this.characterRenderOptions,
    };
  }

  private buildPopupCtx(): PopupContext {
    return {
      scene: this,
      orchestrator: this.orchestrator,
      tweens: this.tweens,
    };
  }

  private readonly boardAnimationRenderers: Record<string, BoardAnimationRenderer> = {
    move: (context) => playMoveAnimation(this.buildAnimationCtx(), context, this.activeMoveAnimations, () => this.refreshCellMarkerStates()),
    teleport: (context) => playTeleportAnimation(this.buildAnimationCtx(), context, this.activeMoveAnimations, this.followPlayerId, this.settlementPlayer, this.mapTileHeight, () => this.refreshCellMarkerStates()),
    damage: (context) => playDamageAnimation(this.buildAnimationCtx(), context, this.activeMoveAnimations, this.followPlayerId, this.settlementPlayer),
    heal: (context) => playHealAnimation(this.buildAnimationCtx(), context, this.followPlayerId, this.settlementPlayer),
    death: (context) => playDeathAnimation(this.buildAnimationCtx(), context, this.followPlayerId, this.settlementPlayer),
    fell_down: (context) => playDeathAnimation(this.buildAnimationCtx(), context, this.followPlayerId, this.settlementPlayer),
    respawn: (context) => playRespawnAnimation(this.buildAnimationCtx(), context, this.followPlayerId, this.settlementPlayer, () => this.refreshCellMarkerStates()),
    modify_lp: (context) => playModifyLpAnimation(this.buildAnimationCtx(), context, this.followPlayerId, this.settlementPlayer),
    add_buff: (context) => playBuffChangeAnimation(this.buildAnimationCtx(), context, this.followPlayerId, this.settlementPlayer),
    remove_buff: (context) => playBuffChangeAnimation(this.buildAnimationCtx(), context, this.followPlayerId, this.settlementPlayer),
    draw_event: (context) => playDrawEventAnimation(this.buildAnimationCtx(), this.buildPopupCtx(), context),
    boss_damage: (context) => playBossDamageAnimation(this.buildAnimationCtx(), context),
    boss_attack: (context) => playBossAttackAnimation(this.buildAnimationCtx(), context),
    boss_skill: (context) => playBossSkillAnimation(this.buildAnimationCtx(), context),
  };

  constructor() {
    super('ForestBoardScene');
  }

  init(data: {
    mapConfig: MapConfig;
    players: Player[];
    followPlayerId?: string | null;
    selfPlayerId?: string | null;
    activeAnimationContext?: LogEntryAnimationContext | null;
    settlementPlayer?: Player | null;
    characterRenderOptions?: CharacterRenderOptions;
  }) {
    this.mapConfig = data.mapConfig;
    this.players = data.players ??[];
    this.followPlayerId = data.followPlayerId;
    this.selfPlayerId = data.selfPlayerId;
    this.activeAnimationContext = data.activeAnimationContext;
    this.settlementPlayer = data.settlementPlayer;
    this.characterRenderOptions = data.characterRenderOptions;
  }

  preload() {
    this.load.tilemapTiledJSON('mainmap', '/assets/maps/MainMap.json');

    for (const tileset of TILESET_IMAGES) {
      this.load.image(tileset.key, tileset.url);
    }
    this.load.image('logic-cell-off', '/assets/tilesets/block/off.png');
    this.load.image('logic-cell-on', '/assets/tilesets/block/on.png');
    this.load.image(SHRINE_TEXTURE_KEY, '/assets/shrine/shrine.png');
    this.load.spritesheet(WARP_DOOR_TEXTURE_KEY, '/assets/effects/warp-door.png', {
      frameWidth: 64,
      frameHeight: 64
    });

    for (let i = 1; i <= WATER_TELEPORT_FRAME_COUNT; i += 1) {
      const frameName = String(i).padStart(5, '0');
      this.load.image(
        `${WATER_TELEPORT_TEXTURE_KEY}-${frameName}`,
        `/assets/effects/Water1/Png/water1_${frameName}.png`
      );
    }
    

    // Load lightning bolt effect sprite sheet for thunder event
    this.load.spritesheet('lightning-bolt', '/assets/effects/Lightning-bolt.png', {
      frameWidth: 72,
      frameHeight: 72
    });

    // Load boss skill thunder flash sprite sheet (boss position flash)
    this.load.spritesheet('skill-thunder1', '/assets/boss/skill-thunder1.png', {
      frameWidth: 72,
      frameHeight: 72
    });

    // Load boss skill thunder strike sprite sheet (per-player strike)
    this.load.spritesheet('skill-thunder2', '/assets/boss/skill-thunder2.png', {
      frameWidth: 72,
      frameHeight: 72
    });

    // Load heal effect sprite sheet for heal action
    this.load.spritesheet('heal-effect', '/assets/effects/heal.png', {
      frameWidth: 128,
      frameHeight: 128
    });

    // Load herb effect sprite sheet for herb event
    this.load.spritesheet('herb-effect', '/assets/effects/herb.png', {
      frameWidth: 72,
      frameHeight: 72
    });

    // Load wind gust effect sprite sheet for wind_gust event
    this.load.spritesheet('wind-gust-effect', '/assets/effects/wind-gust.png', {
      frameWidth: 72,
      frameHeight: 72
    });

    // Load bubble effect sprite sheet for lucky_bubble event
    this.load.spritesheet('bubble-effect', '/assets/effects/bubble.png', {
      frameWidth: 128,
      frameHeight: 128
    });

    // Load ghost effect sprite sheet for ghost_hit event
    this.load.spritesheet('ghost-effect', '/assets/effects/ghost.png', {
      frameWidth: 150,
      frameHeight: 150
    });

    this.load.image('event-popup-frame', '/assets/frame/event_frame.png');

    this.load.spritesheet(BLACKHOLE_TEXTURE_KEY, '/assets/effects/Black-hole.png', {
      frameWidth: 72,
      frameHeight: 72
    });

    this.load.spritesheet(BLACKHOLE_ANI_TEXTURE_KEY, '/assets/effects/Black-hole-ani.png', {
      frameWidth: 64,
      frameHeight: 64
    });

    this.load.spritesheet(RESPAWN_TEXTURE_KEY, '/assets/effects/respawn.png', {
      frameWidth: RESPAWN_FRAME_WIDTH,
      frameHeight: RESPAWN_FRAME_HEIGHT
    });

    this.load.spritesheet(LP_ADD_TEXTURE_KEY, '/assets/effects/lpadd.png', {
      frameWidth: LP_ADD_FRAME_WIDTH,
      frameHeight: LP_ADD_FRAME_HEIGHT
    });

    this.load.spritesheet(LP_MINUS_TEXTURE_KEY, '/assets/effects/lpminus.png', {
      frameWidth: LP_MINUS_FRAME_WIDTH,
      frameHeight: LP_MINUS_FRAME_HEIGHT
    });

    // Load projectile sprite sheets for boss damage crit animations
    this.load.spritesheet('witch-green-charge', '/assets/figures/witch_green/Charge.png', {
      frameWidth: 96,
      frameHeight: 64,
      spacing: 0
    });
    this.load.spritesheet('witch-red-spear', '/assets/figures/witch_red/Spear.png', {
      frameWidth: 96,
      frameHeight: 96,
      spacing: 32
    });
    this.load.spritesheet('wizard-black-magic-sphere', '/assets/figures/wizard_black/Magic_sphere.png', {
      frameWidth: 96,
      frameHeight: 96,
      spacing: 32
    });
    this.load.spritesheet('wizard-blue-fireball', '/assets/figures/wizard_blue/Fireball.png', {
      frameWidth: 96,
      frameHeight: 96,
      spacing: 32
    });

    const renderer = getCharacterRenderer(this.characterRenderOptions);
    Object.values(getCharacterProfiles(this.characterRenderOptions)).forEach((profile) => {
      renderer.preload(this, profile);
    });
  }

  create() {
    const map = this.make.tilemap({ key: 'mainmap' });
    this.mapTileWidth = map.tileWidth;
    this.mapTileHeight = map.tileHeight;

    const tilesets = TILESET_IMAGES
      .map((tileset) => {
        const result =
          tileset.tiledNames
            .map((tiledName) => map.addTilesetImage(tiledName, tileset.key))
            .find(Boolean) ?? null;

        if (!result) {
          console.warn(
            `[ForestBoardScene] Missing tileset: ${tileset.tiledNames.join(' / ')}. Check the Tiled tileset name and TILESET_IMAGES mapping.`
          );
        }

        return result;
      })
      .filter(Boolean) as Phaser.Tilemaps.Tileset[];

    map.layers.forEach((layerData, layerIndex) => {
        const layer = map.createLayer(layerData.name, tilesets, 0, 0);
        if (layer) {
            layer.setDepth(layerIndex * 10);
        }
    });
    this.renderShrines(map);

    const renderer = getCharacterRenderer(this.characterRenderOptions);
    Object.values(getCharacterProfiles(this.characterRenderOptions)).forEach((profile) => {
      renderer.ensureAnimations(this, profile);
    });

    // Create lightning strike animation for thunder event
    this.anims.create({
      key: 'lightning_strike_anim',
      frames: this.anims.generateFrameNumbers('lightning-bolt', { start: 0, end: 9 }),
      frameRate: 15,
      repeat: 0
    });

    // Create boss skill thunder flash animation (boss position)
    this.anims.create({
      key: 'skill_thunder1_anim',
      frames: this.anims.generateFrameNumbers('skill-thunder1', { start: 0, end: 6 }),
      frameRate: 15,
      repeat: 0
    });

    // Create boss skill thunder strike animation (per-player)
    this.anims.create({
      key: 'skill_thunder2_anim',
      frames: this.anims.generateFrameNumbers('skill-thunder2', { start: 0, end: 9 }),
      frameRate: 15,
      repeat: 0
    });

    // Create heal animation for heal action
    this.anims.create({
      key: 'heal_anim',
      frames: this.anims.generateFrameNumbers('heal-effect', { start: 0, end: 15 }),
      frameRate: 15,
      repeat: 0
    });

    // Create herb animation for herb event
    this.anims.create({
      key: 'herb_anim',
      frames: this.anims.generateFrameNumbers('herb-effect', { start: 0, end: 7 }),
      frameRate: 12,
      repeat: 0
    });

    // Create wind gust animation for wind_gust event
    this.anims.create({
      key: 'wind_gust_anim',
      frames: this.anims.generateFrameNumbers('wind-gust-effect', { start: 0, end: 5 }),
      frameRate: 12,
      repeat: 0
    });

    // Create bubble animation for lucky_bubble event
    this.anims.create({
      key: 'bubble_anim',
      frames: this.anims.generateFrameNumbers('bubble-effect', { start: 0, end: 19 }),
      frameRate: 20,
      repeat: 0
    });

    // Create ghost hit animation for ghost_hit event (8 frames, fast playback)
    this.anims.create({
      key: 'ghost_hit_anim',
      frames: this.anims.generateFrameNumbers('ghost-effect', { start: 0, end: 7 }),
      frameRate: 20,
      repeat: 0
    });

    if (!this.anims.exists(WARP_DOOR_ANIMATION_KEY)) {
      this.anims.create({
        key: WARP_DOOR_ANIMATION_KEY,
        frames: this.anims.generateFrameNumbers(WARP_DOOR_TEXTURE_KEY, { start: 0, end: 8 }),
        frameRate: 12,
        repeat: -1
      });
    }

    if (!this.anims.exists(WATER_TELEPORT_ANIMATION_KEY)) {
      this.anims.create({
        key: WATER_TELEPORT_ANIMATION_KEY,
        frames: Array.from({ length: WATER_TELEPORT_FRAME_COUNT }, (_, index) => ({
          key: `${WATER_TELEPORT_TEXTURE_KEY}-${String(index + 1).padStart(5, '0')}`,
        })),
        frameRate: WATER_TELEPORT_FRAME_RATE,
        repeat: 0,
      });
    }

    if (!this.anims.exists(BLACKHOLE_ANIMATION_KEY)) {
      this.anims.create({
        key: BLACKHOLE_ANIMATION_KEY,
        frames: this.anims.generateFrameNumbers(BLACKHOLE_TEXTURE_KEY, { start: 0, end: BLACKHOLE_FRAME_COUNT - 1 }),
        frameRate: BLACKHOLE_FRAME_RATE,
        repeat: -1
      });
    }

    if (!this.anims.exists(BLACKHOLE_ANI_ANIMATION_KEY)) {
      this.anims.create({
        key: BLACKHOLE_ANI_ANIMATION_KEY,
        frames: this.anims.generateFrameNumbers(BLACKHOLE_ANI_TEXTURE_KEY, { start: 0, end: BLACKHOLE_ANI_FRAME_COUNT - 1 }),
        frameRate: BLACKHOLE_ANI_FRAME_RATE,
        repeat: 0
      });
    }

    if (!this.anims.exists(RESPAWN_ANIMATION_KEY)) {
      this.anims.create({
        key: RESPAWN_ANIMATION_KEY,
        frames: this.anims.generateFrameNumbers(RESPAWN_TEXTURE_KEY, { start: 0, end: RESPAWN_FRAME_COUNT - 1 }),
        frameRate: RESPAWN_FRAME_RATE,
        repeat: 0
      });
    }

    if (!this.anims.exists(LP_ADD_ANIMATION_KEY)) {
      this.anims.create({
        key: LP_ADD_ANIMATION_KEY,
        frames: this.anims.generateFrameNumbers(LP_ADD_TEXTURE_KEY, { start: 0, end: LP_ADD_FRAME_COUNT - 1 }),
        frameRate: LP_ADD_FRAME_RATE,
        repeat: 0
      });
    }

    if (!this.anims.exists(LP_MINUS_ANIMATION_KEY)) {
      this.anims.create({
        key: LP_MINUS_ANIMATION_KEY,
        frames: this.anims.generateFrameNumbers(LP_MINUS_TEXTURE_KEY, { start: 0, end: LP_MINUS_FRAME_COUNT - 1 }),
        frameRate: LP_MINUS_FRAME_RATE,
        repeat: 0
      });
    }

    // Create projectile animations for boss damage crit
    if (!this.anims.exists(PROJECTILE_CHARGE_ANIMATION_KEY)) {
      this.anims.create({
        key: PROJECTILE_CHARGE_ANIMATION_KEY,
        frames: this.anims.generateFrameNumbers(PROJECTILE_CHARGE_TEXTURE_KEY, { start: 0, end: PROJECTILE_CHARGE_FRAME_COUNT - 1 }),
        frameRate: PROJECTILE_FRAME_RATE,
        repeat: 0
      });
    }

    if (!this.anims.exists(PROJECTILE_SPEAR_ANIMATION_KEY)) {
      this.anims.create({
        key: PROJECTILE_SPEAR_ANIMATION_KEY,
        frames: this.anims.generateFrameNumbers(PROJECTILE_SPEAR_TEXTURE_KEY, { start: 0, end: PROJECTILE_SPEAR_FRAME_COUNT - 1 }),
        frameRate: PROJECTILE_FRAME_RATE,
        repeat: 0
      });
    }

    if (!this.anims.exists(PROJECTILE_MAGIC_SPHERE_ANIMATION_KEY)) {
      this.anims.create({
        key: PROJECTILE_MAGIC_SPHERE_ANIMATION_KEY,
        frames: this.anims.generateFrameNumbers(PROJECTILE_MAGIC_SPHERE_TEXTURE_KEY, { start: 0, end: PROJECTILE_MAGIC_SPHERE_FRAME_COUNT - 1 }),
        frameRate: PROJECTILE_FRAME_RATE,
        repeat: 0
      });
    }

    if (!this.anims.exists(PROJECTILE_FIREBALL_ANIMATION_KEY)) {
      this.anims.create({
        key: PROJECTILE_FIREBALL_ANIMATION_KEY,
        frames: this.anims.generateFrameNumbers(PROJECTILE_FIREBALL_TEXTURE_KEY, { start: 0, end: PROJECTILE_FIREBALL_FRAME_COUNT - 1 }),
        frameRate: PROJECTILE_FRAME_RATE,
        repeat: 0
      });
    }

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.configureFollowCamera();

    this.extractPathNodes(map);
    this.rebuildCellsFromBackendConfig();
    this.renderCellMarkers();

    this.orchestrator = new AnimationOrchestrator(this);

    this.syncPlayers(this.players);
    this.playLogEntryEffect(this.activeAnimationContext);

    this.ready = true;
  
  }

  update() {
    // Keep player labels aligned with their markers every frame.
    this.playerNames.forEach((text, playerId) => {
        const marker = this.playerMarkers.get(playerId);
        if (marker) {
            const profile = this.resolveCharacterProfileFromMarker(marker, playerId);
            text.setPosition(Math.round(marker.x), Math.round(marker.y + getCharacterNameOffsetY(profile)));
            text.setDepth(marker.depth + 1);
        } else {
            text.destroy();
            this.playerNames.delete(playerId);
        }
    });
  }

  updateFromReact(
    mapConfig: MapConfig,
    players: Player[],
    followPlayerId?: string | null,
    selfPlayerId?: string | null,
    activeAnimationContext?: LogEntryAnimationContext | null,
    settlementPlayer?: Player | null,
    characterRenderOptions?: CharacterRenderOptions
  ) {
    const mapChanged = this.mapConfig !== mapConfig;
    const followChanged = this.followPlayerId !== followPlayerId;
    const selfChanged = this.selfPlayerId !== selfPlayerId;

    this.mapConfig = mapConfig;
    this.players = players ??[];
    this.followPlayerId = followPlayerId;
    this.selfPlayerId = selfPlayerId;
    this.activeAnimationContext = activeAnimationContext;
    this.settlementPlayer = settlementPlayer;
    this.characterRenderOptions = characterRenderOptions;

    if (!this.ready) return;

    if (!activeAnimationContext && !settlementPlayer && this.activeMoveAnimations.size === 0) {
      this.logDrivenPositions.clear();
    }

    if (mapChanged) {
      this.rebuildCellsFromBackendConfig();
      this.renderCellMarkers();
    }

    this.syncPlayers(this.players);
    this.playLogEntryEffect(this.activeAnimationContext);

    if (selfChanged) {
      this.refreshPlayerNameStyles();
    }

    if (followChanged) {
      this.followTargetPlayer();
    }
  }

  private configureFollowCamera() {
    const camera = this.cameras.main;
    const zoomX = camera.width / (this.mapTileWidth * CAMERA_VIEW_TILES_X);
    const zoomY = camera.height / (this.mapTileHeight * CAMERA_VIEW_TILES_Y);
    const zoom = Math.min(zoomX, zoomY);

    camera.setZoom(zoom);
    camera.roundPixels = true;
  }

  private getCameraZoom() {
    return this.cameras.main.zoom || 1;
  }

  private getWorldFontSize(screenFontSize: number) {
    return Math.max(1, Math.round(screenFontSize / this.getCameraZoom()));
  }

  private getTextTextureResolution() {
    return Math.max(PLAYER_NAME_TEXTURE_RESOLUTION, Math.ceil(this.getCameraZoom() * PLAYER_NAME_TEXTURE_RESOLUTION));
  }

  private configurePlayerNameText(text: Phaser.GameObjects.Text) {
    text.setResolution(this.getTextTextureResolution());
    text.setScale(1 / PLAYER_NAME_TEXTURE_RESOLUTION);
  }

  private getPlayerNameColor(playerId: string) {
    return playerId === this.selfPlayerId ? '#ffee58' : '#ffffff';
  }

  private applyPlayerNameStyle(playerId: string, text: Phaser.GameObjects.Text, displayName?: string) {
    text.setText(displayName || playerId);
    text.setColor(this.getPlayerNameColor(playerId));
  }

  private refreshPlayerNameStyles() {
    this.players.forEach((player) => {
      const nameText = this.playerNames.get(player.player_id);
      if (nameText) {
        this.applyPlayerNameStyle(player.player_id, nameText, player.display_name);
      }
    });
  }

  private followTargetPlayer() {
    const targetPlayerId = this.followPlayerId ?? this.players[0]?.player_id;

    if (!targetPlayerId) return;

    const marker = this.playerMarkers.get(targetPlayerId);

    if (!marker) return;

    this.cameras.main.startFollow(marker, true, 0.12, 0.12);
  }

  private renderShrines(map: Phaser.Tilemaps.Tilemap) {
    const shrineCollection = map.imageCollections.find((collection) => collection.name === SHRINE_TILESET_NAME);
    if (!shrineCollection) return;
    const shrineImages = new Map<number, { width: number; height: number }>(
      shrineCollection.images.map((image: { gid: number; width: number; height: number }) => [
        image.gid,
        { width: image.width, height: image.height },
      ])
    );

    map.objects.forEach((objectLayer) => {
      if (objectLayer.visible === false) return;

      objectLayer.objects.forEach((obj: any) => {
        const shrineImage = shrineImages.get(obj.gid);
        if (obj.visible === false || !shrineImage) return;

        const shrine = this.add.image(obj.x, obj.y, SHRINE_TEXTURE_KEY);
        shrine.setOrigin(0, 1);
        shrine.setDisplaySize(obj.width || shrineImage.width, obj.height || shrineImage.height);
        shrine.setRotation(Phaser.Math.DegToRad(obj.rotation || 0));
        shrine.setAlpha((typeof obj.opacity === 'number' ? obj.opacity : 1) * objectLayer.opacity);
        shrine.setDepth((obj.y || 0) + 40);
      });
    });
  }

  private extractPathNodes(map: Phaser.Tilemaps.Tilemap) {
    const objectLayer =
      map.getObjectLayer('path_nodes') ??
      map.getObjectLayer('对象层 1');

    if (!objectLayer) {
      console.error(
        '[ForestBoardScene] Missing path_nodes object layer. Rename the Tiled object layer to path_nodes.'
      );
      return;
    }

    this.pathNodes.clear();

    objectLayer.objects.forEach((obj: any, fallbackIndex: number) => {
      if (obj.visible === false) return;
      if (!obj.point || obj.gid) return;

      const index = Number(
        getTiledProperty<number>(obj, 'index', fallbackIndex)
      );

      if (!Number.isFinite(index)) {
        console.warn('[ForestBoardScene] Path node is missing a valid index:', obj);
        return;
      }

      this.pathNodes.set(index, {
        index,
        x: obj.x,
        y: obj.y,
        name: obj.name,
      });
    });

    if (this.mapConfig && this.pathNodes.size !== this.mapConfig.length) {
      console.warn(
        `[ForestBoardScene] Path node count (${this.pathNodes.size}) does not match map length (${this.mapConfig.length}).`
      );
    }
  }

  private rebuildCellsFromBackendConfig() {
    this.cellViews.clear();

    for (const cell of this.mapConfig.cells) {
      const node = this.pathNodes.get(cell.index);

      if (!node) {
        console.warn(
          `[ForestBoardScene] Backend cell.index=${cell.index} has no matching Tiled path_node.`
        );
        continue;
      }

      this.cellViews.set(cell.index, {
        ...cell,
        x: node.x,
        y: node.y,
      });
    }
  }

  private renderCellMarkers() {
    this.cellMarkers.forEach(({ sprite, label }) => {
      sprite.destroy();
      label.destroy();
    });

    this.cellMarkers.clear();

    for (const cell of this.cellViews.values()) {
      const sprite = this.add.sprite(cell.x, cell.y, 'logic-cell-off');
      sprite.setScale(LOGIC_CELL_MARKER_SCALE);
      sprite.setDepth(cell.y + 50);

      const label = this.add.text(cell.x, cell.y, String(cell.index), {
        fontFamily: GAME_FONT_FAMILY,
        fontSize: `${this.getWorldFontSize(CELL_LABEL_SCREEN_FONT_SIZE * PLAYER_NAME_TEXTURE_RESOLUTION)}px`,
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      });
      label.setOrigin(0.5, 0.5);
      this.configurePlayerNameText(label);
      label.setDepth(cell.y + 55);

      this.cellMarkers.set(cell.index, { sprite, label });
    }

    this.refreshCellMarkerStates();
  }

  private collectOccupiedCellIndices(players: Player[]) {
    const occupied = new Set<number>();

    players.forEach((player) => {
      if (this.activeMoveAnimations.has(player.player_id)) return;

      const visualPosition = this.logDrivenPositions.get(player.player_id) ?? player.position;
      if (this.cellViews.has(visualPosition)) {
        occupied.add(visualPosition);
      }
    });

    return occupied;
  }

  private refreshCellMarkerStates(players: Player[] = this.players) {
    const occupied = this.collectOccupiedCellIndices(players);

    this.cellMarkers.forEach(({ sprite }, cellIndex) => {
      sprite.setTexture(occupied.has(cellIndex) ? 'logic-cell-on' : 'logic-cell-off');
    });
  }

 private syncPlayers(players: Player[]) {
    players.forEach((player, order) => {
      const visualPosition = this.logDrivenPositions.get(player.player_id) ?? player.position;
      const cell = this.cellViews.get(visualPosition);
      if (!cell) {
        console.warn(
          `[ForestBoardScene] player ${player.display_name} position=${player.position} has no mapped cell.`
        );
        return;
      }
      const profile = this.resolveCharacterProfileForPlayer(player, order);
      const offsetX = getCharacterOffsetX(profile) + (isBossPlayer(player) ? 0 : (order % 4) * 10 - 15);
      const targetX = cell.x + offsetX;
      const targetY = cell.y + getCharacterOffsetY(profile);
      let marker = this.playerMarkers.get(player.player_id);
      const nameText = this.playerNames.get(player.player_id);
      if (nameText) {
        this.applyPlayerNameStyle(player.player_id, nameText, player.display_name);
      }
      if (!marker) {
        const renderer = getCharacterRenderer(this.characterRenderOptions);
        marker = renderer.createSprite({
          scene: this,
          player,
          profile,
          x: targetX,
          y: targetY,
        });
        renderer.play(this, marker, profile, 'idle');
        marker.setDepth(targetY + 100);
        marker.setData('characterProfileId', profile.id);
        this.playerMarkers.set(player.player_id, marker);
        const playerName = this.add.text(targetX, targetY + getCharacterNameOffsetY(profile), player.display_name, {
          fontFamily: GAME_FONT_FAMILY,
          fontSize: `${this.getWorldFontSize(PLAYER_NAME_SCREEN_FONT_SIZE * PLAYER_NAME_TEXTURE_RESOLUTION)}px`,
          color: this.getPlayerNameColor(player.player_id),
          stroke: '#000000',
          strokeThickness: 3,
        });
        playerName.setOrigin(0.5, 0.5);
        this.configurePlayerNameText(playerName);
        this.applyPlayerNameStyle(player.player_id, playerName, player.display_name);
        playerName.setDepth(targetY + 200);
        this.playerNames.set(player.player_id, playerName);
        if (player.player_id === this.followPlayerId) {
          this.followTargetPlayer();
        }
        try {
          const avatarBase64 = renderer.getAvatarDataUrl?.(this, marker, profile) ?? null;
          if (avatarBase64) {
            window.dispatchEvent(new CustomEvent('ui-player-avatar', {
              detail: {
                playerId: player.player_id,
                avatarUrl: avatarBase64,
              },
            }));
          }
        } catch (e) {
          console.warn(`Failed to extract avatar for ${player.display_name}.`, e);
        }
        return;
      }
      marker.setData('characterProfileId', profile.id);
      this.restoreLivingPlayerAnimation(marker, player, profile);
      if (this.activeMoveAnimations.has(player.player_id)) {
        marker.setDepth((marker.y ?? targetY) + 100);
      } else {
        this.tweens.add({
          targets: marker,
          x: targetX,
          y: targetY,
          duration: 250,
          ease: 'Sine.easeInOut',
          onUpdate: () => {
            marker?.setDepth((marker.y ?? targetY) + 100);
          },
        });
      }
    });
    this.refreshCellMarkerStates(players);
    this.followTargetPlayer();
  }

  private restoreLivingPlayerAnimation(
    marker: Phaser.GameObjects.Sprite,
    player: Player,
    profile: CharacterRenderProfile
  ) {
    if (player.is_dead) return;
    if (this.activeMoveAnimations.has(player.player_id)) return;

    const currentAnimationKey = marker.anims.currentAnim?.key;
    if (!currentAnimationKey) return;

    const deadAnimationKey = getAnimationKey(profile, 'dead');
    if (currentAnimationKey !== deadAnimationKey) return;

    const renderer = getCharacterRenderer(this.characterRenderOptions);
    renderer.play(this, marker, profile, 'idle');
  }

  private resolveCharacterProfileForPlayer(player: Player, order: number): CharacterRenderProfile {
    return resolveCharacterProfile(player, order, this.characterRenderOptions);
  }

  private resolveCharacterProfileFromMarker(
    marker: Phaser.GameObjects.Sprite,
    playerId: string
  ): CharacterRenderProfile {
    const profileId = marker.getData('characterProfileId');
    const profiles = getCharacterProfiles(this.characterRenderOptions);
    if (typeof profileId === 'string' && profiles[profileId]) {
      return profiles[profileId];
    }
    const playerIndex = this.players.findIndex((player) => player.player_id === playerId);
    const player = this.players[playerIndex];
    if (player) {
      return this.resolveCharacterProfileForPlayer(player, Math.max(0, playerIndex));
    }
    const fallbackProfile = Object.values(profiles)[0];
    if (!fallbackProfile) {
      throw new Error('[ForestBoardScene] No character render profile available.');
    }
    return fallbackProfile;
  }


  private playLogEntryEffect(context?: LogEntryAnimationContext | null) {
    if (!context || !shouldRenderBoardLogEntryAnimation(context)) return;

    const { entry } = context;

    const effectKey = `${context.sequenceIndex}:${entry.timestamp}:${entry.type}:${entry.action_type}:${entry.target}:${entry.source}`;
    if (effectKey === this.lastEffectKey) return;
    this.lastEffectKey = effectKey;

    const renderer = this.boardAnimationRenderers[entry.action_type] ?? ((ctx) => playGenericLogEntryEffect(this.buildAnimationCtx(), ctx, this.followPlayerId, this.settlementPlayer));

    renderer(context);
  }


}
