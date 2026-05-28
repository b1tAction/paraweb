/**
 * MiniGameScene - mini-game main entry point
 *
 * Manages shared state and phase transitions:
 * - playing phase: routes to specific mini-game component (dice_race, count_seconds)
 * - result phase: renders MiniGameResult rankings + game_data details
 *
 * The result phase shows for a few seconds before StateSync auto-transitions to next state.
 */

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gameService } from '../../service/NakamaService';
import { useGameStore } from '../../store/gameStore';
import { CountSecondsMiniGame } from './CountSecondsMiniGame';
import { DiceRaceMiniGame } from './DiceRaceMiniGame';
import { DilemmaRaceMiniGame } from './DilemmaRaceMiniGame';
import { MathCalcMiniGame } from './MathCalcMiniGame';
import { MiniGameLeaderboard } from './MiniGameLeaderboard';
import { styles } from './MiniGameStyles';
import { RainbowMemoryMiniGame } from './RainbowMemoryMiniGame';
import { ScaleWrapper } from './ScaleWrapper';
import { TrustDilemmaMiniGame } from './TrustDilemmaMiniGame';
import { VernierMiniGame } from './VernierMiniGame';

// ========== Game Phase ==========

type GamePhase = 'playing' | 'result';

// Result display duration before transitioning to next
const RESULT_DISPLAY_DURATION_MS = 5000;

// ========== MiniGameSubmitRankScene ==========

