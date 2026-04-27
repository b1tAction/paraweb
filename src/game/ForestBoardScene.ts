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
import { getEventEffectConfig, getEventTypeFromEntry } from './eventAnimations';

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

const CELL_COLORS: Record<string, number> = {
  normal: 0xffffff,
  checkpoint: 0x4fc3f7,
  fragile: 0xffb74d,
  fog: 0x9575cd,
  event: 0x81c784,
  boss: 0xef5350,
};

// 【新增】定义你所有可用的人物前缀（文件名）
const AVAILABLE_CHARACTERS = ['red', 'green', 'white', 'black'];

// 【新增】根据后端玩家数据里的 faction 字段，映射到具体的人物前缀
const FACTION_TO_PREFIX: Record<string, string> = {
  'zhu_que': 'red',     // 朱雀 -> red_idle.png
  'qing_long': 'green',   // 青龙 -> green_idle.png
  'bai_hu': 'white',    // 白虎 -> white_idle.png
  'xuan_wu': 'black'    // 玄武 -> black_idle.png
};

const CAMERA_VIEW_TILES_X = 30;
const CAMERA_VIEW_TILES_Y = 20;

export class ForestBoardScene extends Phaser.Scene {
  private mapConfig!: MapConfig;
  private players: Player[] =[];
  private followPlayerId?: string | null;
  private activeLogEntry?: LogEntry | null;
  private settlementPlayer?: Player | null;
  private mapTileWidth = 32;
  private mapTileHeight = 32;

  private pathNodes = new Map<number, PathNode>();
  private cellViews = new Map<number, BoardCellView>();

