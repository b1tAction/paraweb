/**
 * 全局游戏状态机 - 使用 Zustand
 *
 * 管理 11 个场景状态和游戏数据
 */

import { create } from 'zustand';
import type { Session, Socket, Match } from '@heroiclabs/nakama-js';
import type {
  Player,
  Decision,
  Available,
  WaitingSync,
  MiniGameStart,
  MiniGameResult,
  GameOver,
  TurnSync,
  StartGameAck,
  MapConfig,
} from '../types/protocol';

// ========== 场景枚举 ==========

export enum Scene {
  /** 主菜单 (登录/创建/加入) */
  Home = 'HomeScene',
  /** 创建房间 */
  CreateRoom = 'CreateRoomScene',
  /** 加入房间 */
  JoinRoom = 'JoinRoomScene',
  /** 房间等待 ( Lobby ) */
  Lobby = 'LobbyScene',
  /** 小游戏提交排名 */
  MiniGameSubmitRank = 'MiniGameSubmitRankScene',
  /** 加载中 (match_init) */
  Loading = 'LoadingScene',
  /** 骰子分配展示 */
  DiceAssign = 'DiceAssignScene',
  /** 主棋盘阶段 */
  Board = 'BoardScene',
  /** Boss 战斗 */
  BossBattle = 'BossBattleScene',
  /** 游戏结束 */
  GameOver = 'GameOverScene',
}

// ========== 全局状态枚举 ==========

/** 全局状态 (Layer 1) */
export type GlobalState =
  | 'match_init'
  | 'round_mini_game'
  | 'round_prep'
  | 'turn_loop'
  | 'round_end_wait'
  | 'RoundEndWait'
  | 'boss_battle'
  | 'game_over';

/** 回合状态 (Layer 2) - 支持 snake_case 和 PascalCase 两种格式 */
export type TurnState =
  | 'turn_upkeep' | 'TurnUpkeep'
  | 'main_action' | 'MainAction'
  | 'turn_moving' | 'TurnMoving'
  | 'turn_landed' | 'TurnLanded'
  | 'turn_event' | 'TurnEvent'
  | 'turn_end' | 'TurnEnd'
  | '';

// ========== Zustand Store ==========

interface GameState {
  // ========== 连接实例 ==========

  /** Nakama Session */
  session: Session | null;
  /** Nakama Socket */
  socket: Socket | null;
  /** 当前 Match */
  match: Match | null;

  // ========== 状态机 ==========

  /** 当前场景 */
  currentScene: Scene;
  /** 全局状态 (Layer 1) */
  globalState: GlobalState;
  /** 回合状态 (Layer 2) */
  turnState: TurnState;

  // ========== 游戏数据 ==========

  /** 当前玩家 ID (自己的 ID) */
  myPlayerId: string;
  /** 显示名称 */
  displayName: string;
  /** 所有玩家状态 */
  players: Player[];
  /** 当前回合玩家 ID */
  currentPlayerId: string;
  /** 决策请求 (如果有) */
  decisionRequest: Decision | null;
  /** 可用动作 (如果有) */
  availableActions: Available | null;
  /** 等待状态 (如果有) */
  waitingSync: WaitingSync | null;
  /** 小游戏结果 (如果有) */
  miniGameStart: MiniGameStart | null;
  /** 小游戏结果 (如果有) */
  miniGameResult: MiniGameResult | null;
  /** 游戏结束信息 (如果有) */
  gameOver: GameOver | null;
  /** 开始游戏确认 (包含地图配置) */
  startGameAck: StartGameAck | null;
  /** 地图配置 (用于渲染地图) */
  mapConfig: MapConfig | null;
  /** 当前房间 ID */
  matchId: string;
  /** 当前回合同步数据 (TurnSync) */
  turnSync: TurnSync | null;

  // ========== 状态 Actions ==========