export const MiniGameSubmitRankScene: React.FC = () => {
  const { miniGameStart, miniGameResult, myPlayerId, session, miniGameOnline } = useGameStore();

  // Shared submit state
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Game phase: 'playing' when game active, 'result' when rankings received
  const [gamePhase, setGamePhase] = useState<GamePhase>('playing');

  // Timer ref for result display delay
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset all state when mini-game round changes
  const startKey = useMemo(
    () => `${miniGameStart?.game_type || ''}:${(miniGameStart?.players || []).join(',')}`,
    [miniGameStart?.game_type, miniGameStart?.players],
  );
  const lastStartKeyRef = useRef(startKey);

  useEffect(() => {
    if (lastStartKeyRef.current === startKey) return;

    lastStartKeyRef.current = startKey;
    setSubmitted(false);
    setIsSubmitting(false);
    setSubmitError('');
    setGamePhase('playing');
    if (resultTimerRef.current) {
      clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
  }, [startKey]);

  // Transition to result phase when miniGameResult arrives,
  // then after RESULT_DISPLAY_DURATION_MS, clear pending flag and transition to pendingScene.
  useEffect(() => {
    if (miniGameResult) {
      setGamePhase('result');

      // Start result display timer
      if (resultTimerRef.current) {
        clearTimeout(resultTimerRef.current);
      }

      resultTimerRef.current = setTimeout(() => {
        const store = useGameStore.getState();
        store.setMiniGameResultPending(false);

        // 清空小游戏数据，为下一轮做准备
        store.setMiniGameStart(null);
        store.setMiniGameResult(null);

        // Transition to the scene that was deferred during result display
        if (store.pendingScene) {
          store.setScene(store.pendingScene);
          store.setPendingScene(null);
        }

        resultTimerRef.current = null;
      }, RESULT_DISPLAY_DURATION_MS);
    }
  }, [miniGameResult]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (resultTimerRef.current) {
        clearTimeout(resultTimerRef.current);
        resultTimerRef.current = null;
      }
    };
  }, []);

  // Derived state
  const participantIds = miniGameStart?.players || [];
  const hasMiniGameStart = participantIds.length > 0;
  const myUserId = myPlayerId || session?.user_id || '';
  const isParticipant = hasMiniGameStart && participantIds.includes(myUserId);
  const gameType = miniGameStart?.game_type || '';

  // Online mode: connection info present means Colyseus-based real-time game
  const isOnlineMode = miniGameOnline && miniGameStart?.connection != null;

  // ========== Submit handler (shared) ==========

  const submitGameData = useCallback(
    async (gameData: Record<string, unknown>) => {
      if (!isParticipant || submitted) return;

      try {
        setSubmitError('');
        setIsSubmitting(true);
        await gameService.sendMiniGameDataSubmit(gameType, gameData);
        setSubmitted(true);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to submit mini-game data';
        setSubmitError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isParticipant, submitted, gameType],
  );

  // ========== Result rendering ==========

  const renderResult = () => {
    if (!miniGameResult) return null;

    return <MiniGameLeaderboard gameType={gameType} result={miniGameResult} />;
  };

  // ========== Game title ==========

  const getGameTitle = () => {
    switch (gameType) {
      case 'dilemma_race':
        return 'Dilemma Race';
      case 'trust_dilemma':
        return '信任博弈';
      case 'dice_race':
        return 'Roll Dice';
      case 'count_seconds':
        return 'Count Seconds';
      case 'math_calc':
        return 'Math Calculation';
      case 'rainbow_memory':
        return 'Rainbow Memory';
      case 'vernier':
        return 'Vernier Caliper';
      default:
        return `Mini-Game: ${gameType}`;
    }
  };
  // ========== Playing phase rendering ==========

  const renderGame = () => {
    switch (gameType) {
      // --- Dilemma Race: online mode (Colyseus real-time game) ---
      case 'dilemma_race':
        if (isOnlineMode && miniGameStart?.connection) {
          return <DilemmaRaceMiniGame connection={miniGameStart.connection} isParticipant={isParticipant} />;
        }
        // dilemma_race requires online mode; show waiting message if no connection
        return (
          <div style={styles.gameArea}>
            <p style={styles.submittedText}>dilemma_race requires online mode. Waiting for server result...</p>
          </div>
        );
      case 'trust_dilemma':
        if (isOnlineMode && miniGameStart?.connection) {
          return <TrustDilemmaMiniGame connection={miniGameStart.connection} isParticipant={isParticipant} />;
        }
        return (
          <div style={styles.gameArea}>
            <p style={styles.submittedText}>trust_dilemma requires online mode. Waiting for server result...</p>
          </div>
        );
      case 'dice_race':
        return (
          <DiceRaceMiniGame
            isParticipant={isParticipant}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onSubmit={submitGameData}
          />
        );
      case 'count_seconds':
        return (
          <CountSecondsMiniGame
            isParticipant={isParticipant}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onSubmit={submitGameData}
          />
        );
      case 'math_calc':
        return (
          <MathCalcMiniGame
            isParticipant={isParticipant}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onSubmit={submitGameData}
          />
        );
      case 'rainbow_memory':
        return (
          <RainbowMemoryMiniGame
            isParticipant={isParticipant}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onSubmit={submitGameData}
          />
        );
      case 'vernier':
        return (
          <VernierMiniGame
            isParticipant={isParticipant}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onSubmit={submitGameData}
          />
        );
      default:
        return (
          <div style={styles.gameArea}>
            <p style={styles.submittedText}>
              {gameType} mini-game not yet implemented. Waiting for server auto-processing...
            </p>
          </div>
        );
    }
  };
  // ========== Main Render Logic ==========

  const renderContent = () => {
    // 1. No game start
    if (!hasMiniGameStart) {
      return (
        <>
          <h2 style={styles.title}>Mini-Game</h2>
          <p style={styles.submittedText}>Waiting for mini-game start...</p>
        </>
      );
    }

    // 2. Result phase (for everyone)
    if (gamePhase === 'result') {
      return (
        <>
          <h2 style={styles.title}>{getGameTitle()} - Results</h2>
          {renderResult()}
        </>
      );
    }

    // 3. Not a participant (waiting for others)
    if (!isParticipant) {
      return (
        <>
          <h2 style={styles.title}>{getGameTitle()}</h2>
          <p style={styles.submittedText}>You are not participating this round. Waiting for others...</p>
          {renderResult()}
        </>
      );
    }

    // 4. Playing phase (participants)
    return (
      <>
        <h2 style={styles.title}>{getGameTitle()}</h2>
        {renderGame()}
      </>
    );
  };

  return (
    <div style={styles.modalContainer}>
      <div style={styles.screenContent}>
        <ScaleWrapper>
          {renderContent()}
        </ScaleWrapper>
      </div>
    </div>
  );
};

export default MiniGameSubmitRankScene;
