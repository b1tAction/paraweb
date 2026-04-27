import * as Phaser from 'phaser';
import type { LogEntry, MapConfig, MapCellConfig, Player } from '../types/protocol';
import { getTiledProperty } from './tiledHelpers';
import {
  MOVE_STEP_MS,
  describeLogEntryEffect,
  describeSettlementChange,
  getMetadataNumber,
  getMetadataNumberArray,
} from './logEntryPlayback';

// 1. 加载并渲染 MainMap.json
// 2. 读取 path_nodes 对象层
// 3. 把后端 mapConfig.cells[].index 和 Tiled 点位 index 合并

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

type SettlementStatusView = {
  playerId: string;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
};

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
    tiledNames: [
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

const CELL_COLORS: Record<string, number> = {
  normal: 0xffffff,
  checkpoint: 0x4fc3f7,
  fragile: 0xffb74d,
  fog: 0x9575cd,
  event: 0x81c784,
  boss: 0xef5350,
};

const PLAYER_COLORS = [0x42a5f5, 0xef5350, 0xffca28, 0x66bb6a];

// 摄像头可见范围
// MainMap.json 当前 tile 是 32x32，因此这个值会让摄像头只显示人物周边几格。
// 想看得更近就调小，想看得更远就调大。
const CAMERA_VIEW_TILES_X = 30;
const CAMERA_VIEW_TILES_Y = 20;

export class ForestBoardScene extends Phaser.Scene {
  private mapConfig!: MapConfig;
  private players: Player[] = [];
  private followPlayerId?: string | null;
  private activeLogEntry?: LogEntry | null;
  private settlementPlayer?: Player | null;
  private mapTileWidth = 32;
  private mapTileHeight = 32;

  private pathNodes = new Map<number, PathNode>();
  private cellViews = new Map<number, BoardCellView>();

  private cellMarkers: Phaser.GameObjects.GameObject[] = [];
  private playerMarkers = new Map<string, Phaser.GameObjects.Arc>();
  private logDrivenPositions = new Map<string, number>();
  private settlementStatus?: SettlementStatusView;
  private lastEffectKey = '';

  private ready = false;

  constructor() {
    super('ForestBoardScene');
  }

  init(data: {
    mapConfig: MapConfig;
    players: Player[];
    followPlayerId?: string | null;
    activeLogEntry?: LogEntry | null;
    settlementPlayer?: Player | null;
  }) {
    this.mapConfig = data.mapConfig;
    this.players = data.players ?? [];
    this.followPlayerId = data.followPlayerId;
    this.activeLogEntry = data.activeLogEntry;
    this.settlementPlayer = data.settlementPlayer;
  }

  preload() {
    this.load.tilemapTiledJSON('mainmap', '/assets/maps/MainMap.json');

    for (const tileset of TILESET_IMAGES) {
      this.load.image(tileset.key, tileset.url);
    }
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
            `[ForestBoardScene] 找不到 tileset: ${tileset.tiledNames.join(' / ')}。请检查 Tiled 中的 tileset 名称和 TILESET_IMAGES 配置。`
          );
        }

        return result;
      })
      .filter(Boolean) as Phaser.Tilemaps.Tileset[];

    // 按 Tiled 文件中的 tile layer 顺序创建图层
    map.layers.forEach((layerData, layerIndex) => {
        const layer = map.createLayer(layerData.name, tilesets, 0, 0);

        if (layer) {
            // 用 Tiled 图层在 map.layers 里的顺序控制深度
            layer.setDepth(layerIndex * 10);
        }
    });

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.configureFollowCamera();

    this.extractPathNodes(map);
    this.rebuildCellsFromBackendConfig();
    this.renderCellMarkers();
    this.syncPlayers(this.players);
    this.syncSettlementStatus(this.settlementPlayer);
    this.playLogEntryEffect(this.activeLogEntry);

    this.ready = true;
  }

  update() {
    this.updateSettlementStatusPosition();
  }

  updateFromReact(
    mapConfig: MapConfig,
    players: Player[],
    followPlayerId?: string | null,
    activeLogEntry?: LogEntry | null,
    settlementPlayer?: Player | null
  ) {
    const mapChanged = this.mapConfig !== mapConfig;
    const followChanged = this.followPlayerId !== followPlayerId;

    this.mapConfig = mapConfig;
    this.players = players ?? [];
    this.followPlayerId = followPlayerId;
    this.activeLogEntry = activeLogEntry;
    this.settlementPlayer = settlementPlayer;

    if (!this.ready) return;

    if (!activeLogEntry && !settlementPlayer) {
      this.logDrivenPositions.clear();
    }

    if (mapChanged) {
      this.rebuildCellsFromBackendConfig();
      this.renderCellMarkers();
    }

    this.syncPlayers(this.players);
    this.syncSettlementStatus(this.settlementPlayer);
    this.playLogEntryEffect(this.activeLogEntry);

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

  private followTargetPlayer() {
    const targetPlayerId = this.followPlayerId ?? this.players[0]?.player_id;

    if (!targetPlayerId) return;

    const marker = this.playerMarkers.get(targetPlayerId);

    if (!marker) return;

    this.cameras.main.startFollow(marker, true, 0.12, 0.12);
  }

  private extractPathNodes(map: Phaser.Tilemaps.Tilemap) {
    const objectLayer =
      map.getObjectLayer('path_nodes') ??
      map.getObjectLayer('对象层 1');

    if (!objectLayer) {
      console.error(
        '[ForestBoardScene] 找不到 path_nodes 对象层。请在 Tiled 中把路径点对象层命名为 path_nodes。'
      );
      return;
    }

    this.pathNodes.clear();

    objectLayer.objects.forEach((obj: any, fallbackIndex: number) => {
      if (obj.visible === false) return;

      // 临时兼容：如果 Tiled 点位没写 index，则按对象顺序兜底。
      // 正式版本必须在 Tiled 里显式写 index。
      const index = Number(
        getTiledProperty<number>(obj, 'index', fallbackIndex)
      );

      if (!Number.isFinite(index)) {
        console.warn('[ForestBoardScene] 路径点缺少合法 index:', obj);
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
        `[ForestBoardScene] Tiled 路径点数量(${this.pathNodes.size}) 与后端地图长度(${this.mapConfig.length}) 不一致。`
      );
    }
  }

  private rebuildCellsFromBackendConfig() {
    this.cellViews.clear();

    for (const cell of this.mapConfig.cells) {
      const node = this.pathNodes.get(cell.index);

      if (!node) {
        console.warn(
          `[ForestBoardScene] 后端 cell.index=${cell.index} 没有对应的 Tiled path_node。`
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
    for (const marker of this.cellMarkers) {
      marker.destroy();
    }

    this.cellMarkers = [];

    for (const cell of this.cellViews.values()) {
      const color = CELL_COLORS[cell.cell_type] ?? 0xffffff;

      const circle = this.add.circle(cell.x, cell.y, 12, color, 0.35);
      circle.setStrokeStyle(2, color, 0.9);
      circle.setDepth(cell.y + 50);

      const label = this.add.text(cell.x, cell.y - 24, String(cell.index), {
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      });
      label.setOrigin(0.5, 0.5);
      label.setDepth(cell.y + 51);

      this.cellMarkers.push(circle, label);
    }
  }

  private syncPlayers(players: Player[]) {
    players.forEach((player, order) => {
      const visualPosition = this.logDrivenPositions.get(player.player_id) ?? player.position;
      const cell = this.cellViews.get(visualPosition);

      if (!cell) {
        console.warn(
          `[ForestBoardScene] 玩家 ${player.display_name} 的 position=${player.position} 没有对应点位。`
        );
        return;
      }

      const offsetX = (order % 4) * 10 - 15;
      const targetX = cell.x + offsetX;
      const targetY = cell.y - 10;

      let marker = this.playerMarkers.get(player.player_id);

      if (!marker) {
        const color = PLAYER_COLORS[order % PLAYER_COLORS.length];

        marker = this.add.circle(targetX, targetY, 10, color, 1);
        marker.setStrokeStyle(2, 0xffffff, 1);
        marker.setDepth(targetY + 100);

        this.playerMarkers.set(player.player_id, marker);

        if (player.player_id === this.followPlayerId) {
          this.followTargetPlayer();
        }

        return;
      }

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
    });

    this.followTargetPlayer();
  }

  private syncSettlementStatus(player?: Player | null) {
    if (!player) {
      this.settlementStatus?.container.destroy(true);
      this.settlementStatus = undefined;
      return;
    }

    const marker = this.playerMarkers.get(player.player_id);
    if (!marker) return;

    const buffText =
      player.buffs.length > 0
        ? player.buffs
            .map((buff) => `${buff.name || buff.type}${buff.duration < 0 ? '' : `:${buff.duration}`}`)
            .join('  ')
        : '无 Buff';
    const settlementChange = describeSettlementChange(player, this.activeLogEntry);
    const content = `TurnEnd 结算\nHP ${player.hp}   LP ${player.lp}\n${buffText}${settlementChange ? `\n${settlementChange.label}` : ''}`;
    const borderColor = settlementChange?.color ?? 0xfff176;
    const textColor = settlementChange?.textColor ?? '#ffffff';

    if (!this.settlementStatus || this.settlementStatus.playerId !== player.player_id) {
      this.settlementStatus?.container.destroy(true);

      const bg = this.add.graphics();
      const text = this.add.text(0, 0, content, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        color: textColor,
        align: 'left',
        lineSpacing: 4,
        stroke: '#111827',
        strokeThickness: 4,
      });
      text.setOrigin(0.5, 0.5);

      const container = this.add.container(marker.x, marker.y - 78, [bg, text]);
      container.setDepth(marker.y + 240);
      container.setAlpha(0);

      this.settlementStatus = {
        playerId: player.player_id,
        container,
        bg,
        text,
      };

      this.tweens.add({
        targets: container,
        alpha: 1,
        duration: 160,
        ease: 'Sine.easeOut',
      });
    }

    this.settlementStatus.text.setText(content);
    this.settlementStatus.text.setColor(textColor);
    this.drawSettlementStatusBackground(this.settlementStatus, borderColor);
    this.updateSettlementStatusPosition();
  }

  private drawSettlementStatusBackground(view: SettlementStatusView, borderColor: number) {
    const width = Math.max(180, view.text.width + 28);
    const height = view.text.height + 22;

    view.bg.clear();
    view.bg.fillStyle(0x111827, 0.88);
    view.bg.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
    view.bg.lineStyle(2, borderColor, 0.95);
    view.bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
  }

  private updateSettlementStatusPosition() {
    if (!this.settlementStatus) return;

    const marker = this.playerMarkers.get(this.settlementStatus.playerId);
    if (!marker) return;

    this.settlementStatus.container.setPosition(marker.x, marker.y - 78);
    this.settlementStatus.container.setDepth(marker.y + 240);
  }

  private playLogEntryEffect(entry?: LogEntry | null) {
    if (!entry || (entry.type !== 'action' && entry.type !== 'boss')) return;

    const effectKey = `${entry.timestamp}:${entry.type}:${entry.action_type}:${entry.target}:${entry.source}`;
    if (effectKey === this.lastEffectKey) return;
    this.lastEffectKey = effectKey;

    if (entry.action_type === 'dice_roll') return;

    if (entry.action_type === 'move') {
      this.playMoveAnimation(entry);
      return;
    }

    if (this.settlementPlayer && describeSettlementChange(this.settlementPlayer, entry)) return;

    const marker = this.playerMarkers.get(entry.target) ?? this.playerMarkers.get(this.followPlayerId || '');
    if (!marker) return;

    const effect = describeLogEntryEffect(entry);
    const x = marker.x;
    const y = marker.y;

    const ring = this.add.circle(x, y, 24, effect.color, 0.12);
    ring.setStrokeStyle(4, effect.color, 1);
    ring.setDepth(y + 210);

    const text = this.add.text(x, y - 42, effect.label, {
      fontFamily: 'Arial, sans-serif',
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
      targets: marker,
      scale: 1.7,
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
  }

  private playMoveAnimation(entry: LogEntry) {
    const marker = this.playerMarkers.get(entry.target);
    if (!marker) return;

    const path = getMetadataNumberArray(entry.metadata, 'path');
    if (path.length < 2) {
      const endPos = entry.metadata && Object.prototype.hasOwnProperty.call(entry.metadata, 'end_pos')
        ? getMetadataNumber(entry.metadata, 'end_pos')
        : null;
      if (endPos !== null) this.logDrivenPositions.set(entry.target, endPos);
      return;
    }

    const startCell = this.cellViews.get(path[0]);
    const currentOffsetX = startCell ? marker.x - startCell.x : 0;
    const currentOffsetY = startCell ? marker.y - startCell.y : -10;
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

    let index = 0;
    const runNext = () => {
      const point = points[index];
      if (!point) return;

      this.tweens.add({
        targets: marker,
        x: point.x,
        y: point.y,
        duration: MOVE_STEP_MS,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          marker.setDepth((marker.y ?? point.y) + 100);
        },
        onComplete: () => {
          this.logDrivenPositions.set(entry.target, point.cellIndex);
          index += 1;
          runNext();
        },
      });
    };

    runNext();
  }

}
