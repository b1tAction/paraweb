/**
 * NakamaService - 核心胶水层
 *
 * 封装 @heroiclabs/nakama-js，负责与 Nakama 后端进行交互
 * 实现消息监听、路由和场景切换逻辑
 */

import { Client, type Match, type MatchData, type Session, type Socket } from '@heroiclabs/nakama-js';
import * as opcodes from '../api/opcodes';
import { Scene, useGameStore } from '../store/gameStore';
import type * as protocol from '../types/protocol';
import {
  getNakamaHttpApiBaseUrl,
  getNakamaSdkPort,
  getNakamaWebSocketUrl,
  type NakamaEndpoint,
  parseNakamaEndpoint,
} from '../utils/nakamaEndpoint';

type ServerConfig = NakamaEndpoint & {
  sdkPort: string;
  httpApiBaseUrl: string;
  webSocketUrl: string;
};

/**
 * NakamaService 类
 *
 * 单例模式，通过 gameService 导出实例
 */
export class NakamaService {
  private endpoint: NakamaEndpoint;
  private client: Client;
  private serverKey: string = 'defaultkey';

  private readonly DEFAULT_ENDPOINT_INPUT: string = this.resolveDefaultEndpointInput();

  // Device ID prefix for device-UUID-based authentication
  private readonly DEVICE_ID_PREFIX = 'paradiced_';
  // LocalStorage keys
  private readonly STORAGE_KEY_USERNAME = 'paradiced_username';
  private readonly STORAGE_KEY_DEVICE_UUID = 'paradiced_device_uuid';
  private readonly STORAGE_KEY_NAKAMA_ENDPOINT = 'paradiced_nakama_endpoint';
  private readonly LEGACY_STORAGE_KEYS_NAKAMA = [
    'paradiced_nakama_host',
    'paradiced_nakama_port',
    'paradiced_nakama_ssl',
  ];

  constructor() {
    this.endpoint = this.loadServerConfig();
    this.client = this.createClient();
  }

  private resolveDefaultEndpointInput(): string {
    const configuredEndpoint = import.meta.env.VITE_NAKAMA_ENDPOINT?.trim();
    if (configuredEndpoint) {
      return configuredEndpoint;
    }

    if (typeof window !== 'undefined') {
      const browserHost = window.location?.hostname || '';
      if (browserHost && browserHost !== 'localhost' && browserHost !== 'wails.localhost') {
        const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
        const port = window.location.port ? `:${window.location.port}` : '';
        const base = `${protocol}://${browserHost}${port}`;
        const apiPath = this.resolveDefaultApiPath(window.location.pathname || '');
        if (apiPath) {
          return `${base}${apiPath}`;
        }
        return base;
      }
    }

    return '127.0.0.1:17350';
  }

  private resolveDefaultApiPath(pathname: string): string {
    const basePath = this.resolveAppBasePath();
    if (!basePath) return '';

    const normalizedPathname = pathname.endsWith('/') ? pathname : `${pathname}/`;
    if (normalizedPathname !== basePath && !normalizedPathname.startsWith(basePath)) return '';

    return `${basePath}api`;
  }

  private resolveAppBasePath(): string {
    const rawBaseUrl = import.meta.env.BASE_URL?.trim() || '/';
    if (rawBaseUrl === './' || rawBaseUrl === '/') return '';

    const parsedPath = new URL(rawBaseUrl, window.location.origin).pathname;
    const normalizedPath = parsedPath.replace(/^\/+|\/+$/g, '');
    return normalizedPath ? `/${normalizedPath}/` : '';
  }

  private getDefaultEndpoint(): NakamaEndpoint {
    return parseNakamaEndpoint(this.DEFAULT_ENDPOINT_INPUT);
  }

  private buildServerConfig(endpoint: NakamaEndpoint): ServerConfig {
    return {
      ...endpoint,
      sdkPort: getNakamaSdkPort(endpoint),
      httpApiBaseUrl: getNakamaHttpApiBaseUrl(endpoint),
      webSocketUrl: getNakamaWebSocketUrl(endpoint),
    };
  }

