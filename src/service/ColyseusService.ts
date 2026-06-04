/**
 * ColyseusService - Transient Colyseus connection manager
 *
 * Manages short-lived Colyseus WebSocket connections for online mini-games.
 * Unlike NakamaService (which persists for the entire game session),
 * ColyseusService connections are created per mini-game round and
 * cleaned up when the round ends.
 *
 * Architecture: callback-driven state bridging to React rendering.
 * Colyseus state is transient (only exists during mini-game round),
 * so it's NOT stored in the global Zustand store. Instead, the
 * DilemmaRace component registers callbacks and uses useState to
 * bridge Colyseus state changes into React's render cycle.
 *
 * Schema approach: the client does NOT register @colyseus/schema types
 * (which require experimentalDecorators incompatible with our tsconfig).
 * Instead, the Colyseus client auto-decodes state from the server's
 * handshake reflection. We bridge the decoded state to our own typed
 * interfaces for React rendering.
 */

import { Client, type Room } from 'colyseus.js';
import { useGameStore } from '../store/gameStore';
import type { MiniGameConn } from '../types/protocol';

// ========== Client-side view types ==========

/**
 * DilemmaRacePlayer - simplified view type for React component rendering.
 * Derived from raw Colyseus state during state bridging.
 */
export interface DilemmaRacePlayer {
  id: string;
  position: number;
  choice: number; // 0=unset, 1/3/5=chosen
  isBlocked: boolean;
  isFinished: boolean;
}

/**
 * DilemmaRaceRoomState - simplified view type for React component rendering.
 * Derived from raw Colyseus state during state bridging.
 */
export interface DilemmaRaceRoomState {
  phase: 'choosing' | 'resolving' | 'finished';
  currentRound: number;
  timeLeft: number;
  trackLength: number; // always 15
  players: DilemmaRacePlayer[];
}

/**
 * TrustDilemmaPlayer - simplified view type for React component rendering.
 */
export interface TrustDilemmaPlayer {
  id: string;
  choice: number; // 0=unset, 1=C, 2=D
  score: number;
  roundScore: number;
  isReady: boolean;
  rank: number;
}

/**
 * TrustDilemmaRoomState - simplified view type for React component rendering.
 */
export interface TrustDilemmaRoomState {
  phase: 'rules' | 'choosing' | 'resolving' | 'finished';
  currentRound: number;
  timeLeft: number;
  players: TrustDilemmaPlayer[];
}

/**
 * CakeCuttingPlayer - simplified view type for React component rendering.
 */
export interface CakeCuttingPlayer {
  id: string;
  isReady: boolean;
  isAlive: boolean;
  eliminatedRound: number;
  rank: number;
}

/**
 * CakeCuttingRoomState - simplified view type for React component rendering.
 */
export interface CakeCuttingRoomState {
  phase: 'rules' | 'playing' | 'resolving_cut' | 'finished';
  timeLeft: number;
  cakeStart: number;
  cakeEnd: number;
  activePlayerId: string;
  cutPosition: number;
  players: CakeCuttingPlayer[];
}

/**
 * TypingSpeedPlayer - simplified view type for React component rendering.
 */
export interface TypingSpeedPlayer {
  id: string;
  typedCount: number;
  progressPercent: number;
  finishTimeMs: number;
  rank: number;
}

/**
 * TypingSpeedRoomState - simplified view type for React component rendering.
 */
export interface TypingSpeedRoomState {
  phase: 'rules' | 'countdown' | 'playing' | 'finished';
  timeLeft: number;
  targetText: string;
  players: TypingSpeedPlayer[];
}

// ========== Raw state types (from Colyseus handshake reflection) ==========

/**
 * Raw player state from Colyseus Schema deserialization.
 */
interface RawPlayerState {
  playerId: string;
  position?: number;
  choice: number;
  blocked?: boolean;
  finished?: boolean;
  score?: number;
  roundScore?: number;
  isReady?: boolean;
  rank?: number;
  isAlive?: boolean;
  eliminatedRound?: number;
  typedCount?: number;
  progressPercent?: number;
  finishTimeMs?: number;
}

/**
 * Raw game state from Colyseus Schema deserialization.
 */
interface RawGameState {
  phase: string;
  round: number;
  roundTimer: number;
  cakeStart?: number;
  cakeEnd?: number;
  activePlayerId?: string;
  cutPosition?: number;
  targetText?: string;
  players: {
    forEach: (cb: (value: RawPlayerState, key: string) => void) => void;
    entries: () => IterableIterator<[string, RawPlayerState]>;
    values: () => IterableIterator<RawPlayerState>;
  };
}

// ========== Service Class ==========

export class ColyseusService {
  private client: Client | null = null;
  private room: Room | null = null;
  private joinGeneration = 0;
  private roomName = '';

