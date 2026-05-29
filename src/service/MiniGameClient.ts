/**
 * MiniGameClient - Independent Nakama client for MiniGameBoard quadrant.
 *
 * Each quadrant of the MiniGameBoard page runs its own MiniGameClient instance,
 * with an independent Nakama session, WebSocket connection, and Zustand store.
 * This allows four quadrants to simulate four real clients joining the same
 * match and participating in the same mini-game round.
 */

import { Client, type Match, type MatchData, type Session, type Socket } from '@heroiclabs/nakama-js';
import { create } from 'zustand';
import * as opcodes from '../api/opcodes';
import type { MiniGameResult, MiniGameStart } from '../types/protocol';
import { getNakamaSdkPort, parseNakamaEndpoint } from '../utils/nakamaEndpoint';

// Simplified store for MiniGame quadrant — only tracks mini-game relevant state
interface MiniGameQuadrantState {
  myPlayerId: string;
  displayName: string;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  errorMessage: string;
  matchId: string;
  miniGameStart: MiniGameStart | null;
  miniGameResult: MiniGameResult | null;
  diceAssignments: Record<string, string>;
  isSubmitting: boolean;
  submitted: boolean;
  submitError: string;
}

const initialQuadrantState: MiniGameQuadrantState = {
  myPlayerId: '',
  displayName: '',
  connectionStatus: 'disconnected',
  errorMessage: '',
  matchId: '',
  miniGameStart: null,
  miniGameResult: null,
  diceAssignments: {},
  isSubmitting: false,
  submitted: false,
  submitError: '',
};

export type MiniGameQuadrantStore = ReturnType<typeof createMiniGameQuadrantStore>;

function createMiniGameQuadrantStore() {
  return create<MiniGameQuadrantState>(() => ({ ...initialQuadrantState }));
}

export class MiniGameClient {
  private client: Client;
  private session: Session | null = null;
  private socket: Socket | null = null;
  private store: MiniGameQuadrantStore;
  private quadrantIndex: number;
  private endpoint: ReturnType<typeof parseNakamaEndpoint>;

  static readonly SERVER_KEY = 'defaultkey';
  static readonly DEVICE_ID_PREFIX = 'testbot_';
  static readonly DEVICE_ID_STORAGE_PREFIX = 'paradiced_minigame_device_id_';
  static readonly DISPLAY_NAMES = ['青龙侠', '朱雀女', '白虎将', '玄武守'];

  constructor(quadrantIndex: number, endpointInput: string) {
    this.quadrantIndex = quadrantIndex;
    this.endpoint = parseNakamaEndpoint(endpointInput);
    this.client = new Client(
      MiniGameClient.SERVER_KEY,
      this.endpoint.host,
      getNakamaSdkPort(this.endpoint),
      this.endpoint.useSSL,
    );
    this.store = createMiniGameQuadrantStore();
  }

  /** Get the Zustand store for this quadrant */
  getStore(): MiniGameQuadrantStore {
    return this.store;
  }

  /** Get the quadrant index (0-3) */
  getQuadrantIndex(): number {
    return this.quadrantIndex;
  }

  private getOrCreateDeviceId(): string {
    const storageKey = `${MiniGameClient.DEVICE_ID_STORAGE_PREFIX}${this.quadrantIndex}`;
    const storedDeviceId = localStorage.getItem(storageKey);
    if (storedDeviceId) return storedDeviceId;

    const suffix = crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const deviceId = `${MiniGameClient.DEVICE_ID_PREFIX}${this.quadrantIndex}_${suffix}`;
    localStorage.setItem(storageKey, deviceId);
    return deviceId;
  }

  private async getErrorMessage(error: unknown): Promise<string> {
    if (error instanceof Response) {
      let responseBody = '';
      try {
        responseBody = await error.clone().text();
      } catch {
        responseBody = '';
      }

      const detail = responseBody ? `: ${responseBody}` : '';
      return `HTTP ${error.status} ${error.statusText || 'Request failed'}${detail}`;
    }

    return error instanceof Error ? error.message : String(error);
  }

  /** Auto-authenticate with a stable test device account and connect WebSocket */
  async connect(): Promise<void> {
    if (this.session && this.socket && this.store.getState().connectionStatus === 'connected') {
      return;
    }

    this.store.setState({ connectionStatus: 'connecting', errorMessage: '' });

    const deviceId = this.getOrCreateDeviceId();
    const displayName = MiniGameClient.DISPLAY_NAMES[this.quadrantIndex] || `TestBot${this.quadrantIndex}`;

    try {
      this.session = await this.client.authenticateDevice(
        deviceId,
        true,
        deviceId,
      );

      await this.client.updateAccount(this.session, { display_name: displayName });

      // Create and connect socket
      const socket = this.client.createSocket(this.endpoint.useSSL);
      await socket.connect(this.session, false);
      this.socket = socket;

      // Update store
      this.store.setState({
        myPlayerId: this.session.user_id || '',
        displayName,
        connectionStatus: 'connected',
      });

      // Setup match data listeners
      this.setupListeners(socket);

      console.log(`[MiniGameClient ${this.quadrantIndex}] Connected as ${displayName} (${this.session.user_id})`);
    } catch (error) {
      const message = await this.getErrorMessage(error);
      this.store.setState({ connectionStatus: 'error', errorMessage: message });
      console.error(`[MiniGameClient ${this.quadrantIndex}] Connection failed:`, message);
      throw new Error(message);
    }
  }

