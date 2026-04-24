import * as Phaser from 'phaser';
import type { MapConfig, MapCellConfig, Player } from '../types/protocol';
import { getTiledProperty } from './tiledHelpers';

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
  private mapTileWidth = 32;
  private mapTileHeight = 32;

  private pathNodes = new Map<number, PathNode>();
  private cellViews = new Map<number, BoardCellView>();

  private cellMarkers: Phaser.GameObjects.GameObject[] = [];
  private playerMarkers = new Map<string, Phaser.GameObjects.Arc>();

  private ready = false;

  constructor() {
    super('ForestBoardScene');
  }

  init(data: { mapConfig: MapConfig; players: Player[]; followPlayerId?: string | null }) {
    this.mapConfig = data.mapConfig;
    this.players = data.players ?? [];
    this.followPlayerId = data.followPlayerId;
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

    this.ready = true;
  }

  updateFromReact(mapConfig: MapConfig, players: Player[], followPlayerId?: string | null) {
    const mapChanged = this.mapConfig !== mapConfig;
    const followChanged = this.followPlayerId !== followPlayerId;

    this.mapConfig = mapConfig;
    this.players = players ?? [];
    this.followPlayerId = followPlayerId;

    if (!this.ready) return;

    if (mapChanged) {
      this.rebuildCellsFromBackendConfig();
      this.renderCellMarkers();
    }

    this.syncPlayers(this.players);

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
      const cell = this.cellViews.get(player.position);

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
}