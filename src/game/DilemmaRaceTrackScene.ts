/**
 * DilemmaRaceTrackScene - Phaser scene for the Dilemma Race mini-game track
 *
 * Renders the 15-cell race track over the main forest map's road tiles.
 * Positions come from the main map's path_nodes (spacing 128px, y≈640).
 * Renders character sprites with idle animation on track cells.
 * Handles position tween during resolution phase.
 * Shows popup overlays for blocked/moved results.
 */

import * as Phaser from 'phaser';
import type { DilemmaRacePlayer, DilemmaRaceRoomState } from '../service/ColyseusService';
import type { Player } from '../types/protocol';
import { assetUrl } from '../utils/assets';
import { AnimationOrchestrator } from './animationOrchestrator';
import { type CenterPopupOptions, type PopupContext, showCenterPopup } from './boardAnimations/popup';
import {
  CELL_LABEL_SCREEN_FONT_SIZE,
  GAME_FONT_FAMILY,
  PLAYER_NAME_SCREEN_FONT_SIZE,
  PLAYER_NAME_TEXTURE_RESOLUTION,
} from './boardConstants';
import type { CharacterRenderOptions, CharacterRenderProfile } from './characterRenderConfig';
import {
  DEFAULT_CHARACTER_PROFILES,
  getCharacterNameOffsetY,
  getCharacterOffsetX,
  getCharacterOffsetY,
  getCharacterProfiles,
  getCharacterRenderer,
  resolveCharacterProfile,
} from './characterRenderConfig';
import { MAIN_MAP_TILESET_IMAGES, type TilesetImageConfig } from './mapTilesets';
import { LAYER_CELL_BASE, LAYER_CHARACTER_BASE, LAYER_PLAYER_NAME_BASE, LAYER_TILE_BASE } from './renderLayers';
import { getTiledProperty } from './tiledHelpers';

// ========== Types ==========

type PathNode = {
  index: number;
  x: number;
  y: number;
};

type InitData = {
  storePlayers: Player[];
  myPlayerId: string;
  trackLength: number;
  characterRenderOptions?: CharacterRenderOptions;
  getPlayerDisplayName?: (id: string) => string;
  onReady?: (scene: DilemmaRaceTrackScene) => void;
};

type PendingReactUpdate = {
  roomState: DilemmaRaceRoomState;
  storePlayers: Player[];
  myPlayerId: string;
  characterRenderOptions?: CharacterRenderOptions;
};

// ========== Constants ==========

const TILESET_IMAGES: TilesetImageConfig[] = MAIN_MAP_TILESET_IMAGES;
const DILEMMA_MAINMAP_KEY = 'dilemma-mainmap';
const GRASS_TILESET_NAME = 'grass';
const GRASS_FILL_TILE_INDEX = 65;

// Track layout: 15 cells in a horizontal line, using MainMap path_nodes when available.
const TRACK_NODE_SPACING = 128;
const FALLBACK_TRACK_Y = 200;
const FALLBACK_TRACK_START_X = 64;
const TRACK_SCREEN_Y_RATIO = 0.64;
const TRACK_SCREEN_Y_MIN = 165;
const TRACK_SCREEN_BOTTOM_PADDING = 86;
const TRACK_CAMERA_PADDING_X = 112;
const TRACK_CAMERA_TARGET_VISIBLE_CELLS = 8;
const TRACK_CAMERA_MAX_ZOOM = 0.72;
const TRACK_NODE_START = 0;
const TRACK_POSITION_OFFSET = 1; // position = nodeIndex + 1

const CELL_MARKER_SCALE = 2;
const TRACK_CHARACTER_SCALE_MULTIPLIER = 1.7;
const TRACK_CHARACTER_FALLBACK_SCALE = 0.65;
const TRACK_CHARACTER_NAME_OFFSET_Y = -48;
const TRACK_POPUP_BACKGROUND_LAYER = 5000;
const TRACK_POPUP_TEXT_LAYER = 5010;
const RESOLUTION_POPUP_DURATION_MS = 3800;
const EVENT_POPUP_FRAME_KEY = 'event-popup-frame';
const RESOLUTION_POPUP_OPTIONS: CenterPopupOptions = {
  width: 460,
  height: 260,
  horizontalPadding: 54,
  fontSize: 20,
  viewportMargin: 24,
  backgroundLayer: TRACK_POPUP_BACKGROUND_LAYER,
  textLayer: TRACK_POPUP_TEXT_LAYER,
};