  private loadServerConfig(): NakamaEndpoint {
    this.removeLegacyServerConfig();

    const storedEndpoint = localStorage.getItem(this.STORAGE_KEY_NAKAMA_ENDPOINT)?.trim();
    if (storedEndpoint) {
      try {
        return parseNakamaEndpoint(storedEndpoint);
      } catch (error) {
        console.warn('[Nakama] 保存的服务器地址无效，回退到默认地址', error);
        localStorage.removeItem(this.STORAGE_KEY_NAKAMA_ENDPOINT);
      }
    }

    return this.getDefaultEndpoint();
  }

  getDefaultServerConfig(): ServerConfig {
    return this.buildServerConfig(this.getDefaultEndpoint());
  }

  getServerConfig(): ServerConfig {
    return this.buildServerConfig(this.endpoint);
  }

  getStoredDisplayName(): string {
    return localStorage.getItem(this.STORAGE_KEY_USERNAME)?.trim() || '';
  }

  setServerConfig(endpointInput: string) {
    const nextEndpoint = parseNakamaEndpoint(endpointInput);

    this.endpoint = nextEndpoint;
    localStorage.setItem(this.STORAGE_KEY_NAKAMA_ENDPOINT, nextEndpoint.endpoint);
    this.removeLegacyServerConfig();
    this.rebuildClient();

    console.log('[Nakama] 服务器配置已更新', {
      endpoint: this.endpoint.endpoint,
      host: this.endpoint.host,
      port: this.endpoint.port,
      path: this.endpoint.path,
      useSSL: this.endpoint.useSSL,
    });
  }

  private removeLegacyServerConfig() {
    this.LEGACY_STORAGE_KEYS_NAKAMA.forEach((key) => {
      localStorage.removeItem(key);
    });
  }

  private createClient(): Client {
    return new Client(this.serverKey, this.endpoint.host, getNakamaSdkPort(this.endpoint), this.endpoint.useSSL);
  }

  private rebuildClient() {
    this.client = this.createClient();
  }

  private createConfiguredSocket(): Socket {
    return this.client.createSocket(this.endpoint.useSSL);
  }

  /**
   * Get or create a persistent device UUID from localStorage.
   * One device = one account. The UUID is preserved across sessions.
   * Falls back to a manual UUID v4 generation if crypto.randomUUID
   * is unavailable (e.g. non-secure context / HTTP).
   */
  private getOrCreateDeviceUUID(): string {
    const stored = localStorage.getItem(this.STORAGE_KEY_DEVICE_UUID);
    if (stored) return stored;

    const newUUID = this.generateUUID();
    localStorage.setItem(this.STORAGE_KEY_DEVICE_UUID, newUUID);
    console.log('[Nakama] 生成新的 device UUID', newUUID);
    return newUUID;
  }

