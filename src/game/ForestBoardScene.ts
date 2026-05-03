import * as Phaser from 'phaser';
import type { LogEntry, MapConfig, MapCellConfig, Player } from '../types/protocol';
import { getTiledProperty } from './tiledHelpers';
import {
  MOVE_STEP_MS,
  describeLogEntryEffect,
  getMetadataBoolean,
  getMetadataNumber,
  getMetadataNumberArray,
  getMetadataString,
} from './logEntryPlayback';
import { getEventEffectConfig, getEventTypeFromEntry } from './eventAnimations';
import { useGameStore } from '../store/gameStore';
import {
  isAnyDoorTeleportEntry,
  shouldRenderBoardLogEntryAnimation,
  type LogEntryAnimationContext,
} from './logEntryAnimationPolicy';
import {
  getAnimationKey,
  getCharacterEffectOffsetY,
  getCharacterNameOffsetY,
  getCharacterOffsetY,
  getCharacterProfiles,
  getCharacterRenderer,
  resolveCharacterProfile,
  type CharacterAnimationState,
  type CharacterRenderOptions,
  type CharacterRenderProfile,
} from './characterRenderConfig';
import { isBossPlayer } from './bossVisualConfig';

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
const GAME_FONT_FAMILY = 'Zpix, sans-serif';
const PLAYER_NAME_SCREEN_FONT_SIZE = 14;
const CELL_LABEL_SCREEN_FONT_SIZE = 12;
const PLAYER_NAME_TEXTURE_RESOLUTION = 2;
const LOGIC_CELL_MARKER_SCALE = 1.5;
const SHRINE_TEXTURE_KEY = 'map-shrine';
const SHRINE_TILESET_NAME = 'shrine';
const WARP_DOOR_TEXTURE_KEY = 'warp-door';
const WARP_DOOR_ANIMATION_KEY = 'warp-door-swirl';
const WATER_TELEPORT_TEXTURE_KEY = 'water-teleport';
const WATER_TELEPORT_ANIMATION_KEY = 'water-teleport-vortex';
const WATER_TELEPORT_FRAME_COUNT = 48;
const WATER_TELEPORT_FRAME_RATE = 24;
const BLACKHOLE_TEXTURE_KEY = 'blackhole';
const BLACKHOLE_ANIMATION_KEY = 'blackhole-rotate';
const BLACKHOLE_ANI_TEXTURE_KEY = 'blackhole-ani';
const BLACKHOLE_ANI_ANIMATION_KEY = 'blackhole-ani-effect';
const BLACKHOLE_ANI_FRAME_COUNT = 3;
const BLACKHOLE_FRAME_COUNT = 8;
const BLACKHOLE_FRAME_RATE = 24;
const BLACKHOLE_ANI_FRAME_RATE = 12;
const RESPAWN_TEXTURE_KEY = 'respawn-effect';
const RESPAWN_ANIMATION_KEY = 'respawn_anim';
const RESPAWN_FRAME_WIDTH = 32;
const RESPAWN_FRAME_HEIGHT = 32;
const RESPAWN_FRAME_COUNT = 12;
const RESPAWN_FRAME_RATE = 18;
const LP_ADD_TEXTURE_KEY = 'lp-add-effect';
const LP_ADD_ANIMATION_KEY = 'lp_add_anim';
const LP_ADD_FRAME_WIDTH = 64;
const LP_ADD_FRAME_HEIGHT = 64;
const LP_ADD_FRAME_COUNT = 12;
const LP_ADD_FRAME_RATE = 18;
const LP_MINUS_TEXTURE_KEY = 'lp-minus-effect';
const LP_MINUS_ANIMATION_KEY = 'lp_minus_anim';
const LP_MINUS_FRAME_WIDTH = 64;
const LP_MINUS_FRAME_HEIGHT = 64;
const LP_MINUS_FRAME_COUNT = 21;
const LP_MINUS_FRAME_RATE = 18;
const BLACKHOLE_SIZE_SCALE = 2.0;
const WARP_DOOR_CELL_OFFSET_Y = 1;
const WARP_DOOR_DEPTH_OFFSET = 52;
const WARP_DOOR_PLAYER_FRONT_DEPTH_OFFSET = 76;

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
  private readonly boardAnimationRenderers: Record<string, BoardAnimationRenderer> = {
    move: (context) => this.playMoveAnimation(context),
    teleport: (context) => this.playTeleportAnimation(context),
    damage: (context) => this.playDamageAnimation(context),
    heal: (context) => this.playHealAnimation(context),
    death: (context) => this.playDeathAnimation(context),
    fell_down: (context) => this.playDeathAnimation(context),
    respawn: (context) => this.playRespawnAnimation(context),
    modify_lp: (context) => this.playModifyLpAnimation(context),
    draw_event: (context) => this.playDrawEventAnimation(context),
    boss_damage: (context) => this.playBossDamageAnimation(context),
    boss_attack: (context) => this.playBossAttackAnimation(context),
    boss_skill: (context) => this.playBossSkillAnimation(context),
  };

  private ready = false;

  // 【新增】屏幕中心弹窗相关
  private centerPopup: Phaser.GameObjects.Container | null = null;

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

    // Load heal effect sprite sheet for heal action
    this.load.spritesheet('heal-effect', '/assets/effects/heal.png', {
      frameWidth: 72,
      frameHeight: 72
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

    // Create heal animation for heal action
    this.anims.create({
      key: 'heal_anim',
      frames: this.anims.generateFrameNumbers('heal-effect', { start: 0, end: 7 }),
      frameRate: 12,
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

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.configureFollowCamera();

    this.extractPathNodes(map);
    this.rebuildCellsFromBackendConfig();
    this.renderCellMarkers();
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
      const offsetX = isBossPlayer(player) ? 0 : (order % 4) * 10 - 15;
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

    const renderer = this.boardAnimationRenderers[entry.action_type] ?? this.playGenericLogEntryEffect;

    renderer(context);
  }

  private getBossPlayer() {
    return this.players.find(isBossPlayer) ?? null;
  }

  private getBossMarker() {
    const bossPlayer = this.getBossPlayer();
    return bossPlayer ? this.playerMarkers.get(bossPlayer.player_id) ?? null : null;
  }

  private getBossTargetIds(entry: LogEntry) {
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

  private playBossProfileAnimation(
    marker: Phaser.GameObjects.Sprite,
    playerId: string,
    state: CharacterAnimationState,
    returnToIdle = true
  ) {
    const profile = this.resolveCharacterProfileFromMarker(marker, playerId);
    const renderer = getCharacterRenderer(this.characterRenderOptions);

    if (!profile.animations[state] || !renderer.hasAnimation?.(this, profile, state)) return false;

    const animationEvent = `animationcomplete-${getAnimationKey(profile, state)}`;
    marker.removeAllListeners(animationEvent);
    renderer.play(this, marker, profile, state);

    if (returnToIdle) {
      marker.once(animationEvent, () => {
        renderer.play(this, marker, profile, 'idle');
      });
    }

    return true;
  }

  private getPlayerIdForMarker(marker: Phaser.GameObjects.Sprite) {
    return this.players.find((player) => this.playerMarkers.get(player.player_id) === marker)?.player_id;
  }

  private getMarkerEffectPoint(marker: Phaser.GameObjects.Sprite, playerId?: string) {
    const resolvedPlayerId = playerId ?? this.getPlayerIdForMarker(marker);
    const profile = resolvedPlayerId
      ? this.resolveCharacterProfileFromMarker(marker, resolvedPlayerId)
      : null;
    return {
      x: marker.x,
      y: marker.y + (profile ? getCharacterEffectOffsetY(profile) : 0),
    };
  }

  private playBossPulse(
    marker: Phaser.GameObjects.Sprite,
    label: string,
    color: number,
    textColor = '#ffebee',
    scale = 2.2
  ) {
    const { x, y } = this.getMarkerEffectPoint(marker);

    const ring = this.add.circle(x, y, 28, color, 0.14);
    ring.setStrokeStyle(4, color, 1);
    ring.setDepth(y + 220);

    const text = this.add.text(x, y - 46, label, {
      fontFamily: GAME_FONT_FAMILY,
      fontSize: '22px',
      fontStyle: 'bold',
      color: textColor,
      align: 'center',
      stroke: '#0b1020',
      strokeThickness: 5,
    });
    text.setOrigin(0.5, 0.5);
    text.setDepth(y + 235);

    this.tweens.add({
      targets: ring,
      scale,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    this.tweens.add({
      targets: text,
      y: y - 92,
      alpha: 0,
      scale: 1.08,
      duration: 1050,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private playBossLineEffect(
    fromMarker: Phaser.GameObjects.Sprite,
    toMarker: Phaser.GameObjects.Sprite,
    color: number,
    label?: string
  ) {
    const fromPoint = this.getMarkerEffectPoint(fromMarker);
    const toPoint = this.getMarkerEffectPoint(toMarker);
    const fromX = fromPoint.x;
    const fromY = fromPoint.y - 10;
    const toX = toPoint.x;
    const toY = toPoint.y - 10;
    const depth = Math.max(fromMarker.y, toMarker.y) + 260;

    const line = this.add.graphics();
    line.lineStyle(6, color, 0.92);
    line.beginPath();
    line.moveTo(fromX, fromY);
    line.lineTo(toX, toY);
    line.strokePath();
    line.setDepth(depth);

    const impactRing = this.add.circle(toPoint.x, toPoint.y, 18, color, 0.12);
    impactRing.setStrokeStyle(3, color, 1);
    impactRing.setDepth(depth + 1);

    const cleanupTargets: Phaser.GameObjects.GameObject[] = [line, impactRing];
    if (label) {
      const text = this.add.text((fromX + toX) / 2, (fromY + toY) / 2 - 16, label, {
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

    this.tweens.add({
      targets: cleanupTargets,
      alpha: 0,
      duration: 760,
      ease: 'Cubic.easeOut',
      onComplete: () => cleanupTargets.forEach((target) => target.destroy()),
    });
  }

  private playBossThornsPulse(marker: Phaser.GameObjects.Sprite) {
    this.playBossPulse(marker, 'Boss 荆棘', 0x8e24aa, '#f3e5f5', 2.05);

    const { x: centerX, y: centerY } = this.getMarkerEffectPoint(marker);
    const spikes = this.add.graphics();
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

    spikes.setDepth(centerY + 226);
    this.tweens.add({
      targets: spikes,
      alpha: 0,
      duration: 1100,
      ease: 'Cubic.easeOut',
      onComplete: () => spikes.destroy(),
    });
  }

  private playBossDamageAnimation(context: LogEntryAnimationContext) {
    const { entry } = context;
    const bossPlayer = this.getBossPlayer();
    const bossMarker = this.getBossMarker();
    if (!bossPlayer || !bossMarker) {
      this.playGenericLogEntryEffect(context);
      return;
    }

    const damage = getMetadataNumber(entry.metadata, 'damage') ?? 0;
    const isCrit = getMetadataBoolean(entry.metadata, 'is_crit');
    const remainingHp = getMetadataNumber(entry.metadata, 'boss_remaining_hp');
    const isDefeated = remainingHp !== null ? remainingHp <= 0 : bossPlayer.is_dead || bossPlayer.hp <= 0;
    const color = isCrit ? 0xff1744 : 0xef5350;
    const label = damage > 0 ? `Boss -${damage}${isCrit ? ' CRIT' : ''}` : `Boss 受击${isCrit ? ' CRIT' : ''}`;

    const sourceMarker = this.playerMarkers.get(entry.source);
    if (sourceMarker && sourceMarker !== bossMarker) {
      this.playBossLineEffect(sourceMarker, bossMarker, color, isCrit ? 'CRIT' : 'HIT');
    }

    bossMarker.setTint(0xffffff);
    this.time.delayedCall(120, () => bossMarker.clearTint());
    this.playBossPulse(bossMarker, label, color, '#ffebee', isCrit ? 2.75 : 2.2);

    if (isCrit) {
      this.cameras.main.flash(120, 255, 235, 235);
    }

    if (isDefeated) {
      this.time.delayedCall(260, () => {
        const currentBossPlayer = this.getBossPlayer();
        const currentBossMarker = this.getBossMarker();
        if (!currentBossPlayer || !currentBossMarker) return;

        this.playBossProfileAnimation(currentBossMarker, currentBossPlayer.player_id, 'defeated', false);
      });
    }
  }

  private playBossAttackAnimation(context: LogEntryAnimationContext) {
    const { entry } = context;
    const bossPlayer = this.getBossPlayer();
    const bossMarker = this.getBossMarker();
    if (!bossPlayer || !bossMarker) {
      this.playGenericLogEntryEffect(context);
      return;
    }

    const targetMarker = this.playerMarkers.get(entry.target);
    if (targetMarker) {
      bossMarker.setFlipX(targetMarker.x < bossMarker.x);
    }

    this.playBossProfileAnimation(bossMarker, bossPlayer.player_id, 'attack');

    const attackType = getMetadataString(entry.metadata, 'attack_type') || 'normal';
    const isCrit = attackType === 'crit' || getMetadataBoolean(entry.metadata, 'is_crit');
    const color = isCrit ? 0xff1744 : 0xd32f2f;
    this.playBossPulse(bossMarker, isCrit ? 'Boss 暴击' : 'Boss 普攻', color, '#ffebee', isCrit ? 2.4 : 2.0);

    if (targetMarker) {
      this.playBossLineEffect(bossMarker, targetMarker, color, isCrit ? 'CRIT' : 'ATTACK');
    }
  }

  private playBossSkillAnimation(context: LogEntryAnimationContext) {
    const { entry } = context;
    const bossPlayer = this.getBossPlayer();
    const bossMarker = this.getBossMarker();
    if (!bossPlayer || !bossMarker) {
      this.playGenericLogEntryEffect(context);
      return;
    }

    this.playBossProfileAnimation(bossMarker, bossPlayer.player_id, 'skill_cast');

    const skillType = getMetadataString(entry.metadata, 'skill_type') || 'skill';
    const targetIds = this.getBossTargetIds(entry);
    const targetMarkers = targetIds
      .map((targetId) => this.playerMarkers.get(targetId))
      .filter((marker): marker is Phaser.GameObjects.Sprite => Boolean(marker));

    switch (skillType) {
      case 'thunder':
        this.playBossPulse(bossMarker, 'Boss 雷击', 0xfff176, '#fffde7', 2.15);
        targetIds.forEach((targetId) => {
          if (!this.playerMarkers.has(targetId)) return;
          this.playLightningStrikeAnimation({
            ...context,
            entry: {
              ...entry,
              target: targetId,
            },
          });
        });
        break;
      case 'curse':
        this.playBossPulse(bossMarker, 'Boss 诅咒', 0x7e57c2, '#f3e5f5', 2.1);
        targetMarkers.forEach((marker) => this.playBossPulse(marker, '诅咒', 0x7e57c2, '#f3e5f5', 1.8));
        break;
      case 'rest':
        this.playBossPulse(bossMarker, 'Boss 回复', 0x66bb6a, '#e8f5e9', 2.2);
        break;
      case 'thorns':
        this.playBossThornsPulse(bossMarker);
        break;
      default:
        this.playBossPulse(bossMarker, `Boss ${skillType}`, 0x90a4ae, '#eceff1', 2.0);
        break;
    }
  }

  private isBossReflectDamage(entry: LogEntry) {
    return entry.action_type === 'damage' && entry.source === 'buff_thorns';
  }

  private playBossReflectAnimation(context: LogEntryAnimationContext) {
    const { entry } = context;
    const bossMarker = this.getBossMarker();
    const targetMarker = this.playerMarkers.get(entry.target);
    if (!bossMarker || !targetMarker) return;

    bossMarker.setFlipX(targetMarker.x < bossMarker.x);
    this.playBossThornsPulse(bossMarker);
    this.playBossLineEffect(bossMarker, targetMarker, 0x8e24aa, '反刺');
  }

  private playGenericLogEntryEffect = (context: LogEntryAnimationContext) => {
    const { entry } = context;

    if (this.shouldSuppressSettlementEffect(entry)) return;

    const marker = this.playerMarkers.get(entry.target) ?? this.playerMarkers.get(this.followPlayerId || '');
    if (!marker) return;

    const effect = describeLogEntryEffect(entry, useGameStore.getState().definitions);
    const point = this.getMarkerEffectPoint(marker, entry.target);
    const x = point.x;
    const y = point.y;
    const ring = this.add.circle(x, y, 24, effect.color, 0.12);
    ring.setStrokeStyle(4, effect.color, 1);
    ring.setDepth(y + 210);

    const text = this.add.text(x, y - 42, effect.label, {
      fontFamily: GAME_FONT_FAMILY,
      fontSize: '22px',
      fontStyle: 'bold',
      color: effect.textColor,
      align: 'center',
      stroke: '#0b1020',
      strokeThickness: 5,
    });
    text.setOrigin(0.5, 0.5);
    text.setDepth(y + 230);

    // Use a light scale punch because the base sprite is already scaled down.
    this.tweens.add({
      targets: marker,
      scale: 0.9,
      duration: 140,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
    });

    this.tweens.add({
      targets: ring,
      scale: 2.2,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    this.tweens.add({
      targets: text,
      y: y - 88,
      alpha: 0,
      scale: 1.15,
      duration: 1050,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  };

  private playDamageAnimation(context: LogEntryAnimationContext) {
    const { entry } = context;
    if (this.isBossReflectDamage(entry)) {
      this.playBossReflectAnimation(context);
    }

    const marker = this.playerMarkers.get(entry.target);
    if (!marker) {
      this.playGenericLogEntryEffect(context);
      return;
    }

    const profile = this.resolveCharacterProfileFromMarker(marker, entry.target);
    const renderer = getCharacterRenderer(this.characterRenderOptions);

    if (profile.animations.hurt && renderer.hasAnimation?.(this, profile, 'hurt')) {
      const hurtAnimationEvent = `animationcomplete-${getAnimationKey(profile, 'hurt')}`;
      marker.removeAllListeners(hurtAnimationEvent);
      renderer.play(this, marker, profile, 'hurt');
      marker.once(hurtAnimationEvent, () => {
        const nextState = this.activeMoveAnimations.has(entry.target) ? 'move' : 'idle';
        renderer.play(this, marker, profile, nextState);
      });
    }

    this.playGenericLogEntryEffect(context);
  }

  private playDeathAnimation(context: LogEntryAnimationContext) {
    const { entry } = context;
    const marker = this.playerMarkers.get(entry.target);
    if (!marker) {
      this.playGenericLogEntryEffect(context);
      return;
    }

    const profile = this.resolveCharacterProfileFromMarker(marker, entry.target);
    const renderer = getCharacterRenderer(this.characterRenderOptions);
    const targetPlayer = this.players.find((player) => player.player_id === entry.target);
    if (
      targetPlayer &&
      isBossPlayer(targetPlayer) &&
      this.playBossProfileAnimation(marker, targetPlayer.player_id, 'defeated', false)
    ) {
      this.playGenericLogEntryEffect(context);
      return;
    }


    if (profile.animations.dead && renderer.hasAnimation?.(this, profile, 'dead')) {
      const deadAnimationEvent = `animationcomplete-${getAnimationKey(profile, 'dead')}`;
      marker.removeAllListeners(deadAnimationEvent);
      renderer.play(this, marker, profile, 'dead');
    }

    this.playGenericLogEntryEffect(context);
  }

  private playRespawnAnimation(context: LogEntryAnimationContext) {
    const { entry } = context;
    const marker = this.playerMarkers.get(entry.target);
    if (!marker) {
      this.playGenericLogEntryEffect(context);
      return;
    }

    const profile = this.resolveCharacterProfileFromMarker(marker, entry.target);
    const renderer = getCharacterRenderer(this.characterRenderOptions);
    const checkpointPos = getMetadataNumber(entry.metadata, 'checkpoint_pos');
    const respawnScale = profile.scale ?? 0.65;

    const playRespawnEffectAt = (x: number, y: number, depth: number) => {
      const respawnSprite = this.add.sprite(x, y, RESPAWN_TEXTURE_KEY);
      respawnSprite.setScale(2.3);
      respawnSprite.setOrigin(0.5, 0.5);
      respawnSprite.setDepth(depth + 30);
      respawnSprite.play(RESPAWN_ANIMATION_KEY);
      respawnSprite.once('animationcomplete', () => {
        respawnSprite.destroy();
      });
    };

    if (checkpointPos !== null) {
      const checkpointCell = this.cellViews.get(checkpointPos);
      if (checkpointCell) {
        const playerIndex = this.players.findIndex((player) => player.player_id === entry.target);
        const order = playerIndex >= 0 ? playerIndex : 0;
        const offsetX = (order % 4) * 10 - 15;
        const targetX = checkpointCell.x + offsetX;
        const targetY = checkpointCell.y + getCharacterOffsetY(profile);

        this.logDrivenPositions.set(entry.target, checkpointPos);
        this.refreshCellMarkerStates();

        this.tweens.killTweensOf(marker);
        this.tweens.add({
          targets: marker,
          alpha: 0,
          duration: 120,
          ease: 'Sine.easeIn',
          onComplete: () => {
            marker.setPosition(targetX, targetY);
            marker.setDepth(targetY + 100);
            marker.setScale(respawnScale);
            marker.setAlpha(1);
            renderer.play(this, marker, profile, 'idle');
            playRespawnEffectAt(targetX, targetY, marker.depth);
            this.playGenericLogEntryEffect(context);
          },
        });
        return;
      }
    }

    renderer.play(this, marker, profile, 'idle');
  marker.setScale(respawnScale);
    playRespawnEffectAt(marker.x, marker.y, marker.depth);

    this.playGenericLogEntryEffect(context);
  }

  private shouldSuppressSettlementEffect(entry: LogEntry) {
    if (!this.settlementPlayer || entry.target !== this.settlementPlayer.player_id) return false;

    return [
      'damage',
      'heal',
      'fell_down',
      'modify_lp',
      'add_buff',
      'remove_buff',
    ].includes(entry.action_type);
  }

  private playMoveAnimation(context: LogEntryAnimationContext) {
    const { entry } = context;
    const marker = this.playerMarkers.get(entry.target);
    if (!marker) return;
    const path = getMetadataNumberArray(entry.metadata, 'path');
    if (path.length < 2) {
      const endPos = entry.metadata && Object.prototype.hasOwnProperty.call(entry.metadata, 'end_pos')
        ? getMetadataNumber(entry.metadata, 'end_pos')
        : null;
      if (endPos !== null) {
        console.log('[ForestBoardScene] Directly setting player position from end_pos:', endPos);
        this.logDrivenPositions.set(entry.target, endPos);
        this.refreshCellMarkerStates();
      }
      return;
    }
    const startCell = this.cellViews.get(path[0]);
    const currentOffsetX = startCell ? marker.x - startCell.x : 0;
    const currentOffsetY = startCell ? marker.y - startCell.y : -16;
    const points = path
      .slice(1)
      .map((cellIndex) => this.cellViews.get(cellIndex))
      .filter((cell): cell is BoardCellView => Boolean(cell))
      .map((cell) => ({
        x: cell.x + currentOffsetX,
        y: cell.y + currentOffsetY,
        cellIndex: cell.index,
      }));
    if (points.length === 0) return;
    const profile = this.resolveCharacterProfileFromMarker(marker, entry.target);
    const renderer = getCharacterRenderer(this.characterRenderOptions);
    let index = 0;
    renderer.play(this, marker, profile, 'move');
    this.activeMoveAnimations.add(entry.target);
    this.refreshCellMarkerStates();
    this.tweens.killTweensOf(marker);
    const runNext = () => {
      const point = points[index];
      if (!point) {
        renderer.play(this, marker, profile, 'idle');
        this.activeMoveAnimations.delete(entry.target);
        this.refreshCellMarkerStates();
        return;
      }
      if (point.x < marker.x) {
        marker.setFlipX(true);
      } else if (point.x > marker.x) {
        marker.setFlipX(false);
      }
      this.tweens.add({
        targets: marker,
        x: point.x,
        y: point.y,
        duration: MOVE_STEP_MS,
        ease: 'Linear',
        onUpdate: () => {
          marker.setDepth((marker.y ?? point.y) + 100);
        },
        onComplete: () => {
          this.logDrivenPositions.set(entry.target, point.cellIndex);
          this.refreshCellMarkerStates();
          index += 1;
          runNext();
        },
      });
    };
    runNext();
  }

  private playTeleportAnimation(context: LogEntryAnimationContext) {
    const { entry } = context;
    if (!isAnyDoorTeleportEntry(entry)) {
      this.playBlackholeTeleportAnimation(context);
      return;
    }

    const marker = this.playerMarkers.get(entry.target);
    const fromPos = getMetadataNumber(entry.metadata, 'from_pos');
    const toPos = getMetadataNumber(entry.metadata, 'to_pos');

    if (!marker || fromPos === null || toPos === null) {
      this.playGenericLogEntryEffect(context);
      return;
    }

    const fromCell = this.cellViews.get(fromPos);
    const toCell = this.cellViews.get(toPos);
    if (!fromCell || !toCell) {
      this.playGenericLogEntryEffect(context);
      return;
    }

    const currentOffsetX = marker.x - fromCell.x;
    const currentOffsetY = marker.y - fromCell.y;
    const targetX = toCell.x + currentOffsetX;
    const targetY = toCell.y + currentOffsetY;
    const travelSign = targetX >= marker.x ? 1 : -1;
    const originalScaleX = Math.abs(marker.scaleX) || 1;
    const originalScaleY = Math.abs(marker.scaleY) || 1;
    const originalAlpha = marker.alpha || 1;
    const entranceDoorX = marker.x + travelSign * 30;
    const doorOffsetY = this.mapTileHeight * WARP_DOOR_CELL_OFFSET_Y;
    const entranceDoorY = marker.y + 18 + doorOffsetY;
    const exitDoorX = targetX - travelSign * 30;
    const exitDoorY = targetY + 18 + doorOffsetY;
    const depthBase = Math.max(entranceDoorY, exitDoorY) + 260;
    const entrancePlayerDepth = entranceDoorY + WARP_DOOR_PLAYER_FRONT_DEPTH_OFFSET;
    const exitPlayerDepth = exitDoorY + WARP_DOOR_PLAYER_FRONT_DEPTH_OFFSET;

    const renderer = getCharacterRenderer(this.characterRenderOptions);
    const profile = this.resolveCharacterProfileFromMarker(marker, entry.target);
    const doors: Phaser.GameObjects.GameObject[] = [];
    const doorGlows: Phaser.GameObjects.Sprite[] = [];

    const makeDoor = (x: number, y: number, flipX: boolean) => {
      const door = this.add.sprite(x, y, WARP_DOOR_TEXTURE_KEY);
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
      const glow = this.add.sprite(x, y, WARP_DOOR_TEXTURE_KEY);
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
    const label = this.add.text((entranceDoorX + exitDoorX) / 2, Math.min(entranceDoorY, exitDoorY) - 76, `${fromPos} -> ${toPos}`, {
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

    this.logDrivenPositions.set(entry.target, fromPos);
    this.activeMoveAnimations.add(entry.target);
    this.refreshCellMarkerStates();
    this.tweens.killTweensOf(marker);

    this.tweens.add({
      targets: [entranceDoor, exitDoor],
      alpha: 1,
      scale: 1.22,
      duration: 220,
      ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: doorGlows,
      alpha: 0.58,
      scale: 1.34,
      duration: 420,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: label,
      alpha: { from: 0, to: 1 },
      y: label.y - 16,
      duration: 360,
      yoyo: true,
      hold: 900,
      ease: 'Cubic.easeOut',
    });

    marker.setFlipX(travelSign < 0);
    renderer.play(this, marker, profile, 'move');
    this.tweens.add({
      targets: marker,
      x: marker.x + travelSign * 14,
      duration: 260,
      ease: 'Sine.easeInOut',
      onUpdate: () => marker.setDepth(entrancePlayerDepth),
      onComplete: () => {
        this.tweens.add({
          targets: marker,
          x: entranceDoorX - travelSign * 3,
          alpha: 0,
          duration: 420,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            this.logDrivenPositions.set(entry.target, toPos);
            this.refreshCellMarkerStates();
            marker.setPosition(exitDoorX + travelSign * 3, targetY);
            marker.setScale(originalScaleX, originalScaleY);
            marker.setAlpha(0);
            marker.setFlipX(travelSign < 0);
            marker.setDepth(exitPlayerDepth);

            this.time.delayedCall(120, () => {
              this.tweens.add({
                targets: marker,
                x: targetX,
                y: targetY,
                alpha: originalAlpha,
                duration: 520,
                ease: 'Cubic.easeOut',
                onUpdate: () => marker.setDepth(exitPlayerDepth),
                onComplete: () => {
                  renderer.play(this, marker, profile, 'idle');
                  this.activeMoveAnimations.delete(entry.target);
                  this.refreshCellMarkerStates();
                },
              });
            });
          },
        });
      },
    });

    this.time.delayedCall(2100, () => {
      this.tweens.add({
        targets: doors,
        alpha: 0,
        scale: 0.92,
        duration: 360,
        ease: 'Cubic.easeIn',
        onComplete: () => doors.forEach((object) => object.destroy()),
      });
    });
  }

  private playBlackholeTeleportAnimation(context: LogEntryAnimationContext) {
    const { entry } = context;
    const marker = this.playerMarkers.get(entry.target);
    const fromPos = getMetadataNumber(entry.metadata, 'from_pos');
    const toPos = getMetadataNumber(entry.metadata, 'to_pos');

    if (!marker || fromPos === null || toPos === null) {
      this.playGenericLogEntryEffect(context);
      return;
    }

    const fromCell = this.cellViews.get(fromPos);
    const toCell = this.cellViews.get(toPos);
    if (!fromCell || !toCell) {
      this.playGenericLogEntryEffect(context);
      return;
    }

    const currentOffsetX = marker.x - fromCell.x;
    const currentOffsetY = marker.y - fromCell.y;
    const targetX = toCell.x + currentOffsetX;
    const targetY = toCell.y + currentOffsetY;
    const originalScaleX = Math.abs(marker.scaleX) || 1;
    const originalScaleY = Math.abs(marker.scaleY) || 1;
    const originalAlpha = marker.alpha || 1;
    const sourceDepth = marker.y + 260;
    const targetDepth = targetY + 260;

    const renderer = getCharacterRenderer(this.characterRenderOptions);
    const profile = this.resolveCharacterProfileFromMarker(marker, entry.target);

    const profileScale = profile.scale ?? 0.65;
    const characterWidth = profile.animations.idle.frameWidth * profileScale;
    const centerY = marker.y;

    // Phase 1: 黑洞出现并覆盖人物 (0-400ms)
    const blackholeAppearDuration = 400;
    const sourceBlackhole = this.add.sprite(marker.x, centerY, BLACKHOLE_TEXTURE_KEY);
    sourceBlackhole.setOrigin(0.5, 0.5);
    sourceBlackhole.setDisplaySize(10, 10);
    sourceBlackhole.setAlpha(1);
    sourceBlackhole.setDepth(sourceDepth + 1);
    sourceBlackhole.play(BLACKHOLE_ANIMATION_KEY);

    this.tweens.add({
      targets: sourceBlackhole,
      displayWidth: characterWidth * BLACKHOLE_SIZE_SCALE,
      displayHeight: characterWidth * BLACKHOLE_SIZE_SCALE,
      duration: blackholeAppearDuration,
      ease: 'Back.easeOut',
    });

    // Phase 2: 黑洞吸收人物，旋转并一起消失 (400-800ms)
    this.time.delayedCall(blackholeAppearDuration, () => {
      const rotatingBlackhole = this.add.sprite(marker.x, centerY, BLACKHOLE_TEXTURE_KEY);
      rotatingBlackhole.setOrigin(0.5, 0.5);
      rotatingBlackhole.setDisplaySize(characterWidth * BLACKHOLE_SIZE_SCALE, characterWidth * BLACKHOLE_SIZE_SCALE);
      rotatingBlackhole.setAlpha(1);
      rotatingBlackhole.setDepth(sourceDepth + 1);
      rotatingBlackhole.play(BLACKHOLE_ANIMATION_KEY);

      sourceBlackhole.destroy();

      // 人物一起被吸入并消失
      this.tweens.add({
        targets: marker,
        scaleX: originalScaleX * 0.3,
        scaleY: originalScaleY * 0.3,
        alpha: 0,
        duration: 400,
        ease: 'Cubic.easeIn',
      });

      // 黑洞旋转并缩小消失
      this.tweens.add({
        targets: rotatingBlackhole,
        displayWidth: 20,
        displayHeight: 20,
        alpha: 0,
        duration: 400,
        ease: 'Back.easeIn',
      });

      // Phase 3: 黑洞在目标位置出现 (800-1200ms)
      this.time.delayedCall(400, () => {
        this.logDrivenPositions.set(entry.target, toPos);
        this.refreshCellMarkerStates();

        marker.setPosition(targetX, targetY);
        marker.setScale(originalScaleX * 0.3, originalScaleY * 0.3);
        marker.setAlpha(0);
        marker.setDepth(targetDepth);

        const exitBlackhole = this.add.sprite(targetX, targetY, BLACKHOLE_TEXTURE_KEY);
        exitBlackhole.setOrigin(0.5, 0.5);
        exitBlackhole.setDisplaySize(10, 10);
        exitBlackhole.setAlpha(1);
        exitBlackhole.setDepth(targetDepth + 1);

        exitBlackhole.play(BLACKHOLE_ANIMATION_KEY);

        this.tweens.add({
          targets: exitBlackhole,
          displayWidth: characterWidth * BLACKHOLE_SIZE_SCALE,
          displayHeight: characterWidth * BLACKHOLE_SIZE_SCALE,
          duration: 400,
          ease: 'Back.easeOut',
        });

        // Phase 4: 黑洞消失，人物出现 (1200-1600ms)
        this.time.delayedCall(400, () => {
          exitBlackhole.destroy();

          this.tweens.killTweensOf(marker);
          this.tweens.add({
            targets: marker,
            scaleX: originalScaleX,
            scaleY: originalScaleY,
            alpha: originalAlpha,
            duration: 400,
            ease: 'Cubic.easeOut',
            onComplete: () => {
              renderer.play(this, marker, profile, 'idle');
              this.activeMoveAnimations.delete(entry.target);
              this.refreshCellMarkerStates();
            },
          });
        });
      });
    });

    this.logDrivenPositions.set(entry.target, fromPos);
    this.activeMoveAnimations.add(entry.target);
    this.refreshCellMarkerStates();
    this.tweens.killTweensOf(marker);
  }

private playHerbAnimation(context: LogEntryAnimationContext) {
  const { entry } = context;
  const marker = this.playerMarkers.get(entry.target);
  if (!marker) return;

  const x = marker.x;
  const y = marker.y;

  // 人物半身高度 ≈ 96 * 0.65 / 2 ≈ 31px; 对齐脚底
  const CHARACTER_HALF_HEIGHT = 31;
  const feetY = y + CHARACTER_HALF_HEIGHT;

  // 在脚底播放草药生长的动画特效
  const herbSprite = this.add.sprite(x, feetY, 'herb-effect');
  herbSprite.setScale(1.0);
  herbSprite.setOrigin(0.5, 1.0);
  herbSprite.setDepth(feetY + 220);
  herbSprite.play('herb_anim');

  herbSprite.on('animationcomplete', () => {
    herbSprite.destroy();
  });
  
  // (去除了原先的浮动文字代码，全权交由 showCenterPopup 处理)
}

private playWindGustAnimation(context: LogEntryAnimationContext) {
  const { entry } = context;
  const marker = this.playerMarkers.get(entry.target);
  if (!marker) return;

  const x = marker.x;
  const y = marker.y;

  // 人物半身高度 ≈ 96 * 0.65 / 2 ≈ 31px; 对齐脚底
  const CHARACTER_HALF_HEIGHT = 31;
  const feetY = y + CHARACTER_HALF_HEIGHT;

  // 播放狂风特效
  const windSprite = this.add.sprite(x, feetY, 'wind-gust-effect');
  windSprite.setScale(2.0);
  windSprite.setOrigin(0.5, 1.0);
  windSprite.setDepth(feetY + 220);
  windSprite.play('wind_gust_anim');

  windSprite.on('animationcomplete', () => {
    windSprite.destroy();
  });
  
  // (去除了原先的浮动文字代码，全权交由 showCenterPopup 处理)
}

private playLightningStrikeAnimation(context: LogEntryAnimationContext) {
  const { entry } = context;
  const marker = this.playerMarkers.get(entry.target);
  if (!marker) return;

  const player = this.players.find(p => p.player_id === entry.target);
  const visualPos = this.logDrivenPositions.get(entry.target) ?? player?.position;
  const cell = visualPos !== undefined && visualPos !== null ? this.cellViews.get(visualPos) : null;

  const cellCenterX = cell ? cell.x : marker.x;
  const cellCenterY = cell ? cell.y : marker.y + 16;

  const CHARACTER_HALF_HEIGHT = 31;
  const LIGHTNING_BOTTOM_MARGIN = 8;
  const visualX = marker.x;
  const visualY = marker.y;
  const landingX = visualX ?? cellCenterX;
  const landingY = visualY ? visualY + CHARACTER_HALF_HEIGHT + LIGHTNING_BOTTOM_MARGIN : cellCenterY + CHARACTER_HALF_HEIGHT + LIGHTNING_BOTTOM_MARGIN;

  // 1. 播放雷击动画贴图
  const lightningSprite = this.add.sprite(landingX, landingY, 'lightning-bolt');
  lightningSprite.setScale(2.0);
  lightningSprite.setOrigin(0.5, 1.0); 
  lightningSprite.setDepth(landingY + 300);
  lightningSprite.play('lightning_strike_anim');

  lightningSprite.on('animationcomplete', () => {
    lightningSprite.destroy();
  });

  // 2. 屏幕白色闪光特效模拟雷劫明暗交替
  this.cameras.main.flash(300, 255, 255, 200);

  // 3. 被雷击后人物抖动
  this.tweens.add({
    targets: marker,
    x: { from: marker.x - 4, to: marker.x },
    y: { from: marker.y - 3, to: marker.y },
    duration: 80,
    repeat: 8,
    ease: 'Linear',
    yoyo: true,
  });

  // (去除了原先头上出现的 ⚡ 文字特效，全权交由 showCenterPopup 处理)
}

private playHealAnimation(context: LogEntryAnimationContext) {
  const { entry } = context;
  const marker = this.playerMarkers.get(entry.target);
  if (!marker) {
    this.playGenericLogEntryEffect(context);
    return;
  }

  const x = marker.x;
  const y = marker.y;

  // Play heal sprite animation centered on the character
  const healSprite = this.add.sprite(x, y, 'heal-effect');
  healSprite.setScale(2.0);
  healSprite.setOrigin(0.5, 0.5);
  healSprite.setDepth(y + 220);
  healSprite.play('heal_anim');

  // Destroy sprite after animation completes
  healSprite.on('animationcomplete', () => {
    healSprite.destroy();
  });

  // Display floating "HP +N" text label (no flash ring)
  const effect = describeLogEntryEffect(entry, useGameStore.getState().definitions);
  const text = this.add.text(x, y - 42, effect.label, {
    fontFamily: GAME_FONT_FAMILY,
    fontSize: '22px',
    fontStyle: 'bold',
    color: effect.textColor,
    align: 'center',
    stroke: '#0b1020',
    strokeThickness: 5,
  });
  text.setOrigin(0.5, 0.5);
  text.setDepth(y + 230);

  this.tweens.add({
    targets: text,
    y: y - 88,
    alpha: 0,
    scale: 1.15,
    duration: 1050,
    ease: 'Cubic.easeOut',
    onComplete: () => text.destroy(),
  });
}

private playModifyLpAnimation(context: LogEntryAnimationContext) {
  const { entry } = context;
  const lpChange = getMetadataNumber(entry.metadata, 'lp_change') ?? 0;

  if (lpChange > 0) {
    this.playLpAddEffect(context);
    return;
  }

  if (lpChange < 0) {
    this.playLpMinusEffect(context);
    return;
  }

  // lpChange == 0: fallback to generic effect
  this.playGenericLogEntryEffect(context);
}

private playLpAddEffect(context: LogEntryAnimationContext) {
  const { entry } = context;
  const marker = this.playerMarkers.get(entry.target);
  if (!marker) {
    this.playGenericLogEntryEffect(context);
    return;
  }

  const x = marker.x;
  const y = marker.y;

  // Play LP+1 sprite animation centered on the character
  const lpAddSprite = this.add.sprite(x, y, LP_ADD_TEXTURE_KEY);
  lpAddSprite.setScale(2.0);
  lpAddSprite.setOrigin(0.5, 0.5);
  lpAddSprite.setDepth(y + 220);
  lpAddSprite.play(LP_ADD_ANIMATION_KEY);

  lpAddSprite.once('animationcomplete', () => {
    lpAddSprite.destroy();
  });

  // Display floating "LP +N" text label
  const effect = describeLogEntryEffect(entry, useGameStore.getState().definitions);
  const text = this.add.text(x, y - 42, effect.label, {
    fontFamily: GAME_FONT_FAMILY,
    fontSize: '22px',
    fontStyle: 'bold',
    color: effect.textColor,
    align: 'center',
    stroke: '#0b1020',
    strokeThickness: 5,
  });
  text.setOrigin(0.5, 0.5);
  text.setDepth(y + 230);

  this.tweens.add({
    targets: text,
    y: y - 88,
    alpha: 0,
    scale: 1.15,
    duration: 1050,
    ease: 'Cubic.easeOut',
    onComplete: () => text.destroy(),
  });
}

private playLpMinusEffect(context: LogEntryAnimationContext) {
  const { entry } = context;
  const marker = this.playerMarkers.get(entry.target);
  if (!marker) {
    this.playGenericLogEntryEffect(context);
    return;
  }

  const x = marker.x;
  const y = marker.y;

  // Play LP-minus sprite animation centered on the character
  const lpMinusSprite = this.add.sprite(x, y, LP_MINUS_TEXTURE_KEY);
  lpMinusSprite.setScale(2.0);
  lpMinusSprite.setOrigin(0.5, 0.5);
  lpMinusSprite.setDepth(y + 220);
  lpMinusSprite.play(LP_MINUS_ANIMATION_KEY);

  lpMinusSprite.once('animationcomplete', () => {
    lpMinusSprite.destroy();
  });

  // Display floating "LP -N" text label
  const effect = describeLogEntryEffect(entry, useGameStore.getState().definitions);
  const text = this.add.text(x, y - 42, effect.label, {
    fontFamily: GAME_FONT_FAMILY,
    fontSize: '22px',
    fontStyle: 'bold',
    color: effect.textColor,
    align: 'center',
    stroke: '#0b1020',
    strokeThickness: 5,
  });
  text.setOrigin(0.5, 0.5);
  text.setDepth(y + 230);

  this.tweens.add({
    targets: text,
    y: y - 88,
    alpha: 0,
    scale: 1.15,
    duration: 1050,
    ease: 'Cubic.easeOut',
    onComplete: () => text.destroy(),
  });
}

private playDrawEventAnimation(context: LogEntryAnimationContext) {
  const { entry } = context;
  const eventType = getEventTypeFromEntry(entry);

  const effect = getEventEffectConfig(eventType);
  const duration = effect.duration || 2500;

  // 从配置中获取事件展示名称
  const definitions = useGameStore.getState().definitions;
  const eventName = definitions?.events[eventType]?.name || eventType;

  // 1. 立即在屏幕正中央弹出提示窗
  this.showCenterPopup(eventName, effect.textColor, effect.iconEmoji, duration);

  // 2. 核心调整：延迟执行专属动画，错开视觉重心！
  // 留给玩家 1.2 秒的时间先阅读中间的弹窗文字
  // 1.2 秒后（弹窗还亮着），再准时在人物身上爆发雷击、狂风或草药动画
  // 这样动画播完时，刚好衔接后续的（移动/扣血/加血）逻辑
  const animationDelay = Math.min(1200, duration * 0.5);

  this.time.delayedCall(animationDelay, () => {
    if (eventType === 'thunder') {
      this.playLightningStrikeAnimation(context);
    } else if (eventType === 'herb') {
      this.playHerbAnimation(context);
    } else if (eventType === 'wind_gust') {
      this.playWindGustAnimation(context);
    }
  });
}

private showCenterPopup(eventName: string, textColor: string, iconEmoji?: string, duration: number = 2500) {
  // Close existing popup if any
  if (this.centerPopup) {
    this.centerPopup.destroy();
    this.centerPopup = null;
  }

  const cam = this.cameras.main;
  const screenCenterX = cam.centerX;
  const screenCenterY = cam.centerY;

  // Container for popup at screen center
  const container = this.add.container(screenCenterX, screenCenterY);
  container.setScrollFactor(0); // Fixed to screen, not affected by camera
  container.setDepth(10000); // High depth to appear above everything
  container.setAlpha(0);

  // Background panel (semi-transparent dark rectangle)
  const panelWidth = 400;
  const panelHeight = 150;
  const panel = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x0b1020, 0.85);
  panel.setStrokeStyle(3, 0xffffff, 0.8);
  panel.setOrigin(0.5, 0.5);

  // Main text label with emoji directly in the text
  const displayText = iconEmoji ? `${iconEmoji} ${eventName}` : eventName;
  const text = this.add.text(0, 0, displayText, {
    fontFamily: GAME_FONT_FAMILY,
    fontSize: '28px',
    fontStyle: 'bold',
    color: textColor,
    align: 'center',
    wordWrap: { width: 320 },
  });
  text.setOrigin(0.5, 0.5);

  container.add([panel, text]);

  // Entrance animation
  this.tweens.add({
    targets: container,
    alpha: { from: 0, to: 1 },
    scale: { from: 0.5, to: 1 },
    duration: 400,
    ease: 'Back.easeOut',
  });

  // Exit animation
  this.tweens.add({
    targets: container,
    alpha: { from: 1, to: 0 },
    scale: { from: 1, to: 0.8 },
    delay: duration - 400,
    duration: 400,
    ease: 'Power2.easeIn',
    onComplete: () => {
      container.destroy();
      if (this.centerPopup === container) {
        this.centerPopup = null;
      }
    }
  });

  this.centerPopup = container;
}

}
