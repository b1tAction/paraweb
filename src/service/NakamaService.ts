/**
 * NakamaService - 核心胶水层
 *
 * 封装 @heroiclabs/nakama-js，负责与 Nakama 后端进行交互
 * 实现消息监听、路由和场景切换逻辑
 */

import { Client, Session, Socket, Match, MatchData } from '@heroiclabs/nakama-js';
import { useGameStore, Scene } from '../store/gameStore';
import * as opcodes from '../api/opcodes';
import * as protocol from '../types/protocol';

/**
 * NakamaService 类
 *
 * 单例模式，通过 gameService 导出实例
 */
export class NakamaService {
  private client: Client;
  private serverKey: string = 'defaultkey';
  private host: string = '';
  private port: string = '';
  private useSSL: boolean = false;

  private readonly DEFAULT_HOST: string =
    (import.meta as any).env?.VITE_NAKAMA_HOST ||
    (typeof window !== 'undefined' && window.location?.hostname && window.location.hostname !== 'localhost'
      ? window.location.hostname
      : '127.0.0.1');
  private readonly DEFAULT_PORT: string = (import.meta as any).env?.VITE_NAKAMA_PORT || '7350';
  private readonly DEFAULT_USE_SSL: boolean = String((import.meta as any).env?.VITE_NAKAMA_SSL || 'false').toLowerCase() === 'true';

  // Device ID prefix for username-based authentication
  private readonly DEVICE_ID_PREFIX = 'paradiced_';
  // LocalStorage keys
  private readonly STORAGE_KEY_TOKEN = 'paradiced_session_token';
  private readonly STORAGE_KEY_REFRESH_TOKEN = 'paradiced_refresh_token';
  private readonly STORAGE_KEY_USERNAME = 'paradiced_username';
  private readonly STORAGE_KEY_NAKAMA_HOST = 'paradiced_nakama_host';
  private readonly STORAGE_KEY_NAKAMA_PORT = 'paradiced_nakama_port';
  private readonly STORAGE_KEY_NAKAMA_SSL = 'paradiced_nakama_ssl';

  constructor() {
    this.loadServerConfig();
    // 注意：nakama-js 构造函数参数顺序 (serverkey, host, port, useSSL)
    this.client = new Client(this.serverKey, this.host, this.port, this.useSSL);
  }

  private loadServerConfig() {
    const host = localStorage.getItem(this.STORAGE_KEY_NAKAMA_HOST)?.trim();
    const port = localStorage.getItem(this.STORAGE_KEY_NAKAMA_PORT)?.trim();
    const sslStr = localStorage.getItem(this.STORAGE_KEY_NAKAMA_SSL);

    this.host = host || this.DEFAULT_HOST;
    this.port = port || this.DEFAULT_PORT;
    this.useSSL = sslStr == null ? this.DEFAULT_USE_SSL : sslStr === 'true';
  }

  private rebuildClient() {
    this.client = new Client(this.serverKey, this.host, this.port, this.useSSL);
  }

  getServerConfig(): { host: string; port: string; useSSL: boolean } {
    return { host: this.host, port: this.port, useSSL: this.useSSL };
  }