  /**
   * Generate a UUID v4 string.
   * Uses crypto.randomUUID() when available (secure context),
   * otherwise falls back to crypto.getRandomValues-based generation.
   */
  private generateUUID(): string {
    // crypto.randomUUID() is only available in secure contexts (HTTPS)
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    // Fallback: UUID v4 via crypto.getRandomValues (available in all contexts)
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      // Last resort: Math.random (less secure but functional)
      for (let i = 0; i < 16; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }

    // Set version (4) and variant bits per RFC 4122
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  /**
   * 构建 joinMatch metadata，确保 display_name 和 faction 始终可用。
   * - display_name: 优先使用调用方传入的，其次 store.displayName，最后 session.username
   * - faction: 优先使用调用方传入的，其次 store.faction
   */
  private buildJoinMetadata(metadata?: Record<string, string>): Record<string, string> | undefined {
    const store = useGameStore.getState();
    const merged: Record<string, string> = { ...(metadata || {}) };

    const candidateDisplayName =
      merged.display_name?.trim() || store.displayName?.trim() || store.session?.username?.trim() || '';

    if (candidateDisplayName) {
      merged.display_name = candidateDisplayName;
    }

    const candidateFaction = merged.faction?.trim() || store.faction?.trim() || 'qing_long'; // Default fallback matching backend parseFactionFromMetadata behavior

    merged.faction = candidateFaction; // Always set; never send empty faction

    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  /**
   * 1. Auto-login with device UUID (primary auth flow)
   *
   * Uses Nakama's device authentication with a persistent device UUID.
   * One device = one account, regardless of display name.
   * Called by HomeScene "开始游戏" button when no active session exists.
   *
   * Flow:
   * 1. Get/create deviceUUID → deviceId = paradiced_{deviceUUID}
   * 2. authenticateDevice(deviceId, true, deviceId)
   * 3. New account: generate default name user_{shortId}, updateAccount
   * 4. Existing account: restore displayName from localStorage + sync via updateAccount
   * 5. Connect socket, setConnection, setMyPlayerId
   * 6. setupListeners
   */
  async autoLogin(): Promise<Session> {
    const deviceUUID = this.getOrCreateDeviceUUID();
    const deviceId = `${this.DEVICE_ID_PREFIX}${deviceUUID}`;

    console.log('[Nakama] 开始自动认证...', { deviceUUID });

    // authenticateDevice: create=true auto-creates account if not exists
    const session = await this.client.authenticateDevice(
      deviceId,
      true, // create = true, auto-register if not exists
      deviceId, // initial username = deviceId (will be overridden with display_name)
    );

    console.log('[Nakama] 认证成功', {
      userId: session.user_id,
      username: session.username,
    });

    // Determine display name
    const savedDisplayName = localStorage.getItem(this.STORAGE_KEY_USERNAME);
    let displayName: string;

    if (savedDisplayName) {
      // Existing account: restore saved display name
      displayName = savedDisplayName;
    } else {
      // New account: generate default name user_{shortId}
      const shortId = (session.user_id || '').substring(0, 4);
      displayName = `user_${shortId}`;
    }

    // Sync display name to Nakama account
    await this.client.updateAccount(session, {
      display_name: displayName,
    });

    // Save display name for the next app start.
    localStorage.setItem(this.STORAGE_KEY_USERNAME, displayName);

    // Create and connect socket
    const socket = this.createConfiguredSocket();
    await socket.connect(session, false);

    console.log('[Nakama] WebSocket 连接已建立');

    useGameStore.getState().setConnection(session, socket);
    useGameStore.getState().setMyPlayerId(session.user_id || '');
    useGameStore.getState().setDisplayName(displayName);

    this.setupListeners(socket);

    return session;
  }

  /**
   * Update the current user's display name.
   *
   * This only changes the display name; the underlying account (deviceUUID-based)
   * remains the same. Name changes are persisted in localStorage and synced
   * to Nakama via updateAccount.
   *
   * @param newName The new display name to set
   */
  async updateDisplayName(newName: string): Promise<void> {
    const { session } = useGameStore.getState();
    if (!session) {
      throw new Error('[Nakama] 没有有效的 session');
    }

    const trimmedName = newName.trim();
    if (!trimmedName) {
      throw new Error('[Nakama] 昵称不能为空');
    }

    console.log('[Nakama] 更新昵称', { newName: trimmedName });

    await this.client.updateAccount(session, {
      display_name: trimmedName,
    });

    localStorage.setItem(this.STORAGE_KEY_USERNAME, trimmedName);
    useGameStore.getState().setDisplayName(trimmedName);

    console.log('[Nakama] 昵称更新成功');
  }

  /**
   * 1c. Username-based authentication (legacy)
   *
   * Uses Nakama's device authentication with a deterministic deviceId
   * derived from the username. Deprecated: use autoLogin() instead.
   *
   * @deprecated Use autoLogin() instead for device-UUID-based auth
   * @param username The display name / nickname to use
   */
  async loginByUsername(username: string): Promise<Session> {
    console.log('[Nakama] 开始认证...', { username });

    // Generate a deterministic deviceId from username
    const deviceId = `${this.DEVICE_ID_PREFIX}${username}`;

    // authenticateDevice: create=true auto-creates account if not exists
    const session = await this.client.authenticateDevice(
      deviceId,
      true, // create = true, auto-register if not exists
      username, // username as display name
    );

    console.log('[Nakama] 认证成功', {
      userId: session.user_id,
      username: session.username,
    });

    // Save username for the next app start.
    localStorage.setItem(this.STORAGE_KEY_USERNAME, username);

    // Create and connect socket
    const socket = this.createConfiguredSocket();
    await socket.connect(session, false);

    console.log('[Nakama] WebSocket 连接已建立');

    useGameStore.getState().setConnection(session, socket);
    useGameStore.getState().setMyPlayerId(session.user_id || '');
    useGameStore.getState().setDisplayName(username);

    this.setupListeners(socket);

    return session;
  }

  /**
   * 1b. Email + Password authentication (legacy)
   * @deprecated Use loginByUsername instead for passwordless flow
   */
  async loginWithPassword(username: string, password: string, isRegister: boolean = false): Promise<Session> {
    console.log('[Nakama] 开始认证...', { username, isRegister });

    // Convert username to virtual email format (legacy)
    const dummyEmail = `${username}@paradiced.local`;

    // 使用 authenticateEmail 进行服务器端密码验证
    const session = await this.client.authenticateEmail(
      dummyEmail,
      password,
      isRegister, // true = 注册，false = 登录
      username, // username 用作显示名称
    );

    console.log('[Nakama] 认证成功', {
      userId: session.user_id,
      username: session.username,
    });

    localStorage.setItem(this.STORAGE_KEY_USERNAME, username);

    // 创建并连接 socket
    const socket = this.createConfiguredSocket();
    await socket.connect(session, false);

    console.log('[Nakama] WebSocket 连接已建立');

    useGameStore.getState().setConnection(session, socket);
    useGameStore.getState().setMyPlayerId(session.user_id || '');
    useGameStore.getState().setDisplayName(username);

    this.setupListeners(socket);

    return session;
  }

  /**
   * 2. 登出
   *
   * 清除本地昵称并断开连接。
   * 注意：deviceUUID 保留在 localStorage 中，下次 autoLogin 使用同一账号。
   */
  async logout(): Promise<void> {
    localStorage.removeItem(this.STORAGE_KEY_USERNAME);

    const { socket, match } = useGameStore.getState();

    if (match && socket) {
      await socket.leaveMatch(match.match_id);
    }

    useGameStore.getState().reset();
    console.log('[Nakama] 已登出');
  }

  /**
   * 3. 设备认证 (保留用于兼容)
   * @deprecated 请使用 loginWithPassword 代替
   */
  async connect(deviceId: string, displayName: string): Promise<Session> {
    console.log('[Nakama] 开始连接...', { deviceId, displayName });

    // nakama-js: authenticateDevice 直接返回 Session
    const session = await this.client.authenticateDevice(
      deviceId,
      true, // create = true, 如果用户不存在则创建
      displayName, // username 用作显示名称
    );

    console.log('[Nakama] 认证成功', {
      userId: session.user_id,
      username: session.username,
    });

    // nakama-js: createSocket() 返回 Socket
    const socket = this.createConfiguredSocket();

    // nakama-js: connect 无需 context, createStatus = false
    await socket.connect(session, false);

    console.log('[Nakama] WebSocket 连接已建立');

    useGameStore.getState().setConnection(session, socket);
    useGameStore.getState().setMyPlayerId(session.user_id || '');
    useGameStore.getState().setDisplayName(displayName);
    this.setupListeners(socket);

    return session;
  }

  /**
   * 2. WebSocket 消息监听与路由 (核心)
   */
  private setupListeners(socket: Socket) {
    // nakama-js: 使用 onmatchdata 回调属性 (对比 Go 的 MatchDataHandler)
    socket.onmatchdata = (matchData: MatchData) => {
      // 解码数据 (Uint8Array -> JSON)
      const data = matchData.data ? JSON.parse(new TextDecoder().decode(matchData.data)) : {};

      console.log(`[Nakama] 收到 OpCode: ${matchData.op_code} (${opcodes.getOpCodeName(matchData.op_code)})`, data);

      // 根据 OpCode 路由 (对齐 Go CLI)
      switch (matchData.op_code) {
        case opcodes.OpStateSync:
          this.handleStateSync(data as protocol.StateSync);
          break;

        case opcodes.OpWaitingSync:
          this.handleWaitingSync(data as protocol.WaitingSync);
          break;

        case opcodes.OpAvailable:
          this.handleAvailable(data as protocol.Available);
          break;

        case opcodes.OpDecisionRequest:
          this.handleDecisionRequest(data as protocol.Decision);
          break;

        case opcodes.OpMiniGameStart:
          this.handleMiniGameStart(data as protocol.MiniGameStart);
          break;

        case opcodes.OpMiniGameResult:
          this.handleMiniGameResult(data as protocol.MiniGameResult);
          break;

        case opcodes.OpGameOver:
          this.handleGameOver(data as protocol.GameOver);
          break;

        case opcodes.OpActionRejected:
          this.handleActionRejected(data as protocol.ActionRejected);
          break;

        case opcodes.OpFullSync:
          this.handleFullSync(data);
          break;

        case opcodes.OpStartGameAck:
          this.handleStartGameAck(data as protocol.StartGameAck);
          break;

        default:
          console.warn(`[Nakama] 未处理的 OpCode: ${matchData.op_code}`);
      }
    };

    // 处理断线
    socket.ondisconnect = (evt: Event) => {
      console.log('[Nakama] 连接已断开', evt);
    };

    // 处理错误
    socket.onerror = (evt: Event) => {
      console.error('[Nakama] 发生错误', evt);
    };
  }

  /**
   * 3. 消息处理器
   */

  private handleStateSync(data: protocol.StateSync) {
    const store = useGameStore.getState();

    // 压入状态等待队列
    store.enqueueStateSync(data);

    // 对齐 CLI：离开小游戏全局状态时清空本轮小游戏参与者缓存，避免下一轮沿用旧 participants
    // 但是如果正在展示 MiniGameSubmitRank 场景且小游戏结果待处理，则不清空，等结果显示完成后再清空
    if (data.global_state !== 'round_mini_game' && data.global_state !== 'RoundMiniGame') {
      if (!(store.currentScene === Scene.MiniGameSubmitRank && store.miniGameResultPending)) {
        store.setMiniGameStart(null);
      }
    }

    // RoundEndWait: BoardScene 会在动画队列真正播放完成后发送 OpRoundReady。
    const normalized = data.global_state.trim();
    if (normalized === 'round_end_wait' || normalized === 'RoundEndWait') {
      console.log('[Nakama] RoundEndWait detected, waiting for client animations before RoundReady');
    }

    // 判断是否需要立即应用：如果在主棋盘并且有队列积压，我们不能立刻更新
    // 如果不在棋盘内（例如刚登录、还在等待房间里等），可以直接强制执行下一次的 StateSync
    if (
      store.currentScene !== Scene.Board &&
      store.currentScene !== Scene.DiceAssign &&
      useGameStore.getState().stateSyncQueue.length > 0
    ) {
      useGameStore.getState().applyNextStateSync();
      // 这里可以安全地再次获取更新后的状态进行路由
      this.routeSceneByState(useGameStore.getState().globalState);
    } else {
      console.log('[Nakama] 状态同步加入队列，当前队列长度：', useGameStore.getState().stateSyncQueue.length);
    }
  }

  private handleWaitingSync(data: protocol.WaitingSync) {
    const store = useGameStore.getState();
    store.setWaitingSync(data);

    if (store.currentScene !== Scene.Lobby && store.currentScene !== Scene.FactionSelect) {
      store.setScene(Scene.Lobby);
    }

    console.log('[Nakama] 等待同步', {
      playerCount: data.player_count,
      canStart: data.can_start,
    });
  }

  private handleAvailable(data: protocol.Available) {
    const store = useGameStore.getState();
    store.setAvailableActions(data);

    console.log('[Nakama] 可用操作', {
      items: data.items.length,
      canUseSkill: data.can_use_skill,
      diceType: data.dice_type,
    });
  }

  private handleDecisionRequest(data: protocol.Decision) {
    const store = useGameStore.getState();
    store.setDecisionRequest(data);

    console.log('[Nakama] 决策请求', {
      id: data.id,
      prompt: data.prompt,
      options: data.options.length,
    });
  }

  private handleMiniGameStart(data: protocol.MiniGameStart) {
    const store = useGameStore.getState();
    store.setMiniGameStart(data);
    store.setMiniGameResult(null);
    store.setScene(Scene.MiniGameSubmitRank);

    console.log('[Nakama] 小游戏开始', {
      gameType: data.game_type,
      players: data.players.length,
    });
  }

  private handleMiniGameResult(data: protocol.MiniGameResult) {
    const store = useGameStore.getState();
    const diceAssignments: Record<string, string> = {};
    data.rankings.forEach((entry) => {
      if (entry.rank === 1) diceAssignments[entry.player_id] = 'gold';
      else if (entry.rank === 2) diceAssignments[entry.player_id] = 'silver';
      else if (entry.rank === 3) diceAssignments[entry.player_id] = 'copper';
      else diceAssignments[entry.player_id] = 'wood';
    });

    store.setMiniGameResult(data);
    store.setDiceAssignments(diceAssignments);
    store.setMiniGameResultPending(true);

    console.log('[Nakama] 小游戏结果', {
      rankings: data.rankings,
      diceAssignments,
    });
  }

  private handleGameOver(data: protocol.GameOver) {
    const store = useGameStore.getState();
    const isWaitingRoomTermination =
      (store.currentScene === Scene.Lobby || store.currentScene === Scene.FactionSelect) &&
      !data.winner_id &&
      (!data.stats || data.stats.length === 0);

    if (isWaitingRoomTermination) {
      store.setJoinRoomNotice('房主已解散房间');
      store.resetMatchState();
      store.setScene(Scene.JoinRoom);
      console.log('[Nakama] 房间已解散');
      return;
    }

    store.setGameOver(data);

    if (
      store.currentScene === Scene.Board ||
      (store.currentScene === Scene.MiniGameSubmitRank && store.miniGameResultPending)
    ) {
      store.setPendingScene(Scene.GameOver);
    } else {
      store.setPendingScene(null);
      store.setScene(Scene.GameOver);
    }

    console.log('[Nakama] 游戏结束', {
      winner: data.winner_id,
    });
  }

  private handleActionRejected(data: protocol.ActionRejected) {
    if (data.op_code === opcodes.OpKickPlayer && data.error_code === 2003) {
      const store = useGameStore.getState();
      store.setJoinRoomNotice('你已被房主移出房间');
      void this.leaveRoom()
        .catch((error) => {
          console.warn('[Nakama] 被移出后离开房间失败', error);
        })
        .finally(() => {
          const latestStore = useGameStore.getState();
          latestStore.setJoinRoomNotice('你已被房主移出房间');
          latestStore.resetMatchState();
          latestStore.setScene(Scene.JoinRoom);
        });
      console.warn('[Nakama] 已被房主移出房间', data);
      return;
    }

    if (data.op_code === opcodes.OpRollDice && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('board:dice-roll-rejected'));
    }
    console.warn('[Nakama] 动作被拒绝', {
      opCode: data.op_code,
      errorCode: data.error_code,
      reason: data.reason,
      message: data.message,
    });
  }

  private handleFullSync(data: protocol.StateSync) {
    console.log('[Nakama] 完整同步', data);

    // Process as a normal StateSync (entries are full turn data for reconnecting player)
    this.handleStateSync(data);
  }

  private handleStartGameAck(data: protocol.StartGameAck) {
    const store = useGameStore.getState();
    store.setStartGameAck(data);
    store.setMapConfig(data.map_config);
    store.setDefinitions(data.definitions);

    console.log('[Nakama] 游戏开始确认', {
      mapLength: data.map_config.length,
      cells: data.map_config.cells.length,
    });
  }

  /**
   * 4. 场景路由 (对齐 Go CLI)
   */
  routeSceneByState(globalState: string) {
    const store = useGameStore.getState();
    const normalized = globalState.trim();

    // Determine target scene
    let targetScene: Scene | null = null;

    switch (normalized) {
      case 'match_init':
      case 'MatchInit':
        targetScene = Scene.Loading;
        break;
      case 'round_mini_game':
      case 'RoundMiniGame':
        targetScene = Scene.MiniGameSubmitRank;
        break;
      case 'round_prep':
      case 'RoundPrep':
        targetScene = Scene.DiceAssign;
        break;
      case 'turn_loop':
      case 'TurnLoop':
        targetScene = Scene.Board;
        break;
      case 'round_end_wait':
      case 'RoundEndWait':
        targetScene = Scene.Board;
        break;
      case 'boss_battle':
      case 'BossBattle':
        targetScene = Scene.BossBattle;
        break;
      case 'game_over':
      case 'GameOver':
        targetScene = Scene.GameOver;
        break;
      default:
        console.warn(`[Nakama] 未知的全局状态：${globalState}`);
    }

    if (!targetScene) return;
    if (store.gameOver && store.pendingScene === Scene.GameOver && targetScene !== Scene.GameOver) {
      return;
    }

    if (targetScene === Scene.GameOver && store.currentScene === Scene.Board) {
      store.setPendingScene(Scene.GameOver);
      return;
    }

    // If mini-game result is being displayed, defer scene transition
    // until the result display timer clears the pending flag.
    if (store.miniGameResultPending && store.currentScene === Scene.MiniGameSubmitRank) {
      console.log('[Nakama] 小游戏结果展示中，暂缓场景切换', {
        targetScene,
        currentScene: store.currentScene,
      });
      store.setPendingScene(targetScene);
      return;
    }

    store.setPendingScene(null);
    store.setScene(targetScene);
  }

  /**
   * 5. 发送操作 (供 View 层调用)
   * @param opCode 操作码
   * @param payload 数据负载
   */
  async sendOpCode(opCode: number, payload: unknown = {}): Promise<void> {
    const { socket, match } = useGameStore.getState();

    if (!socket || !match) {
      throw new Error('[Nakama] 无法发送消息：socket 或 match 为空');
    }

    console.log(`[Nakama] 发送 OpCode: ${opCode} (${opcodes.getOpCodeName(opCode)})`, payload);

    // nakama-js: sendMatchState 参数 (matchId, opCode, data, presences?, reliable?)
    await socket.sendMatchState(match.match_id, opCode, JSON.stringify(payload));
  }

  /**
   * 5b. List available rooms
   *
   * Queries Nakama for authoritative matches. Uses the `query` parameter
   * with label-based filter syntax to only return "waiting" rooms.
   * Falls back to unfiltered listing if the query doesn't work on this
   * Nakama version, then filters client-side.
   */
  async listRooms(): Promise<Array<{ match_id?: string; label?: string; size?: number; authoritative?: boolean }>> {
    const { session } = useGameStore.getState();
    if (!session) {
      throw new Error('[Nakama] 没有有效的 session');
    }

    // For authoritative matches, the `query` parameter supports label-based
    // filtering with syntax like "+label.status:waiting". The `label` param
    // is for simple string matching on relayed match labels.
    // First try with query filter; if that returns nothing, fall back to
    // unfiltered listing (some Nakama versions/configs may not support
    // label query on authoritative matches).
    let result: Awaited<ReturnType<Client['listMatches']>>;
    try {
      result = await this.client.listMatches(
        session,
        20, // limit
        true, // authoritative
        '', // label (unused for authoritative matches)
        0, // min size: include empty matches
        4, // max size
        '+label.status:waiting +label.game:paradiced', // query filter
      );
    } catch {
      // Fallback: unfiltered listing, filter client-side
      console.log('[Nakama] Label query failed, falling back to unfiltered listing');
      result = await this.client.listMatches(
        session,
        20, // limit
        true, // authoritative
        '', // label
        0, // min size
        4, // max size
      );
    }

    return result.matches || [];
  }

  /**
   * 6. RPC: 创建房间 (注意返回值差异)
   * @param lobbyName 房间名
   * @param maxPlayers 最大玩家数
   */
  async createRoom(lobbyName: string, maxPlayers: number = 4): Promise<Match> {
    const { session, socket } = useGameStore.getState();

    if (!session) {
      throw new Error('[Nakama] 没有有效的 session');
    }

    if (!socket) {
      throw new Error('[Nakama] 没有有效的 socket');
    }

    console.log('[Nakama] 创建房间', { lobbyName, maxPlayers });

    // nakama-js: rpc 返回 RpcResponse { id, payload }
    // rpc 方法签名：rpc(session, id, input: object)
    const rpcResponse = await this.client.rpc(session, 'create_authoritative_room', {
      lobby_name: lobbyName,
      max_players: maxPlayers,
    });

    console.log('[Nakama] RPC 响应', rpcResponse);

    // 重要：服务端返回的是 JSON 编码的字符串 (json.Marshal(matchID))
    // nakama-js 会自动解析 JSON，所以 payload 直接是字符串值
    // 不是对象！不需要 payload.match_id
    const matchId = rpcResponse.payload as unknown as string;

    if (!matchId || typeof matchId !== 'string') {
      console.error('[Nakama] RPC 返回无效的 match_id', rpcResponse);
      throw new Error('[Nakama] RPC 返回无效的 match_id');
    }

    console.log('[Nakama] RPC 响应 - matchId:', matchId);

    // nakama-js: joinMatch 返回 Promise<Match>
    // 关键：携带 display_name metadata，避免服务端 waiting_sync 回退到 user_id
    const joinMetadata = this.buildJoinMetadata();
    const match = await socket.joinMatch(matchId, undefined, joinMetadata);

    useGameStore.getState().setMatch(match);
    useGameStore.getState().setMatchId(match.match_id || matchId);

    console.log('[Nakama] 已加入房间', { matchId: match.match_id });

    return match;
  }

  /**
   * 7. 加入房间
   * @param matchIdOrToken 房间 ID 或 Token
   * @param metadata 元数据
   */
  async joinRoom(matchIdOrToken: string, metadata?: Record<string, string>): Promise<Match> {
    const { socket } = useGameStore.getState();

    if (!socket) {
      throw new Error('[Nakama] 没有有效的 socket');
    }

    const joinMetadata = this.buildJoinMetadata(metadata);

    console.log('[Nakama] 加入房间', { matchIdOrToken, metadata: joinMetadata });

    // nakama-js: joinMatch 支持 match_id 或 token 方式
    // joinMatch(match_id?, token?, metadata?)
    const match = await socket.joinMatch(matchIdOrToken, undefined, joinMetadata);

    useGameStore.getState().setMatch(match);
    useGameStore.getState().setMatchId(match.match_id || matchIdOrToken);

    console.log('[Nakama] 已加入房间', { matchId: match.match_id });

    return match;
  }

  /**
   * 8. 离开房间
   */
  async leaveRoom(): Promise<void> {
    const { socket, match } = useGameStore.getState();

    if (socket && match) {
      console.log('[Nakama] 离开房间', { matchId: match.match_id });
      await socket.leaveMatch(match.match_id);
      useGameStore.getState().setMatch(null);
      useGameStore.getState().setMatchId('');
    }
  }

  /**
   * 9. 开始游戏 (仅房主)
   */
  async sendStartGame(): Promise<void> {
    console.log('[Nakama] 发送开始游戏请求');
    await this.sendOpCode(opcodes.OpStartGame, {});
  }

  /**
   * 9b. 更新等待房间玩家设置
   */
  async sendLobbyPlayerUpdate(faction: string): Promise<void> {
    const { displayName } = useGameStore.getState();
    console.log('[Nakama] 更新等待房间玩家设置', { faction, displayName });
    await this.sendOpCode(opcodes.OpUpdateLobbyPlayer, {
      faction,
      display_name: displayName,
    });
  }

  /**
   * 9c. 房主移出等待房间玩家
   */
  async sendKickPlayer(targetId: string): Promise<void> {
    console.log('[Nakama] 发送移出玩家请求', { targetId });
    await this.sendOpCode(opcodes.OpKickPlayer, { target_id: targetId } satisfies protocol.KickPlayer);
  }

  /**
   * 10. 掷骰子
   */
  async sendRollDice(): Promise<void> {
    console.log('[Nakama] 发送掷骰子请求');
    await this.sendOpCode(opcodes.OpRollDice, {});
  }

  /**
   * 10.5 轮结束就绪信号 (RoundEndWait 动画播放完成后自动发送)
   */
  async sendRoundReady(): Promise<void> {
    console.log('[Nakama] 发送轮结束就绪信号');
    await this.sendOpCode(opcodes.OpRoundReady, {});
  }

  /**
   * 11. 使用道具
   */
  async sendUseItem(itemId: string, targetId?: string): Promise<void> {
    console.log('[Nakama] 发送使用道具请求', { itemId, targetId });
    await this.sendOpCode(opcodes.OpUseItem, { item_id: itemId, target_id: targetId });
  }

  /**
   * 12. 使用技能
   */
  async sendUseSkill(targetId?: string): Promise<void> {
    console.log('[Nakama] 发送使用技能请求', { targetId });
    await this.sendOpCode(opcodes.OpUseSkill, { target_id: targetId });
  }

  /**
   * 13. 提交决策
   */
  async sendUserChoice(decisionId: string, choice: number): Promise<void> {
    console.log('[Nakama] 发送决策选择', { decisionId, choice });
    await this.sendOpCode(opcodes.OpUserChoice, { decision_id: decisionId, choice });
  }

  /**
   * 14. 提交小游戏数据 (服务端计算排名)
   */
  async sendMiniGameDataSubmit(gameType: string, gameData: Record<string, unknown>): Promise<void> {
    console.log('[Nakama] 提交小游戏数据', { gameType, gameData });
    await this.sendOpCode(opcodes.OpMiniGameDataSubmit, {
      game_type: gameType,
      game_data: gameData,
    });
  }
}

// 导出单例实例
export const gameService = new NakamaService();
