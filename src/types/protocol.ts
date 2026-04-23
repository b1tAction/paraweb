/**
 * 协议消息类型定义 - 对齐后端 pkg/net/sync.go
 *
 * 这些类型定义了客户端与 Nakama 后端交互的数据结构
 */

// ========== 服务端 -> 客户端消息类型 ==========

/**
 * StateSync - 完整游戏状态同步
 * 在进入新状态时广播
 */
export interface StateSync {
  /** 全局状态 (Layer 1) */
  global_state: string;
  /** 回合状态 (Layer 2) */
  turn_state: string;
  /** 当前回合玩家 ID */
  current_player_id: string;
  /** 当前轮次 */
  round: number;
  /** 当前回合索引 */
  turn: number;
  /** 是否暂停 (等待决策) */
  paused: boolean;
  /** 所有玩家状态 */
  players: Player[];
  /** 地图信息 */
  map: MapInfo;
}

/**
 * TurnSync - 回合效果列表
 * 在执行效果后广播，客户端按顺序渲染
 */
export interface TurnSync {
  /** 当前轮次 */
  round: number;
  /** 当前回合索引 */
  turn: number;
  /** 当前回合玩家 ID */
  current_player_id: string;
  /** 日志条目列表 */
  entries: LogEntry[];
}

/**
 * LogEntry - 游戏日志条目
 */