  setServerConfig(host: string, port: string, useSSL: boolean) {
    const normalizedHost = host.trim();
    const normalizedPort = port.trim();

    if (!normalizedHost) {
      throw new Error('服务器地址不能为空');
    }
    if (!normalizedPort || !/^\d+$/.test(normalizedPort)) {
      throw new Error('端口必须是数字');
    }

    this.host = normalizedHost;
    this.port = normalizedPort;
    this.useSSL = useSSL;

    localStorage.setItem(this.STORAGE_KEY_NAKAMA_HOST, this.host);
    localStorage.setItem(this.STORAGE_KEY_NAKAMA_PORT, this.port);
    localStorage.setItem(this.STORAGE_KEY_NAKAMA_SSL, String(this.useSSL));

    this.rebuildClient();

    console.log('[Nakama] 服务器配置已更新', {
      host: this.host,
      port: this.port,
      useSSL: this.useSSL,
    });
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
      merged.display_name?.trim() ||
      store.displayName?.trim() ||
      store.session?.username?.trim() ||
      '';

    if (candidateDisplayName) {
      merged.display_name = candidateDisplayName;
    }

    const candidateFaction =
      merged.faction?.trim() ||
      store.faction?.trim() ||
      '';

    if (candidateFaction) {
      merged.faction = candidateFaction;
    }

    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  /**
   * 1. Username-only authentication (recommended)
   *
   * Uses Nakama's device authentication with a deterministic deviceId
   * derived from the username. This eliminates the need for passwords
   * and registration - just enter a username and start playing.
   *
   * @param username The display name / nickname to use
   */
  async loginByUsername(username: string): Promise<Session> {
    console.log('[Nakama] 开始认证...', { username });

    // Generate a deterministic deviceId from username
    const deviceId = `${this.DEVICE_ID_PREFIX}${username}`;

    // authenticateDevice: create=true auto-creates account if not exists
    const session = await this.client.authenticateDevice(
      deviceId,
      true,      // create = true, auto-register if not exists
      username   // username as display name
    );

    console.log('[Nakama] 认证成功', {
      userId: session.user_id,
      username: session.username,
    });

    // Save session tokens and username to localStorage (for restore)
    localStorage.setItem(this.STORAGE_KEY_TOKEN, session.token);
    localStorage.setItem(this.STORAGE_KEY_REFRESH_TOKEN, session.refresh_token);
    localStorage.setItem(this.STORAGE_KEY_USERNAME, username);

    // Create and connect socket
    const socket = this.client.createSocket();
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
      username    // username 用作显示名称
    );

    console.log('[Nakama] 认证成功', {
      userId: session.user_id,
      username: session.username,
    });

    // 保存 session token 和 refresh token 到 localStorage (用于恢复登录)
    localStorage.setItem(this.STORAGE_KEY_TOKEN, session.token);
    localStorage.setItem(this.STORAGE_KEY_REFRESH_TOKEN, session.refresh_token);

    // 创建并连接 socket
    const socket = this.client.createSocket();
    await socket.connect(session, false);

    console.log('[Nakama] WebSocket 连接已建立');

    useGameStore.getState().setConnection(session, socket);
    useGameStore.getState().setMyPlayerId(session.user_id || '');
    useGameStore.getState().setDisplayName(username);

    this.setupListeners(socket);

    return session;
  }

  /**
   * 2. 恢复会话 (使用之前保存的 token)
   *
   * 刷新页面时，使用 localStorage 中的 session token 恢复登录状态
   * 避免用户每次都输入密码
   *
   * @returns 成功恢复返回 true，否则返回 false
   */
  async restoreSession(): Promise<boolean> {
    const savedToken = localStorage.getItem(this.STORAGE_KEY_TOKEN);
    const savedRefreshToken = localStorage.getItem(this.STORAGE_KEY_REFRESH_TOKEN);

    if (!savedToken) {
      console.log('[Nakama] 没有找到保存的 session token');
      return false;
    }

    try {
      console.log('[Nakama] 尝试恢复 session...');

      // 使用 Session.restore 从 token 恢复 session
      // 注意：这里我们只用 token，refreshToken 参数传空字符串也可以
      let session = Session.restore(savedToken, savedRefreshToken || '');

      // 检查 token 是否过期
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (session.isexpired(nowSeconds)) {
        console.log('[Nakama] Session 已过期，尝试刷新...');

        // 如果 token 过期了，尝试用 refresh token 刷新
        try {
          session = await this.client.sessionRefresh(session);
          localStorage.setItem(this.STORAGE_KEY_TOKEN, session.token);
          localStorage.setItem(this.STORAGE_KEY_REFRESH_TOKEN, session.refresh_token);
          console.log('[Nakama] Session 刷新成功');
        } catch (refreshError: any) {
          console.log('[Nakama] Session 刷新失败，需要重新登录');
          localStorage.removeItem(this.STORAGE_KEY_TOKEN);
          localStorage.removeItem(this.STORAGE_KEY_REFRESH_TOKEN);
          return false;
        }
      }

      console.log('[Nakama] Session 恢复成功', {
        userId: session.user_id,
        username: session.username,
      });

      // 创建并连接 socket
      const socket = this.client.createSocket();
      await socket.connect(session, false);

      console.log('[Nakama] WebSocket 连接已建立');

      useGameStore.getState().setConnection(session, socket);
      useGameStore.getState().setMyPlayerId(session.user_id || '');
      // Restore displayName from saved username (more reliable than session.username)
      const savedUsername = localStorage.getItem(this.STORAGE_KEY_USERNAME);
      useGameStore.getState().setDisplayName(savedUsername || session.username || 'Unknown');

      this.setupListeners(socket);

      return true;

    } catch (error: any) {
      console.error('[Nakama] Session 恢复失败', error.message);
      localStorage.removeItem(this.STORAGE_KEY_TOKEN);
      localStorage.removeItem(this.STORAGE_KEY_REFRESH_TOKEN);
      return false;
    }
  }