  /** Create an authoritative match room via RPC */
  async createRoom(lobbyName: string, maxPlayers: number = 4): Promise<string> {
    if (!this.session) throw new Error('Not connected');

    const rpcResponse = await this.client.rpc(this.session, 'create_authoritative_room', {
      lobby_name: lobbyName,
      max_players: maxPlayers,
    });

    const matchId = rpcResponse.payload as unknown as string;
    console.log(`[MiniGameClient ${this.quadrantIndex}] Created room: ${matchId}`);

    return matchId;
  }

  /** Join an existing match */
  async joinMatch(matchId: string): Promise<Match> {
    if (!this.socket) throw new Error('Not connected');

    const factionMap = ['qing_long', 'zhu_que', 'bai_hu', 'xuan_wu'];
    const metadata = {
      display_name: this.store.getState().displayName,
      faction: factionMap[this.quadrantIndex],
    };

    const match = await this.socket.joinMatch(matchId, undefined, metadata);
    this.store.setState({ matchId: match.match_id || matchId });

    console.log(`[MiniGameClient ${this.quadrantIndex}] Joined match: ${matchId}`);
    return match;
  }

  /** Submit mini-game data via WebSocket */
  async submitMiniGameData(gameType: string, gameData: Record<string, unknown>): Promise<void> {
    if (!this.socket || !this.store.getState().matchId) {
      throw new Error('Not in a match');
    }

    this.store.setState({ isSubmitting: true, submitError: '' });

    try {
      // nakama-js: sendMatchState(matchId, opCode, data, presences?, reliable?)
      await this.socket.sendMatchState(
        this.store.getState().matchId,
        opcodes.OpMiniGameDataSubmit,
        JSON.stringify({
          op_code: 'mini_game_data_submit',
          game_type: gameType,
          game_data: gameData,
        }),
      );

      this.store.setState({ isSubmitting: false, submitted: true });
      console.log(`[MiniGameClient ${this.quadrantIndex}] Submitted mini-game data for ${gameType}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.setState({ isSubmitting: false, submitError: message });
      console.error(`[MiniGameClient ${this.quadrantIndex}] Submit failed:`, message);
      throw error;
    }
  }

  /** Send start game signal */
  async sendStartGame(): Promise<void> {
    if (!this.socket || !this.store.getState().matchId) {
      throw new Error('Not in a match');
    }

    // nakama-js: sendMatchState(matchId, opCode, data)
    await this.socket.sendMatchState(
      this.store.getState().matchId,
      opcodes.OpStartGame,
      JSON.stringify({ op_code: 'start_game' }),
    );

    console.log(`[MiniGameClient ${this.quadrantIndex}] Sent start game`);
  }

  /** Trigger mini-game via RPC */
  async triggerMiniGame(gameType: string): Promise<void> {
    if (!this.session || !this.store.getState().matchId) {
      throw new Error('Not in a match');
    }

    await this.client.rpc(this.session, 'minigame_request', {
      mode: 'online',
      match_id: this.store.getState().matchId,
      game_type: gameType,
    });

    console.log(`[MiniGameClient ${this.quadrantIndex}] Triggered ${gameType} via RPC`);
  }

  /** Setup WebSocket match data listener */
  private setupListeners(socket: Socket): void {
    socket.onmatchdata = (matchData: MatchData) => {
      const data = matchData.data ? JSON.parse(new TextDecoder().decode(matchData.data)) : {};

      console.log(
        `[MiniGameClient ${this.quadrantIndex}] OpCode: ${matchData.op_code} (${opcodes.getOpCodeName(matchData.op_code)})`,
        data,
      );

      switch (matchData.op_code) {
        case opcodes.OpMiniGameStart:
          this.handleMiniGameStart(data);
          break;
        case opcodes.OpMiniGameResult:
          this.handleMiniGameResult(data);
          break;
        case opcodes.OpStateSync:
          // Minimal handling — not needed for mini-game test
          break;
      }
    };
  }

  private handleMiniGameStart(data: MiniGameStart): void {
    this.store.setState({
      miniGameStart: data,
      miniGameResult: null,
      submitted: false,
      submitError: '',
      isSubmitting: false,
    });

    console.log(`[MiniGameClient ${this.quadrantIndex}] MiniGameStart:`, data.game_type);
  }

  private handleMiniGameResult(data: MiniGameResult & { dice_assignments?: Record<string, string> }): void {
    // dice_assignments comes in StateSync, but may also be bundled with MiniGameResult
    // in some server configurations. Handle both cases.
    this.store.setState({
      miniGameResult: data,
      diceAssignments: data.dice_assignments || {},
    });

    console.log(`[MiniGameClient ${this.quadrantIndex}] MiniGameResult received`);
  }

  /** Disconnect and cleanup */
  async disconnect(): Promise<void> {
    if (this.socket) {
      const socket = this.socket;
      try {
        const currentMatchId = this.store.getState().matchId;
        if (currentMatchId) {
          await socket.leaveMatch(currentMatchId);
        }
      } catch {
        // Swallow cleanup errors
      } finally {
        socket.disconnect(false);
      }
      this.socket = null;
    }

    this.session = null;
    this.store.setState({ ...initialQuadrantState });
    console.log(`[MiniGameClient ${this.quadrantIndex}] Disconnected`);
  }

  /** Reset for a new mini-game round */
  resetForNewRound(): void {
    this.store.setState({
      miniGameStart: null,
      miniGameResult: null,
      diceAssignments: {},
      isSubmitting: false,
      submitted: false,
      submitError: '',
    });
  }
}