  private cellMarkers: Phaser.GameObjects.GameObject[] =[];
  // 【修改点 1】把 Arc 改成 Sprite
  private playerMarkers = new Map<string, Phaser.GameObjects.Sprite>();
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
    this.players = data.players ??[];
    this.followPlayerId = data.followPlayerId;
    this.activeLogEntry = data.activeLogEntry;
    this.settlementPlayer = data.settlementPlayer;
  }

  preload() {
    this.load.tilemapTiledJSON('mainmap', '/assets/maps/MainMap.json');

    for (const tileset of TILESET_IMAGES) {
      this.load.image(tileset.key, tileset.url);
    }

    // 【修改】使用循环批量加载所有定义好的人物资源
    AVAILABLE_CHARACTERS.forEach(prefix => {
      this.load.spritesheet(`${prefix}_idle`, `/assets/figures/${prefix}_idle.png`, {
        frameWidth: 68,
        frameHeight: 68
      });
      this.load.spritesheet(`${prefix}_move`, `/assets/figures/${prefix}_move.png`, {
        frameWidth: 68,
        frameHeight: 68
      });
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
            `[ForestBoardScene] 找不到 tileset: ${tileset.tiledNames.join(' / ')}。请检查 Tiled 中的 tileset 名称和 TILESET_IMAGES 配置。`
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

     AVAILABLE_CHARACTERS.forEach(prefix => {
      // 创建待机动画
      this.anims.create({
        key: `${prefix}_idle_anim`,
        frames: this.anims.generateFrameNumbers(`${prefix}_idle`, { start: 0, end: 3 }),
        frameRate: 6,
        repeat: -1
      });

      // 创建移动动画
      this.anims.create({
        key: `${prefix}_move_anim`,
        // ⚠️ 注意：这里假设所有移动动画都是6帧。如果有不同帧数的，需要额外处理。
        frames: this.anims.generateFrameNumbers(`${prefix}_move`, { start: 0, end: 5 }),
        frameRate: 10,
        repeat: -1
      });
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
    this.players = players ??[];
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

    this.cellMarkers =[];

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
    console.log('正在渲染的玩家数据:', players); 



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
      const targetY = cell.y - 16; 

      let marker = this.playerMarkers.get(player.player_id);

      if (!marker) {
        // 【修改】核心逻辑：根据玩家数据动态决定使用哪个精灵
        
        // 1. 优先根据玩家的阵营(faction)去配置表里查找对应的人物前缀
        let charPrefix = player.faction ? FACTION_TO_PREFIX[player.faction] : null;

        // 2. 如果没找到（比如阵营名写错了或没传），则按玩家加入顺序轮流分配一个外观，保证不报错
        if (!charPrefix || !AVAILABLE_CHARACTERS.includes(charPrefix)) {
            charPrefix = AVAILABLE_CHARACTERS[order % AVAILABLE_CHARACTERS.length];
            console.warn(`玩家 ${player.display_name} 阵营 ${player.faction} 未配置，已自动分配外观: ${charPrefix}`);
        }

        // 3. 使用动态获取的前缀来创建精灵和播放动画
        marker = this.add.sprite(targetX, targetY, `${charPrefix}_idle`);
        marker.setScale(0.65);
        marker.play(`${charPrefix}_idle_anim`);
        marker.setDepth(targetY + 100);
        
        // 4. 【关键】把这个人物的前缀存起来，方便移动时知道该播放哪个移动动画
        marker.setData('charPrefix', charPrefix);

        this.playerMarkers.set(player.player_id, marker);

        if (player.player_id === this.followPlayerId) {
          this.followTargetPlayer();
        }

        return;
      }

      // 这部分移动逻辑保持不变
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

    if (entry.action_type === 'draw_event') {
      this.playDrawEventAnimation(entry);
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

    // 【修改点 5】缩放特效调低，因为原图已经缩放过了
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
  }

 private playMoveAnimation(entry: LogEntry) {
    const marker = this.playerMarkers.get(entry.target);
    if (!marker) return;

    const path = getMetadataNumberArray(entry.metadata, 'path');
    if (path.length < 2) {
      const endPos = entry.metadata && Object.prototype.hasOwnProperty.call(entry.metadata, 'end_pos')
        ? getMetadataNumber(entry.metadata, 'end_pos')
        : null;
      if (endPos !== null) {
        console.log('📍 [ForestBoardScene] 直接设置玩家位置:', endPos);
        this.logDrivenPositions.set(entry.target, endPos);
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
    
    // 1. 从移动的 Sprite 身上，读取它自己的外观前缀 (我们在 syncPlayers 里存好的)
    const charPrefix = marker.getData('charPrefix') || 'red'; // 如果没读到，默认用 'red'

    let index = 0;
    
    // 2. 开始移动前，播放对应外观的 move 动画
    marker.play(`${charPrefix}_move_anim`, true);

    const runNext = () => {
      const point = points[index];
      
      // 3. 如果没有下一个点了（抵达终点）
      if (!point) {
        // 恢复到对应外观的 idle 动画
        marker.play(`${charPrefix}_idle_anim`, true); 
        return;
      }

      // 4. 自动判断朝向 (向左走翻转，向右走恢复)
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
          index += 1;
          runNext();
        },
      });
    };

    runNext();
  }

  private playDrawEventAnimation(entry: LogEntry) {
    const marker = this.playerMarkers.get(entry.target);
    if (!marker) return;

    const eventType = getEventTypeFromEntry(entry);
    const effect = getEventEffectConfig(eventType);

    const x = marker.x;
    const y = marker.y;

    // 创建主文本显示
    const text = this.add.text(x, y - 42, effect.label, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: effect.textColor,
      align: 'center',
      stroke: '#0b1020',
      strokeThickness: 5,
    });
    text.setOrigin(0.5, 0.5);
    text.setDepth(y + 230);

    // 如果有 emoji，单独创建一个 emoji 文本
    let emojiText: Phaser.GameObjects.Text | null = null;
    if (effect.iconEmoji) {
      emojiText = this.add.text(x - text.width / 2 - 30, y - 42, effect.iconEmoji, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '28px',
        color: effect.textColor,
        align: 'center',
      });
      emojiText.setOrigin(0.5, 0.5);
      emojiText.setDepth(y + 231);
    }

    // 根据动画类型调用不同的动画
    switch (effect.animationType) {
      case 'heal_pop':
        this.playHealPopAnimation(marker, text, emojiText, effect);
        break;
      case 'damage_flash':
        this.playDamageFlashAnimation(marker, text, emojiText, effect);
        break;
      case 'buff_glow':
        this.playBuffGlowAnimation(marker, text, emojiText, effect);
        break;
      case 'debuff_spin':
        this.playDebuffSpinAnimation(marker, text, emojiText, effect);
        break;
      case 'item_sparkle':
        this.playItemSparkleAnimation(marker, text, emojiText, effect);
        break;
      case 'teleport_swap':
        this.playTeleportSwapAnimation(marker, text, emojiText, effect);
        break;
      case 'curse_cloud':
        this.playCurseCloudAnimation(marker, text, emojiText, effect);
        break;
      case 'lightning_strike':
        this.playLightningStrikeAnimation(marker, text, emojiText, effect);
        break;
      case 'ghost_attack':
        this.playGhostAttackAnimation(marker, text, emojiText, effect);
        break;
      case 'steal_flash':
        this.playStealFlashAnimation(marker, text, emojiText, effect);
        break;
      case 'neutral_pulse':
      default:
        this.playNeutralPulseAnimation(marker, text, emojiText, effect);
        break;
    }
  }

  private playHealPopAnimation(marker: Phaser.GameObjects.Sprite, text: Phaser.GameObjects.Text, emojiText: Phaser.GameObjects.Text | null, effect: any) {
    const x = marker.x;
    const y = marker.y;

    // 绿色治疗粒子效果
    const particles = this.add.particles(x, y, 'particle', {
      speed: { min: 50, max: 150 },
      scale: { start: 0.8, end: 0 },
      lifespan: 800,
      quantity: effect.particleCount || 8,
      tint: effect.color,
      alpha: { start: 0.8, end: 0 },
      blendMode: 'ADD'
    });
    particles.setDepth(y + 220);

    // 弹出动画
    this.tweens.add({
      targets: marker,
      scale: 1.3,
      duration: 200,
      yoyo: true,
      ease: 'Back.easeOut',
    });

    // 文本动画
    this.tweens.add({
      targets: text,
      y: y - 88,
      alpha: 0,
      scale: 1.2,
      duration: effect.duration || 1800,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        text.destroy();
        particles.destroy();
        if (emojiText) emojiText.destroy();
      },
    });
  }

  private playDamageFlashAnimation(marker: Phaser.GameObjects.Sprite, text: Phaser.GameObjects.Text, emojiText: Phaser.GameObjects.Text | null, effect: any) {
    const x = marker.x;
    const y = marker.y;

    // 红色伤害闪烁
    const flash = this.add.circle(x, y, 35, effect.color, 0.3);
    flash.setDepth(y + 200);

    // 闪烁动画
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.5,
      duration: 400,
      ease: 'Power2.easeOut',
      onComplete: () => flash.destroy(),
    });

    // 玩家抖动
    this.tweens.add({
      targets: marker,
      x: x + Phaser.Math.Between(-3, 3),
      y: y + Phaser.Math.Between(-3, 3),
      duration: 50,
      yoyo: true,
      repeat: 5,
      ease: 'Sine.easeInOut',
    });

    // 文本动画
    const textTargets = emojiText ? [text, emojiText] : [text];
    this.tweens.add({
      targets: textTargets,
      y: y - 88,
      alpha: 0,
      scale: 1.1,
      duration: effect.duration || 1200,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        text.destroy();
        if (emojiText) emojiText.destroy();
      },
    });
  }

  private playBuffGlowAnimation(marker: Phaser.GameObjects.Sprite, text: Phaser.GameObjects.Text, emojiText: Phaser.GameObjects.Text | null, effect: any) {
    const x = marker.x;
    const y = marker.y;

    // 金色发光效果
    const glow = this.add.circle(x, y, 40, effect.color, 0.2);
    glow.setDepth(y + 190);

    // 粒子效果
    const particles = this.add.particles(x, y, 'particle', {
      speed: { min: 30, max: 80 },
      scale: { start: 1, end: 0 },
      lifespan: 1200,
      quantity: effect.particleCount || 15,
      tint: effect.color,
      alpha: { start: 0.6, end: 0 },
      blendMode: 'ADD'
    });
    particles.setDepth(y + 210);

    // 发光脉冲
    this.tweens.add({
      targets: glow,
      scale: 2,
      alpha: 0,
      duration: 1000,
      ease: 'Power2.easeOut',
      onComplete: () => glow.destroy(),
    });

    // 玩家微微发光
    this.tweens.add({
      targets: marker,
      alpha: 0.8,
      duration: 300,
      yoyo: true,
      repeat: 2,
    });

    // 文本动画
    const textTargets = emojiText ? [text, emojiText] : [text];
    this.tweens.add({
      targets: textTargets,
      y: y - 88,
      alpha: 0,
      scale: 1.3,
      duration: effect.duration || 2500,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        text.destroy();
        particles.destroy();
        if (emojiText) emojiText.destroy();
      },
    });
  }

  // 辅助函数：播放文本动画（包括 emoji）
  private playTextAnimation(text: Phaser.GameObjects.Text, emojiText: Phaser.GameObjects.Text | null, targetY: number, effect: any, onComplete?: () => void) {
    const textTargets = emojiText ? [text, emojiText] : [text];
    this.tweens.add({
      targets: textTargets,
      y: targetY,
      alpha: 0,
      scale: 1.2,
      duration: effect.duration || 1500,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        text.destroy();
        if (emojiText) emojiText.destroy();
        if (onComplete) onComplete();
      },
    });
  }

  private playDebuffSpinAnimation(marker: Phaser.GameObjects.Sprite, text: Phaser.GameObjects.Text, emojiText: Phaser.GameObjects.Text | null, effect: any) {
    const x = marker.x;
    const y = marker.y;

    // 紫色诅咒云雾
    const cloud = this.add.circle(x, y, 30, effect.color, 0.4);
    cloud.setDepth(y + 200);

    // 旋转动画
    this.tweens.add({
      targets: cloud,
      rotation: Math.PI * 2,
      scale: 1.5,
      alpha: 0,
      duration: 1200,
      ease: 'Power2.easeOut',
      onComplete: () => cloud.destroy(),
    });

    // 玩家旋转
    this.tweens.add({
      targets: marker,
      rotation: Math.PI * 0.1,
      duration: 150,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
    });

    // 文本动画
    this.playTextAnimation(text, emojiText, y - 88, effect);
  }

  private playItemSparkleAnimation(marker: Phaser.GameObjects.Sprite, text: Phaser.GameObjects.Text, emojiText: Phaser.GameObjects.Text | null, effect: any) {
    const x = marker.x;
    const y = marker.y;

    // 金色闪烁粒子
    const particles = this.add.particles(x, y, 'particle', {
      speed: { min: 20, max: 100 },
      scale: { start: 1.2, end: 0 },
      lifespan: 1000,
      quantity: effect.particleCount || 12,
      tint: effect.color,
      alpha: { start: 1, end: 0 },
      blendMode: 'ADD'
    });
    particles.setDepth(y + 220);

    // 星星形状的闪烁
    for (let i = 0; i < 5; i++) {
      const star = this.add.circle(
        x + Math.cos(i * Math.PI * 0.4) * 25,
        y + Math.sin(i * Math.PI * 0.4) * 25,
        3,
        effect.color,
        1
      );
      star.setDepth(y + 210);

      this.tweens.add({
        targets: star,
        scale: 2,
        alpha: 0,
        duration: 600,
        delay: i * 100,
        ease: 'Power2.easeOut',
        onComplete: () => star.destroy(),
      });
    }

    // 玩家跳跃
    this.tweens.add({
      targets: marker,
      y: y - 8,
      duration: 200,
      yoyo: true,
      ease: 'Quad.easeOut',
    });

    // 文本动画
    this.playTextAnimation(text, emojiText, y - 88, effect, () => particles.destroy());
  }

  private playTeleportSwapAnimation(marker: Phaser.GameObjects.Sprite, text: Phaser.GameObjects.Text, emojiText: Phaser.GameObjects.Text | null, effect: any) {
    const x = marker.x;
    const y = marker.y;

    // 蓝色传送效果
    const portal1 = this.add.circle(x, y, 20, effect.color, 0.5);
    const portal2 = this.add.circle(x, y, 15, effect.color, 0.7);
    portal1.setDepth(y + 190);
    portal2.setDepth(y + 195);

    // 传送粒子
    const particles = this.add.particles(x, y, 'particle', {
      speed: { min: 40, max: 120 },
      scale: { start: 0.8, end: 0 },
      lifespan: 800,
      quantity: effect.particleCount || 10,
      tint: effect.color,
      alpha: { start: 0.8, end: 0 },
      blendMode: 'ADD'
    });
    particles.setDepth(y + 200);

    // 传送门动画
    this.tweens.add({
      targets: [portal1, portal2],
      scale: 3,
      alpha: 0,
      duration: 1000,
      ease: 'Power2.easeOut',
      onComplete: () => {
        portal1.destroy();
        portal2.destroy();
        particles.destroy();
      },
    });

    // 玩家闪烁
    this.tweens.add({
      targets: marker,
      alpha: 0.3,
      duration: 100,
      yoyo: true,
      repeat: 4,
      ease: 'Power2.easeInOut',
    });

    // 文本动画
    this.playTextAnimation(text, emojiText, y - 88, effect);
  }

  private playCurseCloudAnimation(marker: Phaser.GameObjects.Sprite, text: Phaser.GameObjects.Text, emojiText: Phaser.GameObjects.Text | null, effect: any) {
    const x = marker.x;
    const y = marker.y;

    // 黑色诅咒云雾
    const clouds: Phaser.GameObjects.Graphics[] = [];
    for (let i = 0; i < 3; i++) {
      const cloud = this.add.graphics();
      cloud.fillStyle(effect.color, 0.6);
      cloud.fillCircle(0, 0, 15 + i * 5);
      cloud.setPosition(x + Phaser.Math.Between(-10, 10), y - 20 + i * 8);
      cloud.setDepth(y + 180 + i * 10);
      clouds.push(cloud);
    }

    // 云雾飘散动画
    clouds.forEach((cloud, index) => {
      this.tweens.add({
        targets: cloud,
        y: cloud.y - 30,
        alpha: 0,
        duration: 1500,
        delay: index * 200,
        ease: 'Power2.easeOut',
        onComplete: () => cloud.destroy(),
      });
    });

    // 玩家颤抖
    this.tweens.add({
      targets: marker,
      x: x + Phaser.Math.Between(-2, 2),
      y: y + Phaser.Math.Between(-2, 2),
      duration: 80,
      yoyo: true,
      repeat: 8,
      ease: 'Sine.easeInOut',
    });

    // 文本动画
    this.playTextAnimation(text, emojiText, y - 88, effect);
  }

  private playLightningStrikeAnimation(marker: Phaser.GameObjects.Sprite, text: Phaser.GameObjects.Text, emojiText: Phaser.GameObjects.Text | null, effect: any) {
    const x = marker.x;
    const y = marker.y;

    // 雷击效果 - 多段闪电
    const lightningBolts: Phaser.GameObjects.Graphics[] = [];
    for (let i = 0; i < 3; i++) {
      const bolt = this.add.graphics();
      bolt.lineStyle(3, effect.color, 1);
      // 简单的闪电形状
      bolt.moveTo(x, y - 50);
      bolt.lineTo(x + 5, y - 30);
      bolt.lineTo(x - 3, y - 10);
      bolt.lineTo(x + 2, y + 10);
      bolt.setDepth(y + 250);
      lightningBolts.push(bolt);
    }

    // 雷击粒子
    const particles = this.add.particles(x, y, 'particle', {
      speed: { min: 100, max: 200 },
      scale: { start: 1, end: 0 },
      lifespan: 600,
      quantity: effect.particleCount || 20,
      tint: effect.color,
      alpha: { start: 1, end: 0 },
      blendMode: 'ADD'
    });
    particles.setDepth(y + 220);

    // 闪电闪烁
    lightningBolts.forEach((bolt, index) => {
      this.tweens.add({
        targets: bolt,
        alpha: 0,
        duration: 100,
        delay: index * 50,
        yoyo: true,
        repeat: 2,
        ease: 'Power2.easeInOut',
        onComplete: () => bolt.destroy(),
      });
    });

    // 屏幕震动效果
    this.cameras.main.shake(300, 0.01);

    // 玩家被击退
    this.tweens.add({
      targets: marker,
      y: y + 5,
      duration: 100,
      yoyo: true,
      ease: 'Power2.easeOut',
    });

    // 文本动画
    this.playTextAnimation(text, emojiText, y - 88, effect, () => particles.destroy());
  }

  private playGhostAttackAnimation(marker: Phaser.GameObjects.Sprite, text: Phaser.GameObjects.Text, emojiText: Phaser.GameObjects.Text | null, effect: any) {
    const x = marker.x;
    const y = marker.y;

    // 幽灵形状
    const ghost = this.add.graphics();
    ghost.fillStyle(effect.color, 0.7);
    ghost.fillCircle(0, 0, 12);
    ghost.fillRect(-8, -8, 16, 16);
    ghost.setPosition(x, y - 25);
    ghost.setDepth(y + 200);

    // 幽灵飘动
    this.tweens.add({
      targets: ghost,
      x: x + 20,
      y: y - 35,
      alpha: 0,
      duration: 800,
      ease: 'Power2.easeOut',
      onComplete: () => ghost.destroy(),
    });

    // 玩家惊吓抖动
    this.tweens.add({
      targets: marker,
      scale: 0.9,
      duration: 150,
      yoyo: true,
      repeat: 2,
      ease: 'Back.easeOut',
    });

    // 文本动画
    this.playTextAnimation(text, emojiText, y - 88, effect);
  }

  private playStealFlashAnimation(marker: Phaser.GameObjects.Sprite, text: Phaser.GameObjects.Text, emojiText: Phaser.GameObjects.Text | null, effect: any) {
    const x = marker.x;
    const y = marker.y;

    // 橙色偷窃闪光
    const flash = this.add.circle(x, y, 30, effect.color, 0.4);
    flash.setDepth(y + 200);

    // 快速闪烁
    this.tweens.add({
      targets: flash,
      scale: 2,
      alpha: 0,
      duration: 300,
      ease: 'Power2.easeOut',
      onComplete: () => flash.destroy(),
    });

    // 玩家物品消失效果（缩小）
    this.tweens.add({
      targets: marker,
      scale: 0.8,
      duration: 200,
      yoyo: true,
      ease: 'Back.easeOut',
    });

    // 文本动画
    this.playTextAnimation(text, emojiText, y - 88, effect);
  }

  private playNeutralPulseAnimation(marker: Phaser.GameObjects.Sprite, text: Phaser.GameObjects.Text, emojiText: Phaser.GameObjects.Text | null, effect: any) {
    const x = marker.x;
    const y = marker.y;

    // 白色中性脉冲
    const pulse = this.add.circle(x, y, 25, effect.color, 0.3);
    pulse.setDepth(y + 200);

    // 脉冲扩散
    this.tweens.add({
      targets: pulse,
      scale: 2.5,
      alpha: 0,
      duration: 1000,
      ease: 'Power2.easeOut',
      onComplete: () => pulse.destroy(),
    });

    // 玩家轻微脉冲
    this.tweens.add({
      targets: marker,
      scale: 1.1,
      duration: 300,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });

    // 文本动画
    this.playTextAnimation(text, emojiText, y - 88, effect);
  }

}