  /**
   * 3. 登出
   *
   * 清除 localStorage 中的 token 并断开连接
   */
  async logout(): Promise<void> {
    localStorage.removeItem(this.STORAGE_KEY_TOKEN);
    localStorage.removeItem(this.STORAGE_KEY_REFRESH_TOKEN);
    localStorage.removeItem(this.STORAGE_KEY_USERNAME);

    const { socket, match } = useGameStore.getState();

    if (match && socket) {
      await socket.leaveMatch(match.match_id);
    }

    useGameStore.getState().reset();
    console.log('[Nakama] 已登出');
  }

  /**
   * 4. 设备认证 (保留用于兼容)
   * @deprecated 请使用 loginWithPassword 代替
   */
  async connect(deviceId: string, displayName: string): Promise<Session> {
    console.log('[Nakama] 开始连接...', { deviceId, displayName });

    // nakama-js: authenticateDevice 直接返回 Session
    const session = await this.client.authenticateDevice(
      deviceId,
      true, // create = true, 如果用户不存在则创建
      displayName // username 用作显示名称
    );

    console.log('[Nakama] 认证成功', {
      userId: session.user_id,
      username: session.username,
    });

    // nakama-js: createSocket() 返回 Socket
    const socket = this.client.createSocket();

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
      const data = matchData.data
        ? JSON.parse(new TextDecoder().decode(matchData.data))
        : {};

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

    if (store.currentScene !== Scene.Lobby) {
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
    store.setGameOver(data);

    if (store.currentScene === Scene.Board || (store.currentScene === Scene.MiniGameSubmitRank && store.miniGameResultPending)) {
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
  private routeSceneByState(globalState: string) {
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
  async sendOpCode(opCode: number, payload: any = {}): Promise<void> {
    const { socket, match } = useGameStore.getState();

    if (!socket || !match) {
      throw new Error('[Nakama] 无法发送消息：socket 或 match 为空');
    }

    console.log(`[Nakama] 发送 OpCode: ${opCode} (${opcodes.getOpCodeName(opCode)})`, payload);

    // nakama-js: sendMatchState 参数 (matchId, opCode, data, presences?, reliable?)
    await socket.sendMatchState(match.match_id, opCode, JSON.stringify(payload));
  }

  /**
   * 6. RPC: 创建房间 (注意返回值差异)
   * @param faction 阵营
   * @param maxPlayers 最大玩家数
   */
  async createRoom(faction: string, maxPlayers: number): Promise<Match> {
    const { session, socket } = useGameStore.getState();

    if (!session) {
      throw new Error('[Nakama] 没有有效的 session');
    }

    console.log('[Nakama] 创建房间', { faction, maxPlayers });

    // nakama-js: rpc 返回 RpcResponse { id, payload }
    // rpc 方法签名：rpc(session, id, input: object)
    const rpcResponse = await this.client.rpc(session, 'create_authoritative_room', {
      faction,
      maxPlayers,
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
    const match = await socket!.joinMatch(matchId, undefined, joinMetadata);

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
  async sendUseSkill(): Promise<void> {
    console.log('[Nakama] 发送使用技能请求');
    await this.sendOpCode(opcodes.OpUseSkill, {});
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
  async sendMiniGameDataSubmit(gameType: string, gameData: Record<string, any>): Promise<void> {
    console.log('[Nakama] 提交小游戏数据', { gameType, gameData });
    await this.sendOpCode(opcodes.OpMiniGameDataSubmit, {
      game_type: gameType,
      game_data: gameData,
    });
  }
}

// 导出单例实例
export const gameService = new NakamaService();
