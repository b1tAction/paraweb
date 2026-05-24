/**
 * DilemmaRaceMiniGame - Real-time online mini-game component
 *
 * Renders a 15-cell track with player positions, choice buttons (1/3/5),
 * countdown timer, and round resolution display. All state comes from
 * Colyseus room state sync. Choices are sent to the Colyseus room.
 * The result arrives via Nakama OpMiniGameResult (not from this component).
 *
 * Game rules:
 * - 15-cell track, players start at position 1
 * - Each round: 10 seconds to choose step size (1/3/5)
 * - If >=2 players choose same step, they are blocked (can't move)
 * - First to reach position 15 wins
 */

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DilemmaRacePlayer, DilemmaRaceRoomState } from '../../service/ColyseusService';
import { colyseusService } from '../../service/ColyseusService';
import { useGameStore } from '../../store/gameStore';
import type { MiniGameConn } from '../../types/protocol';
import { getDisambiguatedDisplayName } from '../../utils/displayName';
import { dilemmaRaceStyles as styles } from './DilemmaRaceStyles';

// ========== Props ==========

export interface DilemmaRaceMiniGameProps {
  connection: MiniGameConn;
  isParticipant: boolean;
}

// ========== Phase type ==========

type LocalPhase = 'connecting' | 'choosing' | 'resolving' | 'finished' | 'error';

// ========== Track Sub-Component ==========

interface TrackProps {
  players: DilemmaRacePlayer[];
  trackLength: number;
  myPlayerId: string;
  getPlayerDisplayName: (id: string) => string;
}