// ========== Scene ==========

export class DilemmaRaceTrackScene extends Phaser.Scene {
  // Game state
  private players: DilemmaRacePlayer[] = [];
  private storePlayers: Player[] = [];
  private myPlayerId: string = '';
  private trackLength: number = 15;
  private characterRenderOptions?: CharacterRenderOptions;
  private getPlayerDisplayName: (id: string) => string = (id) => id;
  private onReady?: (scene: DilemmaRaceTrackScene) => void;
  private mapWidth = 0;
  private mapHeight = 0;

  // Phaser objects
  private pathNodes = new Map<number, PathNode>();
  private playerMarkers = new Map<string, Phaser.GameObjects.Sprite>();
  private playerNames = new Map<string, Phaser.GameObjects.Text>();
  private cellMarkers = new Map<number, { sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text }>();
  private blockedOverlays = new Map<string, Phaser.GameObjects.GameObject>();
  private finishedOverlays = new Map<string, Phaser.GameObjects.Text>();
  private pendingReactUpdate?: PendingReactUpdate;

  // Animation helpers
  private orchestrator!: AnimationOrchestrator;
  private ready = false;

  constructor() {
    super('DilemmaRaceTrackScene');
  }

  init(data: InitData) {
    this.storePlayers = data.storePlayers ?? [];
    this.myPlayerId = data.myPlayerId ?? '';
    this.trackLength = data.trackLength ?? 15;
    this.characterRenderOptions = data.characterRenderOptions;
    this.getPlayerDisplayName = data.getPlayerDisplayName ?? ((id: string) => id);
    this.onReady = data.onReady;
  }

  preload() {
    this.load.tilemapTiledJSON(DILEMMA_MAINMAP_KEY, assetUrl('assets/maps/MainMap.json'));
    for (const tileset of TILESET_IMAGES) {
      this.load.image(tileset.key, tileset.url);
    }

    // Load popup frame for resolution popups
    this.load.image(EVENT_POPUP_FRAME_KEY, assetUrl('assets/frame/event_frame.webp'));

    // Load cell marker image
    this.load.image('logic-cell-off', assetUrl('assets/tilesets/block/off.png'));
    this.load.image('logic-cell-on', assetUrl('assets/tilesets/block/on.png'));

    // Load all character profiles (ensure sprite sheets are available)
    const profiles = getCharacterProfiles(this.characterRenderOptions);
    const renderer = getCharacterRenderer(this.characterRenderOptions);
    Object.values(profiles).forEach((profile) => {
      renderer.preload(this, profile);
    });
  }

