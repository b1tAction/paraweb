/**
 * MiniGameScene - mini-game main entry point
 *
 * Manages shared state and phase transitions:
 * - playing phase: routes to specific mini-game component (dice_race, count_seconds)
 * - result phase: renders MiniGameResult rankings + game_data details
 *
 * The result phase shows for a few seconds before StateSync auto-transitions to next state.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { gameService } from '../../service/NakamaService';
import { DiceRaceMiniGame } from './DiceRaceMiniGame';
import { CountSecondsMiniGame } from './CountSecondsMiniGame';
import { MathCalcMiniGame } from './MathCalcMiniGame';
import { RainbowMemoryMiniGame } from './RainbowMemoryMiniGame';
import { VernierMiniGame } from './VernierMiniGame';
import { MiniGameLeaderboard } from './MiniGameLeaderboard';
import { styles } from './MiniGameStyles';

// ========== Game Phase ==========

type GamePhase = 'playing' | 'result';

// Result display duration before transitioning to next
const RESULT_DISPLAY_DURATION_MS = 5000;

// ========== MiniGameSubmitRankScene ==========

export const MiniGameSubmitRankScene: React.FC = () => {
  const { miniGameStart, miniGameResult, myPlayerId, session } = useGameStore();

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
    [miniGameStart?.game_type, miniGameStart?.players]
  );

  useEffect(() => {
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

  // ========== Submit handler (shared) ==========

  const submitGameData = useCallback(async (gameData: Record<string, any>) => {
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
  }, [isParticipant, submitted, gameType]);

  // ========== Result rendering ==========


  const renderResult = () => {
    if (!miniGameResult) return null;

    return (
      <MiniGameLeaderboard 
        gameType={gameType} 
        result={miniGameResult} 
      />
    );
  };

  // ========== Game title ==========

  const getGameTitle = () => {
    switch (gameType) {
      case 'dice_race': return 'Roll Dice';
      case 'count_seconds': return 'Count Seconds';
      case 'math_calc': return 'Math Calculation';
      case 'rainbow_memory': return 'Rainbow Memory';
      case 'vernier': return 'Vernier Caliper';
      default: return `Mini-Game: ${gameType}`;
    }
  };

  // ========== Not a participant ==========

  if (hasMiniGameStart && !isParticipant) {
    return (
      <div style={styles.modalContainer}>
        <h2 style={styles.title}>Mini-Game</h2>
        <p style={styles.submittedText}>
          You are not participating this round. Waiting for others...
        </p>
        {renderResult()}
      </div>
    );
  }

  // ========== No mini-game start ==========

  if (!hasMiniGameStart) {
    return (
      <div style={styles.modalContainer}>
        <h2 style={styles.title}>Mini-Game</h2>
        <p style={styles.submittedText}>Waiting for mini-game start...</p>
      </div>
    );
  }

  // ========== Result phase ==========
  if (gamePhase === 'result') {
    return (
      <div style={styles.modalContainer}>
        {renderResult()}
      </div>
    );
  }

  // ========== Playing phase ==========

  const renderGame = () => {
    switch (gameType) {
      case 'dice_race':
        return (
          <DiceRaceMiniGame
            isParticipant={isParticipant}
            submitted={submitted}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onSubmit={submitGameData}
          />
        );
      case 'count_seconds':
        return (
          <CountSecondsMiniGame
            isParticipant={isParticipant}
            submitted={submitted}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onSubmit={submitGameData}
          />
        );
      case 'math_calc':
        return (
          <MathCalcMiniGame
            isParticipant={isParticipant}
            submitted={submitted}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onSubmit={submitGameData}
          />
        );
      case 'rainbow_memory':
        return (
          <RainbowMemoryMiniGame
            isParticipant={isParticipant}
            submitted={submitted}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onSubmit={submitGameData}
          />
        );
      case 'vernier':
        return (
          <VernierMiniGame
            isParticipant={isParticipant}
            submitted={submitted}
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

  return (
    <div style={styles.modalContainer}>
      <h2 style={styles.title}>{getGameTitle()}</h2>
      {renderGame()}
    </div>
  );
};

export default MiniGameSubmitRankScene;