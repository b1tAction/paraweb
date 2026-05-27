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
  rank: number;
}

/**
 * DilemmaRaceRoomState - simplified view type for React component rendering.
 * Derived from raw Colyseus state during state bridging.
 * Maps to the server-side DilemmaRaceRoom GameState schema:
 *   phase: string (choosing/resolving/finished)
 *   round: number
 *   roundTimer: number (seconds per round)
 *   players: MapSchema<PlayerState> with playerId, position, choice, blocked, finished
 */
export interface DilemmaRaceRoomState {
  phase: 'choosing' | 'resolving' | 'finished';
  currentRound: number;
  timeLeft: number;
  trackLength: number; // always 15
  players: DilemmaRacePlayer[];
}

export interface ColyseusJoinContext {
  playerId?: string;
  players?: string[];
}

// ========== Raw state types (from Colyseus handshake reflection) ==========

/**
 * Raw player state from Colyseus Schema deserialization.
 * Property names match server-side PlayerState schema annotations.
 */
interface RawPlayerState {
  playerId: string;
  position: number;
  choice: number;
  blocked: boolean;
  finished: boolean;
  rank: number;
}

/**
 * Raw game state from Colyseus Schema deserialization.
 * Property names match server-side GameState schema annotations.
 * players is a MapSchema-like object (iterable via forEach/entries/values).
 */
interface RawGameState {
  phase: string;
  round: number;
  roundTimer: number;
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

  // State change callback - set by the React component to trigger re-renders
  private onStateChange: ((state: DilemmaRaceRoomState) => void) | null = null;
  private onError: ((error: Error) => void) | null = null;
  private onLeave: ((code: number) => void) | null = null;

  /**
   * Join or create a Colyseus room using connection info from MiniGameStart message.
   * Uses joinOrCreate (WebSocket/matchmaker mode) instead of joinById (REST mode).
   * The first client to call joinOrCreate triggers room creation on the Colyseus server.
   * Subsequent clients with the same minigame_instance_id are routed to the same room.
   *
   * No rootSchema is provided - the client auto-decodes via handshake reflection.
   */
  async joinRoom(conn: MiniGameConn, context?: ColyseusJoinContext): Promise<void> {
    const generation = ++this.joinGeneration;

    // Clean up any existing connection first
    await this.disconnectRoom();
    if (generation !== this.joinGeneration) {
      return;
    }

    // Create client pointing to the Colyseus server URL
    this.client = new Client(conn.url);

    // Get current player info for auth
    const store = useGameStore.getState();
    const myPlayerId = context?.playerId ?? store.myPlayerId ?? '';
    const myToken = conn.player_tokens?.[myPlayerId] || conn.token || '';

    // Build join options for Colyseus onAuth verification
    const options: Record<string, unknown> = {
      player_id: myPlayerId,
      nakama_match_id: conn.nakama_match_id,
      minigame_instance_id: conn.minigame_instance_id,
      token: myToken,
    };

    options.players = context?.players ?? store.miniGameStart?.players;

    try {
      // joinOrCreate: creates room if none exists with matching filterBy key,
      // otherwise joins the existing room. filterBy key is minigame_instance_id.
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
   * Called inside onStateChange callback to provide clean data to the component.
   */
  private bridgeState(rawState: RawGameState): DilemmaRaceRoomState {
    const playerArray: DilemmaRacePlayer[] = [];

    rawState.players.forEach((playerState: RawPlayerState) => {
      playerArray.push({
        id: playerState.playerId,
        position: playerState.position,
        choice: playerState.choice,
        isBlocked: playerState.blocked,
        isFinished: playerState.finished,
        rank: playerState.rank,
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
    onStateChange: (state: DilemmaRaceRoomState) => void,
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
  getCurrentState(): DilemmaRaceRoomState | null {
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