  // State change callback - set by the React component to trigger re-renders
  private onStateChange: ((state: any) => void) | null = null;
  private onError: ((error: Error) => void) | null = null;
  private onLeave: ((code: number) => void) | null = null;

  /**
   * Join or create a Colyseus room using connection info from MiniGameStart message.
   */
  async joinRoom(conn: MiniGameConn, debugOptions?: { playerId?: string; players?: string[] }): Promise<void> {
    const generation = ++this.joinGeneration;

    // Clean up any existing connection first
    await this.disconnectRoom();
    if (generation !== this.joinGeneration) {
      return;
    }

    this.roomName = conn.room_name;

    // Create client pointing to the Colyseus server URL
    this.client = new Client(conn.url);

    // Get current player info for auth
    const store = useGameStore.getState();
    const myPlayerId = debugOptions?.playerId || store.myPlayerId || store.session?.user_id || '';
    const myToken = conn.player_tokens?.[myPlayerId] || conn.token || '';

    if (!myPlayerId || !myToken || !conn.minigame_instance_id) {
      const error = new Error('[Colyseus] Missing mini-game auth fields');
      console.error('[Colyseus] Cannot join room: missing auth fields', {
        roomName: conn.room_name,
        hasPlayerId: Boolean(myPlayerId),
        hasToken: Boolean(myToken),
        hasMiniGameInstanceId: Boolean(conn.minigame_instance_id),
        tokenPlayerIds: Object.keys(conn.player_tokens || {}),
      });
      if (this.onError) {
        this.onError(error);
      }
      return;
    }

    // Build join options for Colyseus onAuth verification
    const options: Record<string, unknown> = {
      player_id: myPlayerId,
      nakama_match_id: conn.nakama_match_id,
      minigame_instance_id: conn.minigame_instance_id,
      token: myToken,
    };

    const playerList =
      debugOptions?.players && debugOptions.players.length > 0 ? debugOptions.players : store.miniGameStart?.players;
    if (playerList && playerList.length > 0) {
      options.players = playerList;
    }

    try {
      const room = await this.client.joinOrCreate(conn.room_name, options);
      if (generation !== this.joinGeneration) {
        await room.leave().catch(() => undefined);
        return;
      }

      this.room = room;

      this.setupRoomListeners(room);
      console.log('[Colyseus] Joined/created room', conn.room_name, this.room.roomId);
    } catch (error) {
      if (generation !== this.joinGeneration) {
        return;
      }

      console.error('[Colyseus] Failed to join/create room', error);
      this.room = null;
      if (this.onError) {
        this.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * Convert raw Colyseus decoded state to simplified view type for React.
   */
  private bridgeState(rawState: RawGameState): DilemmaRaceRoomState | TrustDilemmaRoomState | CakeCuttingRoomState | TypingSpeedRoomState {
    if (this.roomName === 'trust_dilemma') {
      const playerArray: TrustDilemmaPlayer[] = [];

      rawState.players.forEach((playerState: RawPlayerState) => {
        playerArray.push({
          id: playerState.playerId,
          choice: playerState.choice,
          score: playerState.score || 0,
          roundScore: playerState.roundScore || 0,
          isReady: playerState.isReady || false,
          rank: playerState.rank || 0,
        });
      });

      return {
        phase: rawState.phase as TrustDilemmaRoomState['phase'],
        currentRound: rawState.round,
        timeLeft: rawState.roundTimer,
        players: playerArray,
      };
    } else if (this.roomName === 'cake_cutting') {
      const playerArray: CakeCuttingPlayer[] = [];

      rawState.players.forEach((playerState: RawPlayerState) => {
        playerArray.push({
          id: playerState.playerId,
          isReady: playerState.isReady || false,
          isAlive: playerState.isAlive !== false,
          eliminatedRound: playerState.eliminatedRound || 0,
          rank: playerState.rank || 0,
        });
      });

      return {
        phase: rawState.phase as CakeCuttingRoomState['phase'],
        timeLeft: rawState.roundTimer,
        cakeStart: rawState.cakeStart ?? 0,
        cakeEnd: rawState.cakeEnd ?? 100,
        activePlayerId: rawState.activePlayerId || '',
        cutPosition: rawState.cutPosition ?? -1,
        players: playerArray,
      };
    } else if (this.roomName === 'typing_speed') {
      const playerArray: TypingSpeedPlayer[] = [];

      rawState.players.forEach((playerState: RawPlayerState) => {
        playerArray.push({
          id: playerState.playerId,
          typedCount: playerState.typedCount || 0,
          progressPercent: playerState.progressPercent || 0,
          finishTimeMs: playerState.finishTimeMs || 0,
          rank: playerState.rank || 0,
        });
      });

      return {
        phase: rawState.phase as TypingSpeedRoomState['phase'],
        timeLeft: rawState.roundTimer,
        targetText: rawState.targetText || '',
        players: playerArray,
      };
    } else {
      const playerArray: DilemmaRacePlayer[] = [];

      rawState.players.forEach((playerState: RawPlayerState) => {
        playerArray.push({
          id: playerState.playerId,
          position: playerState.position || 1,
          choice: playerState.choice,
          isBlocked: playerState.blocked || false,
          isFinished: playerState.finished || false,
        });
      });

      return {
        phase: rawState.phase as DilemmaRaceRoomState['phase'],
        currentRound: rawState.round,
        timeLeft: rawState.roundTimer,
        trackLength: 15,
        players: playerArray,
      };
    }
  }

  private setupRoomListeners(room: Room): void {
    if (this.room !== room) return;

    // State change listener - core mechanism for React rendering
    // Colyseus Schema changes trigger this callback
    room.onStateChange((state: RawGameState) => {
      if (this.room !== room) return;
      if (this.onStateChange) {
        this.onStateChange(this.bridgeState(state));
      }
    });

    // On error
    room.onError((code: number, message?: string) => {
      if (this.room !== room) return;
      console.error('[Colyseus] Room error', { code, message });
      if (this.onError) {
        this.onError(new Error(`Room error ${code}: ${message || 'unknown'}`));
      }
    });

    // On leave (server kicked, connection dropped, etc.)
    room.onLeave((code: number) => {
      if (this.room !== room) return;
      console.log('[Colyseus] Left room', { code });
      this.room = null;
      if (this.onLeave) {
        this.onLeave(code);
      }
    });

    // Bridge initial state that was applied during the handshake.
    // onStateChange won't retroactively fire for state already applied,
    // so we manually trigger the callback to ensure the frontend
    // transitions from 'connecting' to the actual game phase.
    if (room.state && this.room === room && this.onStateChange) {
      this.onStateChange(this.bridgeState(room.state as RawGameState));
    }
  }

  /**
   * Send a step choice to the Colyseus room.
   * Called by the DilemmaRace component when the player selects 1, 3, or 5.
   */
  sendChoice(step: number): void {
    if (!this.room) {
      console.warn('[Colyseus] Cannot send choice: not in a room');
      return;
    }
    this.room.send('choice', { choice: step });
    console.log('[Colyseus] Sent choice', { step });
  }

  /**
   * Send a rules confirmation to the Colyseus room.
   */
  sendConfirmRules(): void {
    if (!this.room) {
      console.warn('[Colyseus] Cannot send confirm_rules: not in a room');
      return;
    }
    this.room.send('confirm_rules');
    console.log('[Colyseus] Sent confirm_rules');
  }

  /**
   * Send a cut cake position to the Colyseus room.
   */
  sendCutCake(pos: number): void {
    if (!this.room) {
      console.warn('[Colyseus] Cannot send cut_cake: not in a room');
      return;
    }
    this.room.send('cut_cake', { pos });
    console.log('[Colyseus] Sent cut_cake', { pos });
  }

  /**
   * Send typed character count progress to the Colyseus room.
   */
  sendTypingProgress(typedCount: number): void {
    if (!this.room) {
      console.warn('[Colyseus] Cannot send submit_progress: not in a room');
      return;
    }
    this.room.send('submit_progress', { typedCount });
  }

  /**
   * Leave the Colyseus room. Called when mini-game ends or component unmounts.
   */
  async leaveRoom(): Promise<void> {
    const generation = ++this.joinGeneration;
    await this.disconnectRoom();
    if (generation === this.joinGeneration) {
      this.onStateChange = null;
      this.onError = null;
      this.onLeave = null;
    }
  }

  private async disconnectRoom(): Promise<void> {
    const room = this.room;
    if (room) {
      if (this.room === room) {
        this.room = null;
      }
      try {
        await room.leave();
      } catch {
        // Swallow errors on cleanup - the room connection may already be dead
      }
      if (this.room === room) {
        this.room = null;
      }
    }
    console.log('[Colyseus] Room cleaned up');
  }

  /**
   * Register callbacks for the React component to receive updates.
   * These are set once per component mount lifecycle.
   */
  setCallbacks(
    onStateChange: (state: any) => void,
    onError: (error: Error) => void,
    onLeave: (code: number) => void,
  ): void {
    this.onStateChange = onStateChange;
    this.onError = onError;
    this.onLeave = onLeave;
  }

  /**
   * Get current room state snapshot (for initial render after joining).
   */
  getCurrentState(): any {
    if (!this.room?.state) return null;
    return this.bridgeState(this.room.state as RawGameState);
  }

  /**
   * Whether currently connected to a Colyseus room.
   */
  isConnected(): boolean {
    return this.room !== null;
  }
}

// Export singleton instance
export const colyseusService = new ColyseusService();