  create() {
    const map = this.make.tilemap({ key: DILEMMA_MAINMAP_KEY });
    this.mapWidth = map.widthInPixels;
    this.mapHeight = map.heightInPixels;
    this.renderForestMap(map);
    this.extractPathNodes(map);
    if (!this.hasRequiredPathNodes()) {
      this.buildFallbackPathNodes();
    }
    this.focusTrackCamera(map);

    // Ensure character animations are created
    const renderer = getCharacterRenderer(this.characterRenderOptions);
    Object.values(getCharacterProfiles(this.characterRenderOptions)).forEach((profile) => {
      renderer.ensureAnimations(this, profile);
    });

    // Initialize orchestrator
    this.orchestrator = new AnimationOrchestrator(this);

    // Render track cells
    this.renderTrackCells();

    this.ready = true;
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    });

    const pendingUpdate = this.pendingReactUpdate;
    if (pendingUpdate) {
      this.updateFromReact(
        pendingUpdate.roomState,
        pendingUpdate.storePlayers,
        pendingUpdate.myPlayerId,
        pendingUpdate.characterRenderOptions,
      );
    }
    this.onReady?.(this);
  }

  update() {
    // Keep player name labels aligned with their sprites
    this.playerNames.forEach((text, playerId) => {
      const marker = this.playerMarkers.get(playerId);
      if (marker) {
        const profile = this.resolveProfileForPlayer(playerId);
        text.setPosition(Math.round(marker.x), Math.round(marker.y + getCharacterNameOffsetY(profile)));
        text.setDepth(marker.depth + 1);
      } else {
        text.destroy();
        this.playerNames.delete(playerId);
      }
    });
  }

  // ========== Public API (called from React) ==========

  updateFromReact(
    roomState: DilemmaRaceRoomState | null,
    storePlayers: Player[],
    myPlayerId: string,
    characterRenderOptions?: CharacterRenderOptions,
  ) {
    if (!roomState) return;

    if (!this.ready) {
      this.pendingReactUpdate = {
        roomState,
        storePlayers,
        myPlayerId,
        characterRenderOptions,
      };
      return;
    }

    this.pendingReactUpdate = undefined;
    this.players = roomState.players;
    this.storePlayers = storePlayers;
    this.myPlayerId = myPlayerId;
    this.characterRenderOptions = characterRenderOptions;

    // Clear overlays
    this.clearBlockedOverlays();
    this.clearFinishedOverlays();

    // Sync player positions
    this.syncPlayers(roomState.players, storePlayers);
    this.focusTrackCameraToBounds();

    // Show blocked/finished indicators
    roomState.players.forEach((p) => {
      if (p.isBlocked) this.showBlockedOverlay(p.id);
      if (p.isFinished) this.showFinishedOverlay(p.id);
    });

    // Update cell markers (highlight occupied cells)
    this.refreshCellMarkerStates(roomState.players);
  }

  /** Show deduplicated resolution popups sequentially */
  async showResolutionPopup(players: DilemmaRacePlayer[], getPlayerDisplayName: (id: string) => string): Promise<void> {
    const ctx = this.buildPopupCtx();
    const announcements = this.buildResolutionAnnouncements(players, getPlayerDisplayName);

    for (const announcement of announcements) {
      await showCenterPopup(
        ctx,
        announcement.text,
        announcement.textColor,
        announcement.iconEmoji,
        RESOLUTION_POPUP_DURATION_MS,
        RESOLUTION_POPUP_OPTIONS,
      );
    }
  }

  private buildResolutionAnnouncements(
    players: DilemmaRacePlayer[],
    getPlayerDisplayName: (id: string) => string,
  ): Array<{ key: string; text: string; textColor: string; iconEmoji: string }> {
    const announcements: Array<{ key: string; text: string; textColor: string; iconEmoji: string }> = [];
    const seenKeys = new Set<string>();
    const blockedGroupsByChoice = new Map<number, DilemmaRacePlayer[]>();

    const pushAnnouncement = (announcement: { key: string; text: string; textColor: string; iconEmoji: string }) => {
      if (seenKeys.has(announcement.key)) return;
      seenKeys.add(announcement.key);
      announcements.push(announcement);
    };

    for (const player of players) {
      if (!player.isBlocked) continue;

      const choice = this.getResolvedChoice(player);
      const group = blockedGroupsByChoice.get(choice);
      if (group) {
        group.push(player);
      } else {
        blockedGroupsByChoice.set(choice, [player]);
      }
    }

    for (const [choice, group] of blockedGroupsByChoice) {
      const groupKey = group
        .map((player) => player.id)
        .sort()
        .join('|');

      if (group.length > 1) {
        pushAnnouncement({
          key: `blocked-collision:${choice}:${groupKey}`,
          text: `${this.formatPlayerNames(group, getPlayerDisplayName)}都选择了${choice}步，碰撞，不走！`,
          textColor: '#e74c3c',
          iconEmoji: '❌',
        });
      } else {
        const player = group[0];
        pushAnnouncement({
          key: `blocked-single:${player.id}:${choice}:${player.position}`,
          text: `${this.formatPlayerName(player, getPlayerDisplayName)}选择了${choice}步，被阻挡！`,
          textColor: '#e74c3c',
          iconEmoji: '❌',
        });
      }
    }

    for (const player of players) {
      if (player.isBlocked) continue;

      const choice = this.getResolvedChoice(player);
      pushAnnouncement({
        key: `move:${player.id}:${choice}:${player.position}`,
        text: `${this.formatPlayerName(player, getPlayerDisplayName)}走${choice}步，到达位置${player.position}`,
        textColor: '#27ae60',
        iconEmoji: '🏃',
      });
    }

    return announcements;
  }

  private formatPlayerNames(players: DilemmaRacePlayer[], getPlayerDisplayName: (id: string) => string): string {
    const currentPlayer = players.find((player) => player.id === this.myPlayerId);
    const orderedPlayers = currentPlayer
      ? [currentPlayer, ...players.filter((player) => player.id !== this.myPlayerId)]
      : players;
    const names = orderedPlayers.map((player) => this.formatPlayerName(player, getPlayerDisplayName));

    if (names[0] === '你' && names.length > 1) {
      return `你和${names.slice(1).join('、')}`;
    }

    return names.join('、');
  }

  private formatPlayerName(player: DilemmaRacePlayer, getPlayerDisplayName: (id: string) => string): string {
    return player.id === this.myPlayerId ? '你' : getPlayerDisplayName(player.id);
  }

  /** Tween character sprites to new positions during resolution */
  tweenPlayersToPositions(players: DilemmaRacePlayer[]): void {
    players.forEach((p) => {
      const marker = this.playerMarkers.get(p.id);
      if (!marker) return;

      const nodeIndex = p.position - TRACK_POSITION_OFFSET;
      const node = this.pathNodes.get(nodeIndex);
      if (!node) return;

      const profile = this.resolveProfileForPlayer(p.id);
      const order = this.findPlayerOrder(p.id);
      const offsetX = getCharacterOffsetX(profile) + (order % 4) * 10 - 15;

      const targetX = node.x + offsetX;
      const targetY = node.y + getCharacterOffsetY(profile);

      this.tweens.add({
        targets: marker,
        x: targetX,
        y: targetY,
        duration: 500,
        ease: 'Power2.easeInOut',
        onUpdate: () => {
          marker.setDepth(marker.y + LAYER_CHARACTER_BASE);
        },
      });
    });
  }

  // ========== Private: Background & Path ==========

  private getLastNodeIndex() {
    return Math.max(TRACK_NODE_START, this.trackLength - TRACK_POSITION_OFFSET);
  }

  private renderForestMap(map: Phaser.Tilemaps.Tilemap) {
    const mapLayers = [...map.layers];
    const tilesets = TILESET_IMAGES.map((tileset) => {
      const result =
        tileset.tiledNames.map((tiledName) => map.addTilesetImage(tiledName, tileset.key)).find(Boolean) ?? null;

      if (!result) {
        console.warn(
          `[DilemmaRaceTrackScene] Missing tileset: ${tileset.tiledNames.join(' / ')}. Check the Tiled tileset mapping.`,
        );
      }

      return result;
    }).filter(Boolean) as Phaser.Tilemaps.Tileset[];

    const grassTileset = tilesets.find((tileset) => tileset.name === GRASS_TILESET_NAME);
    if (grassTileset) {
      const fillLayer = map.createBlankLayer('dilemma-grass-fill', grassTileset, 0, 0);
      if (fillLayer) {
        fillLayer.fill(GRASS_FILL_TILE_INDEX);
        fillLayer.setDepth(LAYER_TILE_BASE - 10);
      }
    }

    mapLayers.forEach((layerData, layerIndex) => {
      const layer = map.createLayer(layerData.name, tilesets, 0, 0);
      if (layer) {
        layer.setDepth(LAYER_TILE_BASE + layerIndex * 10);
      }
    });
  }

  private extractPathNodes(map: Phaser.Tilemaps.Tilemap) {
    const objectLayer = map.getObjectLayer('path_nodes') ?? map.getObjectLayer('对象层 1');
    if (!objectLayer) {
      console.warn('[DilemmaRaceTrackScene] Missing path_nodes object layer; using fallback track nodes.');
      return;
    }

    this.pathNodes.clear();

    const lastNodeIndex = this.getLastNodeIndex();
    objectLayer.objects.forEach((obj: Phaser.Types.Tilemaps.TiledObject, fallbackIndex: number) => {
      if (obj.visible === false) return;
      if (!obj.point || obj.gid) return;
      if (typeof obj.x !== 'number' || typeof obj.y !== 'number') return;

      const index = Number(getTiledProperty<number>(obj, 'index', fallbackIndex));
      if (!Number.isFinite(index) || index < TRACK_NODE_START || index > lastNodeIndex) return;

      this.pathNodes.set(index, {
        index,
        x: obj.x,
        y: obj.y,
      });
    });
  }

  private hasRequiredPathNodes() {
    for (let i = TRACK_NODE_START; i <= this.getLastNodeIndex(); i++) {
      if (!this.pathNodes.has(i)) return false;
    }
    return true;
  }

  private buildFallbackPathNodes() {
    this.pathNodes.clear();
    for (let i = TRACK_NODE_START; i <= this.getLastNodeIndex(); i++) {
      this.pathNodes.set(i, {
        index: i,
        x: FALLBACK_TRACK_START_X + i * TRACK_NODE_SPACING,
        y: FALLBACK_TRACK_Y,
      });
    }
  }

  private focusTrackCamera(map: Phaser.Tilemaps.Tilemap) {
    this.mapWidth = map.widthInPixels;
    this.mapHeight = map.heightInPixels;
    this.focusTrackCameraToBounds();
  }

  private handleResize() {
    this.focusTrackCameraToBounds();
  }

  private focusTrackCameraToBounds() {
    const cam = this.cameras.main;
    const firstNode = this.pathNodes.get(TRACK_NODE_START);
    const lastNode = this.pathNodes.get(this.getLastNodeIndex());
    if (!firstNode || !lastNode) return;

    const trackWidth = lastNode.x - firstNode.x + TRACK_CAMERA_PADDING_X * 2;
    const focusRange = this.getCameraFocusRange(firstNode, lastNode);
    const focusWidth = Math.max(
      TRACK_NODE_SPACING * TRACK_CAMERA_TARGET_VISIBLE_CELLS + TRACK_CAMERA_PADDING_X * 2,
      focusRange.maxX - focusRange.minX + TRACK_CAMERA_PADDING_X * 2,
    );
    const zoom = Math.min(TRACK_CAMERA_MAX_ZOOM, 1, cam.width / Math.max(Math.min(focusWidth, trackWidth), 1));
    const worldViewWidth = cam.width / zoom;
    const worldViewHeight = cam.height / zoom;
    const boundsX = -TRACK_CAMERA_PADDING_X;
    const mapWidth = Math.max(this.mapWidth + TRACK_CAMERA_PADDING_X * 2, worldViewWidth);
    const mapHeight = Math.max(this.mapHeight, worldViewHeight);

    cam.setBounds(boundsX, 0, mapWidth, mapHeight);
    cam.setZoom(zoom);
    cam.roundPixels = true;

    const minScrollX = boundsX;
    const maxScrollX = Math.max(minScrollX, boundsX + mapWidth - worldViewWidth);
    const maxScrollY = Math.max(0, mapHeight - worldViewHeight);
    const focusCenterX = (focusRange.minX + focusRange.maxX) / 2;
    const targetScrollX =
      this.players.length > 0 ? focusCenterX - worldViewWidth / 2 : firstNode.x - TRACK_CAMERA_PADDING_X;
    const targetTrackScreenY = this.getTargetTrackScreenY(cam.height);
    const targetScrollY = Math.max(0, firstNode.y - targetTrackScreenY / zoom);

    cam.setScroll(Phaser.Math.Clamp(targetScrollX, minScrollX, maxScrollX), Math.min(targetScrollY, maxScrollY));
    this.refreshTextSizing();
  }

  private getCameraFocusRange(firstNode: PathNode, lastNode: PathNode): { minX: number; maxX: number } {
    const playerNodeXs = this.players
      .map((player) => this.pathNodes.get(player.position - TRACK_POSITION_OFFSET)?.x)
      .filter((x): x is number => typeof x === 'number');

    if (playerNodeXs.length === 0) {
      return {
        minX: firstNode.x,
        maxX: Math.min(lastNode.x, firstNode.x + TRACK_NODE_SPACING * TRACK_CAMERA_TARGET_VISIBLE_CELLS),
      };
    }

    return {
      minX: Math.min(...playerNodeXs),
      maxX: Math.max(...playerNodeXs),
    };
  }

  private getTargetTrackScreenY(cameraHeight: number) {
    const lowerBound = Math.min(TRACK_SCREEN_Y_MIN, cameraHeight / 2);
    const upperBound = Math.max(lowerBound, cameraHeight - TRACK_SCREEN_BOTTOM_PADDING);
    return Phaser.Math.Clamp(cameraHeight * TRACK_SCREEN_Y_RATIO, lowerBound, upperBound);
  }

  private renderTrackCells() {
    // START label before first cell
    const firstNode = this.pathNodes.get(TRACK_NODE_START);
    if (firstNode) {
      const startLabel = this.add.text(firstNode.x - 64, firstNode.y - 20, 'START', {
        fontFamily: GAME_FONT_FAMILY,
        fontSize: '16px',
        color: '#27ae60',
        stroke: '#000000',
        strokeThickness: 3,
      });
      startLabel.setOrigin(0.5, 0.5);
      startLabel.setDepth(firstNode.y + LAYER_CELL_BASE + 5);
    }

    // FINISH label at last cell
    const lastNode = this.pathNodes.get(this.getLastNodeIndex());
    if (lastNode) {
      const finishLabel = this.add.text(lastNode.x + 64, lastNode.y - 20, 'FINISH', {
        fontFamily: GAME_FONT_FAMILY,
        fontSize: '16px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 3,
      });
      finishLabel.setOrigin(0.5, 0.5);
      finishLabel.setDepth(lastNode.y + LAYER_CELL_BASE + 5);
    }

    // Cell markers
    for (let index = TRACK_NODE_START; index <= this.getLastNodeIndex(); index++) {
      const node = this.pathNodes.get(index);
      if (!node) continue;
      const position = node.index + TRACK_POSITION_OFFSET;
      const isFinish = position === this.trackLength;

      const sprite = this.add.sprite(node.x, node.y, 'logic-cell-off');
      sprite.setScale(CELL_MARKER_SCALE);
      sprite.setDepth(node.y + LAYER_CELL_BASE);
      if (isFinish) {
        sprite.setTint(0xffd966);
      }

      // Cell number label
      const label = this.add.text(node.x, node.y, String(position), {
        fontFamily: GAME_FONT_FAMILY,
        fontSize: `${this.getWorldFontSize(CELL_LABEL_SCREEN_FONT_SIZE * PLAYER_NAME_TEXTURE_RESOLUTION)}px`,
        color: isFinish ? '#ffd700' : '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      });
      label.setOrigin(0.5, 0.5);
      this.configurePixelText(label);
      label.setDepth(node.y + LAYER_CELL_BASE + 5);

      this.cellMarkers.set(node.index, { sprite, label });
    }
  }

  private refreshCellMarkerStates(players: DilemmaRacePlayer[]) {
    const occupied = new Set<number>();
    players.forEach((p) => {
      const nodeIndex = p.position - TRACK_POSITION_OFFSET;
      if (nodeIndex >= 0 && nodeIndex <= this.getLastNodeIndex()) {
        occupied.add(nodeIndex);
      }
    });

    this.cellMarkers.forEach(({ sprite }, nodeIndex) => {
      const isFinish = nodeIndex + TRACK_POSITION_OFFSET === this.trackLength;
      sprite.setTexture(occupied.has(nodeIndex) ? 'logic-cell-on' : 'logic-cell-off');
      if (isFinish) {
        sprite.setTint(0xffd966);
      } else {
        sprite.clearTint();
      }
    });
  }

  // ========== Private: Character Sync ==========

  private syncPlayers(players: DilemmaRacePlayer[], storePlayers: Player[]) {
    this.players = players;

    players.forEach((p, order) => {
      const nodeIndex = p.position - TRACK_POSITION_OFFSET;
      const node = this.pathNodes.get(nodeIndex);
      if (!node) return;

      const storePlayer = this.resolveStorePlayer(p.id, order, storePlayers);

      const profile = this.toTrackCharacterProfile(
        resolveCharacterProfile(storePlayer, order, this.characterRenderOptions),
      );
      const offsetX = getCharacterOffsetX(profile) + (order % 4) * 10 - 15;
      const targetX = node.x + offsetX;
      const targetY = node.y + getCharacterOffsetY(profile);

      let marker = this.playerMarkers.get(p.id);
      let nameText = this.playerNames.get(p.id);

      if (!marker) {
        const renderer = getCharacterRenderer(this.characterRenderOptions);
        marker = renderer.createSprite({
          scene: this,
          player: storePlayer,
          profile,
          x: targetX,
          y: targetY,
        });
        renderer.play(this, marker, profile, 'idle');
        marker.setDepth(targetY + LAYER_CHARACTER_BASE);
        marker.setData('characterProfileId', profile.id);
        this.playerMarkers.set(p.id, marker);

        const displayName = storePlayer.display_name || this.getPlayerDisplayName(p.id);
        nameText = this.add.text(targetX, targetY + getCharacterNameOffsetY(profile), displayName, {
          fontFamily: GAME_FONT_FAMILY,
          fontSize: `${this.getWorldFontSize(PLAYER_NAME_SCREEN_FONT_SIZE * PLAYER_NAME_TEXTURE_RESOLUTION)}px`,
          color: this.getPlayerNameColor(p.id),
          backgroundColor: this.getPlayerNameBackgroundColor(p.id),
          stroke: '#000000',
          strokeThickness: 4,
        });
        nameText.setOrigin(0.5, 0.5);
        nameText.setPadding(6, 2, 6, 2);
        this.configurePixelText(nameText);
        nameText.setDepth(targetY + LAYER_PLAYER_NAME_BASE);
        this.playerNames.set(p.id, nameText);
        return;
      }

      // Update existing sprite
      marker.setData('characterProfileId', profile.id);
      marker.setPosition(targetX, targetY);
      marker.setDepth(targetY + LAYER_CHARACTER_BASE);
      if (nameText) {
        this.applyPlayerNameStyle(p.id, nameText, storePlayer.display_name || this.getPlayerDisplayName(p.id));
      }
    });
  }

  // ========== Private: Overlays ==========

  private showBlockedOverlay(playerId: string) {
    const marker = this.playerMarkers.get(playerId);
    if (!marker) return;

    // Red tint + flashing
    marker.setTint(0xff4444);
    this.tweens.add({
      targets: marker,
      alpha: { from: 1, to: 0.3 },
      duration: 300,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        marker.clearTint();
        marker.setAlpha(1);
      },
    });

    const blockedText = this.add.text(marker.x, marker.y - 50, 'BLOCKED!', {
      fontFamily: GAME_FONT_FAMILY,
      fontSize: '16px',
      color: '#e74c3c',
      stroke: '#000000',
      strokeThickness: 3,
    });
    blockedText.setOrigin(0.5, 0.5);
    blockedText.setDepth(LAYER_PLAYER_NAME_BASE + 50);

    this.time.delayedCall(2000, () => {
      if (blockedText.active) blockedText.destroy();
    });

    this.blockedOverlays.set(playerId, blockedText);
  }

  private showFinishedOverlay(playerId: string) {
    const marker = this.playerMarkers.get(playerId);
    if (!marker) return;

    marker.setTint(0xffd700);

    const finishedText = this.add.text(marker.x, marker.y - 50, '★ GOAL!', {
      fontFamily: GAME_FONT_FAMILY,
      fontSize: '16px',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 3,
    });
    finishedText.setOrigin(0.5, 0.5);
    finishedText.setDepth(LAYER_PLAYER_NAME_BASE + 50);

    this.finishedOverlays.set(playerId, finishedText);
  }

  private clearBlockedOverlays() {
    this.blockedOverlays.forEach((obj) => {
      if (obj.active) obj.destroy();
    });
    this.blockedOverlays.clear();
    this.playerMarkers.forEach((marker) => {
      marker.clearTint();
      marker.setAlpha(1);
    });
  }

  private clearFinishedOverlays() {
    this.finishedOverlays.forEach((text) => {
      if (text.active) text.destroy();
    });
    this.finishedOverlays.clear();
    this.playerMarkers.forEach((marker) => {
      marker.clearTint();
    });
  }

  // ========== Private: Utilities ==========

  private resolveProfileForPlayer(playerId: string): CharacterRenderProfile {
    const storePlayer = this.storePlayers.find((p) => p.player_id === playerId);
    const order = this.findPlayerOrder(playerId);
    if (storePlayer) {
      return this.toTrackCharacterProfile(resolveCharacterProfile(storePlayer, order, this.characterRenderOptions));
    }
    const fallbackIds = ['red', 'green', 'white', 'black'];
    const profileId = fallbackIds[order % fallbackIds.length];
    return this.toTrackCharacterProfile(DEFAULT_CHARACTER_PROFILES[profileId]);
  }

  private toTrackCharacterProfile(profile: CharacterRenderProfile): CharacterRenderProfile {
    return {
      ...profile,
      scale: (profile.scale ?? TRACK_CHARACTER_FALLBACK_SCALE) * TRACK_CHARACTER_SCALE_MULTIPLIER,
      nameOffsetY: profile.nameOffsetY ?? TRACK_CHARACTER_NAME_OFFSET_Y,
    };
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

  private configurePixelText(text: Phaser.GameObjects.Text) {
    text.setResolution(this.getTextTextureResolution());
    text.setScale(1 / PLAYER_NAME_TEXTURE_RESOLUTION);
  }

  private refreshTextSizing() {
    this.playerNames.forEach((text) => {
      text.setFontSize(`${this.getWorldFontSize(PLAYER_NAME_SCREEN_FONT_SIZE * PLAYER_NAME_TEXTURE_RESOLUTION)}px`);
      text.setResolution(this.getTextTextureResolution());
    });

    this.cellMarkers.forEach(({ label }) => {
      label.setFontSize(`${this.getWorldFontSize(CELL_LABEL_SCREEN_FONT_SIZE * PLAYER_NAME_TEXTURE_RESOLUTION)}px`);
      label.setResolution(this.getTextTextureResolution());
    });
  }

  private getPlayerNameColor(playerId: string) {
    return playerId === this.myPlayerId ? '#9ad7ff' : '#ff9d92';
  }

  private getPlayerNameBackgroundColor(playerId: string) {
    return playerId === this.myPlayerId ? '#163348' : '#4a1c18';
  }

  private applyPlayerNameStyle(playerId: string, text: Phaser.GameObjects.Text, displayName: string) {
    text.setText(displayName);
    text.setColor(this.getPlayerNameColor(playerId));
    text.setBackgroundColor(this.getPlayerNameBackgroundColor(playerId));
  }

  private resolveStorePlayer(playerId: string, order: number, storePlayers: Player[]): Player {
    const storePlayer = storePlayers.find((sp) => sp.player_id === playerId);
    if (storePlayer) return storePlayer;

    return {
      player_id: playerId,
      display_name: this.getPlayerDisplayName(playerId),
      faction: '',
      position: order,
      hp: 0,
      max_hp: 8,
      lp: 0,
      buffs: [],
      items: [],
      charge: 0,
      fire_counter: 0,
      is_dead: false,
      skip_turn: false,
    } as Player;
  }

  private getResolvedChoice(player: DilemmaRacePlayer): number {
    return player.choice > 0 ? player.choice : 1;
  }

  private findPlayerOrder(playerId: string): number {
    const order = this.players.findIndex((p) => p.id === playerId);
    return order >= 0 ? order : 0;
  }

  private buildPopupCtx(): PopupContext {
    return {
      scene: this,
      orchestrator: this.orchestrator,
      tweens: this.tweens,
    };
  }
}