const DilemmaRaceTrack: React.FC<TrackProps> = ({ players, trackLength, myPlayerId, getPlayerDisplayName }) => {
  // Generate cells 1 through trackLength
  const cells = Array.from({ length: trackLength }, (_, i) => i + 1);

  // Map each cell to players at that position
  const playersAtCell = (cellIndex: number) => players.filter((p) => p.position === cellIndex);

  return (
    <div style={styles.trackGrid}>
      {/* Start marker */}
      <div style={styles.startCell}>START</div>

      {/* Track cells */}
      {cells.map((cellIndex) => {
        const playersHere = playersAtCell(cellIndex);
        const isFinish = cellIndex === trackLength;

        return (
          <div
            key={cellIndex}
            style={{
              ...styles.cell,
              ...(isFinish ? styles.finishCell : {}),
            }}
          >
            <span style={styles.cellNumber}>{cellIndex}</span>
            {playersHere.map((p) => (
              <span key={p.id} style={p.id === myPlayerId ? styles.playerMarkerMe : styles.playerMarkerOther}>
                {getPlayerDisplayName(p.id).charAt(0)}
                {p.isBlocked && <span style={styles.blockedIcon}>!</span>}
                {p.isFinished && <span style={styles.finishedIcon}>*</span>}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
};

// ========== Main Component ==========

export const DilemmaRaceMiniGame: React.FC<DilemmaRaceMiniGameProps> = ({ connection, isParticipant }) => {
  const { players, myPlayerId } = useGameStore();

  // Local render state - bridging Colyseus callbacks to React re-renders
  const [phase, setPhase] = useState<LocalPhase>('connecting');
  const [roomState, setRoomState] = useState<DilemmaRaceRoomState | null>(null);
  const [error, setError] = useState<string>('');
  const [myChoice, setMyChoice] = useState<number | null>(null);

  // Track previous round to detect round transitions and reset myChoice
  const prevRoundRef = useRef<number>(0);

  // ========== Colyseus connection lifecycle ==========

  useEffect(() => {
    if (!isParticipant) return;

    // Register callbacks BEFORE joining, so we don't miss initial state
    colyseusService.setCallbacks(
      (state: DilemmaRaceRoomState) => {
        setRoomState(state);
        // Derive phase from state
        if (state.phase === 'choosing') {
          setPhase('choosing');
          // Detect round change to reset local choice state
          if (state.currentRound !== prevRoundRef.current) {
            prevRoundRef.current = state.currentRound;
            setMyChoice(null);
          }
        } else if (state.phase === 'resolving') {
          setPhase('resolving');
        } else if (state.phase === 'finished') {
          setPhase('finished');
        }
      },
      (err: Error) => {
        setPhase('error');
        setError(err.message);
        useGameStore.getState().setColyseusError(err.message);
      },
      (code: number) => {
        // Server kicked us or connection dropped
        // Don't change phase - the result will arrive from Nakama anyway
        console.log('[DilemmaRace] Room left with code', code);
      },
    );

    // Join the room
    colyseusService.joinRoom(connection).catch((err) => {
      setPhase('error');
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      useGameStore.getState().setColyseusError(message);
    });

    // Cleanup: leave room on unmount
    return () => {
      colyseusService.leaveRoom();
    };
  }, [connection, isParticipant]);

  // ========== Choice handler ==========

  const handleChoice = useCallback(
    (step: number) => {
      if (phase === 'choosing') {
        colyseusService.sendChoice(step);
        setMyChoice(step);
      }
    },
    [phase],
  );

  // ========== Auto-submit default choice when timer is low ==========

  useEffect(() => {
    if (phase === 'choosing' && roomState && roomState.timeLeft <= 2 && myChoice === null) {
      colyseusService.sendChoice(1);
      setMyChoice(1);
    }
  }, [phase, roomState?.timeLeft, myChoice]);

  // ========== Player display name mapping ==========

  const allPlayersData = players.map((p) => ({
    displayName: p.display_name || p.player_id,
    userId: p.player_id,
  }));

  const getPlayerDisplayName = (playerId: string) => {
    const playerInfo = players.find((p) => p.player_id === playerId);
    return getDisambiguatedDisplayName(playerInfo?.display_name || playerId, playerId, allPlayersData);
  };

  // ========== Render ==========

  if (!isParticipant) {
    return (
      <div style={styles.gameArea}>
        <p style={styles.waitingText}>You are spectating this round. Waiting for participants to finish...</p>
      </div>
    );
  }

  if (phase === 'connecting') {
    return (
      <div style={styles.gameArea}>
        <p style={styles.connectingText}>Connecting to game server...</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={styles.gameArea}>
        <p style={styles.errorText}>Connection failed: {error}</p>
        <p style={styles.waitingText}>Waiting for server result...</p>
      </div>
    );
  }

  // Main game rendering (choosing / resolving / finished)
  const state = roomState;
  if (!state) return null;

  // Find my player state
  const myPlayerState = state.players.find((p) => p.id === myPlayerId);

  return (
    <div style={styles.gameArea}>
      {/* ===== Header: Round & Timer ===== */}
      <div style={styles.headerRow}>
        <span style={styles.roundLabel}>Round {state.currentRound}</span>
        {phase === 'choosing' && <span style={styles.timerDisplay}>{state.timeLeft}s</span>}
        {phase === 'resolving' && <span style={styles.resolvingLabel}>Resolving...</span>}
      </div>

      {/* ===== Player Legend ===== */}
      {state && (
        <div style={styles.playerLegendArea}>
          {state.players.map((p) => (
            <div key={p.id} style={p.id === myPlayerId ? styles.playerLegendItemMe : styles.playerLegendItemOther}>
              <span style={p.id === myPlayerId ? styles.playerMarkerMe : styles.playerMarkerOther}>
                {getPlayerDisplayName(p.id).charAt(0)}
              </span>
              <span>{getPlayerDisplayName(p.id)}</span>
              {p.isBlocked && <span style={styles.blockedIcon}>!</span>}
              {p.isFinished && <span style={styles.finishedIcon}>*</span>}
            </div>
          ))}
        </div>
      )}

      {/* ===== Track Visualization ===== */}
      <div style={styles.trackContainer}>
        <DilemmaRaceTrack
          players={state.players}
          trackLength={state.trackLength}
          myPlayerId={myPlayerId || ''}
          getPlayerDisplayName={getPlayerDisplayName}
        />
      </div>

      {/* ===== Choice Buttons (choosing phase only) ===== */}
      {phase === 'choosing' && !myPlayerState?.isFinished && (
        <div style={styles.choiceArea}>
          <p style={styles.choicePrompt}>
            {myChoice !== null
              ? `Current selection: ${myChoice} steps — you can change your choice`
              : 'Select a step size before time runs out!'}
          </p>
          <div style={styles.choiceButtons}>
            {[1, 3, 5].map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => handleChoice(step)}
                style={myChoice === step ? styles.choiceButtonSelected : styles.choiceButton}
              >
                {step}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===== Resolution Display ===== */}
      {phase === 'resolving' && (
        <div style={styles.resolutionArea}>
          {state.players.map((p) => (
            <div key={p.id} style={styles.resolutionRow}>
              <span>{getPlayerDisplayName(p.id)}</span>
              <span style={p.isBlocked ? styles.blockedText : styles.movedText}>
                {p.isBlocked ? 'BLOCKED! (collision)' : `Moved to position ${p.position}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ===== Finished Player ===== */}
      {myPlayerState?.isFinished && <p style={styles.finishedText}>You finished! Waiting for final rankings...</p>}
    </div>
  );
};