  /** 设置连接实例 */
  setConnection: (session: Session, socket: Socket) => void;
  /** 设置 Match */
  setMatch: (match: Match | null) => void;
  /** 设置当前玩家 ID */
  setMyPlayerId: (playerId: string) => void;
  /** 设置显示名称 */
  setDisplayName: (name: string) => void;
  /** 设置房间 ID */
  setMatchId: (id: string) => void;

  /** 设置场景 */
  setScene: (scene: Scene) => void;
  /** 更新游戏状态 (全局 + 回合) */
  updateGameState: (global: GlobalState, turn: TurnState) => void;

  /** 设置决策请求 */
  setDecisionRequest: (decision: Decision | null) => void;
  /** 设置可用动作 */
  setAvailableActions: (available: Available | null) => void;
  /** 设置等待状态 */
  setWaitingSync: (waiting: WaitingSync | null) => void;
  /** 设置小游戏结果 */
  setMiniGameStart: (start: MiniGameStart | null) => void;
  /** 设置小游戏结果 */
  setMiniGameResult: (result: MiniGameResult | null) => void;
  /** 设置游戏结束 */
  setGameOver: (gameOver: GameOver | null) => void;
  /** 设置回合同步数据 (TurnSync) */
  setTurnSync: (turnSync: TurnSync | null) => void;
  /** 设置开始游戏确认 */
  setStartGameAck: (ack: StartGameAck | null) => void;
  /** 设置地图配置 */
  setMapConfig: (config: MapConfig | null) => void;

  /** 更新玩家列表 */
  setPlayers: (players: Player[]) => void;
  /** 设置当前回合玩家 */
  setCurrentPlayerId: (playerId: string) => void;

  /** 重置状态 (用于退出游戏) */
  reset: () => void;
}

// ========== 创建 Store ==========

export const useGameStore = create<GameState>((set) => ({
  // ========== 初始状态 ==========

  session: null,
  socket: null,
  match: null,

  currentScene: Scene.Home,
  globalState: 'match_init',
  turnState: '',

  myPlayerId: '',
  players: [],
  currentPlayerId: '',
  decisionRequest: null,
  availableActions: null,
  waitingSync: null,
  miniGameStart: null,
  miniGameResult: null,
  gameOver: null,
  startGameAck: null,
  mapConfig: null,
  matchId: '',
  displayName: '',
  turnSync: null,

  // ========== Actions ==========

  setConnection: (session, socket) => set({ session, socket }),

  setMatch: (match) => set({ match }),

  setMyPlayerId: (playerId) => set({ myPlayerId: playerId }),

  setDisplayName: (name) => set({ displayName: name }),

  setMatchId: (id) => set({ matchId: id }),

  setScene: (scene) => set({ currentScene: scene }),

  updateGameState: (global, turn) =>
    set({ globalState: global, turnState: turn }),

  setDecisionRequest: (decision) => set({ decisionRequest: decision }),

  setAvailableActions: (available) => set({ availableActions: available }),

  setWaitingSync: (waiting) => set({ waitingSync: waiting }),

  setMiniGameStart: (start) => set({ miniGameStart: start }),

  setMiniGameResult: (result) => set({ miniGameResult: result }),

  setGameOver: (gameOver) => set({ gameOver }),

  setTurnSync: (turnSync) => set({ turnSync }),
  setStartGameAck: (ack) => set({ startGameAck: ack }),

  setMapConfig: (config) => set({ mapConfig: config }),

  setPlayers: (players) => set({ players }),

  setCurrentPlayerId: (playerId) => set({ currentPlayerId: playerId }),

  reset: () =>
    set({
      session: null,
      socket: null,
      match: null,
      currentScene: Scene.Home,
      globalState: 'match_init',
      turnState: '',
      myPlayerId: '',
      displayName: '',
      matchId: '',
      players: [],
      currentPlayerId: '',
      decisionRequest: null,
      availableActions: null,
      waitingSync: null,
      miniGameStart: null,
      miniGameResult: null,
      gameOver: null,
      turnSync: null,
      startGameAck: null,
      mapConfig: null,
    }),
}));

export default useGameStore;