export interface LogEntry {
  /** 时间戳 */
  timestamp: string;
  /** 条目类型 */
  type: string;
  /** 动作类型 */
  action_type: string;
  /** 目标 ID */
  target: string;
  /** 来源 */
  source: string;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * MapInfo - 地图信息
 */
export interface MapInfo {
  /** 地图长度 (格子数) */
  length: number;
  /** 格子列表 */
  cells: CellInfo[];
}

/**
 * CellInfo - 地图格子信息
 */
export interface CellInfo {
  /** 格子索引 (0 到 Length-1) */
  index: number;
  /** 格子类型 */
  cell_type: string;
  /** 事件 ID (仅 Event 类型格子) */
  event_id?: string;
  /** 是否已破坏 (仅 Fragile 类型格子) */
  is_broken?: boolean;
}

/**
 * Player - 玩家状态快照
 */
export interface Player {
  /** 玩家游戏 ID (等于 Nakama UserID) */
  player_id: string;
  /** 显示名称 */
  display_name: string;
  /** 阵营 */
  faction: string;
  /** 地图位置 */
  position: number;
  /** 生命值 */
  hp: number;
  /** 幸运值 */
  lp: number;
  /** 增益效果列表 */
  buffs: Buff[];
  /** 道具列表 */
  items: Item[];
  /** 技能充能数 (青龙/玄武) */
  charge: number;
  /** 离火计数器 (朱雀) */
  fire_counter: number;
  /** 是否死亡 */
  is_dead: boolean;
  /** 是否跳过回合 */
  skip_turn: boolean;
}

/**
 * Buff - 增益效果状态
 */
export interface Buff {
  /** 增益类型 */
  type: string;
  /** 中文显示名称 */
  name: string;
  /** 剩余回合数 (-1 为永久) */
  duration: number;
}

/**
 * Item - 道具状态
 */
export interface Item {
  /** 道具唯一 ID */
  id: string;
  /** 道具类型 */
  type: string;
  /** 中文显示名称 */
  name: string;
}

/**
 * Available - 当前玩家可用操作
 * 在进入 MainAction 状态时发送
 */
export interface Available {
  /** 可用道具列表 */
  items: Item[];
  /** 是否可以使用技能 */
  can_use_skill: boolean;
  /** 骰子类型 */
  dice_type: string;
}

/**
 * Decision - 决策请求
 */
export interface Decision {
  /** 决策 ID */
  id: string;
  /** 提示文本 */
  prompt: string;
  /** 上下文描述 */
  context: string;
  /** 选项列表 */
  options: Option[];
  /** 超时时间 (秒) */
  timeout: number;
  /** 默认选项索引 */
  default: number;
}

/**
 * Option - 决策选项
 */
export interface Option {
  /** 选项 ID */
  id: string;
  /** 显示标签 */
  label: string;
  /** 效果描述 */
  effect?: string;
}

/**
 * MiniGameStart - 小游戏开始通知
 */
export interface MiniGameStart {
  /** 小游戏类型 */
  game_type: string;
  /** 参与玩家 ID 列表 */
  players: string[];
}

/**
 * MiniGameResult - 小游戏结果
 */
export interface MiniGameResult {
  /** 排名列表 */
  rankings: RankingEntry[];
}

/**
 * RankingEntry - 排名条目
 */
export interface RankingEntry {
  /** 玩家 ID */
  player_id: string;
  /** 显示名称 */
  display_name: string;
  /** 排名 (1-4) */
  rank: number;
}

/**
 * GameOver - 游戏结束通知
 */
export interface GameOver {
  /** 获胜者 ID */
  winner_id: string;
  /** 统计数据 */
  stats: PlayerStats[];
}

/**
 * PlayerStats - 玩家结束统计
 */
export interface PlayerStats {
  /** 玩家 ID */
  player_id: string;
  /** 获胜轮数 */
  rounds_won: number;
  /** 抽取事件数 */
  events_drawn: number;
  /** 使用道具数 */
  items_used: number;
}

/**
 * ActionRejected - 动作拒绝通知
 */
export interface ActionRejected {
  /** 被拒绝的 OpCode */
  op_code: number;
  /** 错误码 */
  error_code: number;
  /** 拒绝原因 */
  reason: string;
  /** 人类可读消息 */
  message: string;
}

/**
 * WaitingSync - 等待同步 (游戏开始前)
 */
export interface WaitingSync {
  /** 房间 ID */
  match_id: string;
  /** 房主 ID */
  host_user_id: string;
  /** 玩家列表 */
  players: WaitingPlayer[];
  /** 玩家数量 */
  player_count: number;
  /** 最小玩家数 */
  min_players: number;
  /** 最大玩家数 */
  max_players: number;
  /** 是否可以开始 */
  can_start: boolean;
  /** 状态消息 */
  message: string;
}

/**
 * WaitingPlayer - 等待房间玩家
 */
export interface WaitingPlayer {
  /** 用户 ID */
  user_id: string;
  /** 显示名称 */
  display_name: string;
  /** 阵营 */
  faction: string;
  /** 是否房主 */
  is_host: boolean;
}

/**
 * StartGameAck - 开始游戏确认信号
 * 房主发送 OpStartGame 后，服务端广播此信号给所有玩家
 */
export interface StartGameAck {
  /** 完整地图配置 */
  map_config: MapConfig;
}

/**
 * MapConfig - 完整地图配置 (对齐 pkg/net.MapConfig)
 * 包含地图所有格子的完整信息，用于前端渲染
 */
export interface MapConfig {
  /** 地图长度 (格子数) */
  length: number;
  /** 起点索引 */
  start_index: number;
  /** 终点索引 (Boss 格子) */
  end_index: number;
  /** 格子配置列表 */
  cells: MapCellConfig[];
}

/**
 * MapCellConfig - 完整格子配置 (对齐 pkg/net.MapCellConfig)
 * 包含格子类型、绘制类型、概率等完整信息
 */
export interface MapCellConfig {
  /** 格子索引 (0 到 Length-1) */
  index: number;
  /** 格子类型 (normal, fragile, fog, checkpoint, boss, event) */
  cell_type: string;
  /** 是否已破坏 (仅 Fragile 类型) */
  is_broken: boolean;
  /** 事件 ID (仅 Event 类型格子) */
  event_id: string;
  /** 是否激活迷雾 (仅 Fog 类型) */
  fog_active: boolean;
  /** 绘制类型 (none, event, item) - 决定着陆时抽取什么 */
  draw_type: string;
  /** 好事件概率权重 */
  prob_good: number;
  /** 中性事件概率权重 */
  prob_neutral: number;
  /** 坏事件概率权重 */
  prob_bad: number;
}

// ========== 客户端 -> 服务端消息类型 ==========

/**
 * RollDice - 掷骰子请求
 */
export interface RollDice {
  // 空对象，服务端根据当前玩家计算
}

/**
 * UseItem - 使用道具请求
 */
export interface UseItem {
  /** 道具 ID */
  item_id: string;
  /** 目标 ID (可选) */
  target_id?: string;
}

/**
 * UseSkill - 使用技能请求
 */
export interface UseSkill {
  // 空对象，服务端检查玩家阵营和充能状态
}

/**
 * UserChoice - 决策选择响应
 */
export interface UserChoice {
  /** 决策 ID */
  decision_id: string;
  /** 选择的选项索引 */
  choice: number;
}

/**
 * MiniGameResultSubmit - 小游戏结果提交 (已废弃)
 */
export interface MiniGameResultSubmit {
  /** 排名 */
  rank: number;
}

/**
 * StartGame - 开始游戏请求 (仅房主)
 */
export interface StartGame {
  // 空对象
}
