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
import { CakeCuttingMiniGame } from './CakeCuttingMiniGame';
import { CountSecondsMiniGame } from './CountSecondsMiniGame';
import { DiceRaceMiniGame } from './DiceRaceMiniGame';
import { DilemmaRaceMiniGame } from './DilemmaRaceMiniGame';
import { MathCalcMiniGame } from './MathCalcMiniGame';
import { MiniGameLeaderboard } from './MiniGameLeaderboard';
import { styles } from './MiniGameStyles';
import { RainbowMemoryMiniGame } from './RainbowMemoryMiniGame';
import { ScaleWrapper } from './ScaleWrapper';
import { TrustDilemmaMiniGame } from './TrustDilemmaMiniGame';
import { TypingSpeedMiniGame } from './TypingSpeedMiniGame';
import { VernierMiniGame } from './VernierMiniGame';

// ========== Game Phase ==========

type GamePhase = 'playing' | 'result';

// Result display duration before transitioning to next
const RESULT_DISPLAY_DURATION_MS = 5000;

// ========== MiniGameSubmitRankScene ==========

export const MiniGameSubmitRankScene: React.FC = () => {
  const { miniGameStart, miniGameResult, myPlayerId, players, session, miniGameOnline } = useGameStore();

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
    () =>
      [
        miniGameStart?.game_type || '',
        miniGameStart?.connection?.minigame_instance_id || miniGameStart?.connection?.room_id || '',
        (miniGameStart?.players || []).join(','),
      ].join(':'),
    [miniGameStart?.connection, miniGameStart?.game_type, miniGameStart?.players],
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
  const participantPlayers = useMemo(() => {
    if (participantIds.length === 0 || players.length === 0) return [];

    const playersById = new Map(players.map((player) => [player.player_id, player]));
    const orderedPlayers = participantIds.flatMap((participantId) => {
      const player = playersById.get(participantId);
      return player ? [player] : [];
    });

    return orderedPlayers.length === participantIds.length ? orderedPlayers : [];
  }, [participantIds, players]);

  // Online mode: connection info present means Colyseus-based real-time game
  const isOnlineMode = miniGameOnline && miniGameStart?.connection != null;
  const onlineGameKey =
    miniGameStart?.connection?.minigame_instance_id ||
    miniGameStart?.connection?.room_id ||
    `${gameType}:${participantIds.join(',')}`;

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
        const message = err instanceof Error ? err.message : '提交小游戏成绩失败';
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
        return '步步为营';
      case 'trust_dilemma':
        return '信任考验';
      case 'cake_cutting':
        return '切蛋糕';
      case 'typing_speed':
        return '打字速度';
      case 'dice_race':
        return '骰子竞速';
      case 'count_seconds':
        return '心中数秒';
      case 'math_calc':
        return '速算挑战';
      case 'rainbow_memory':
        return '彩虹记忆';
      case 'vernier':
        return '游标卡尺';
      default:
        return `小游戏: ${gameType}`;
    }
  };
  // ========== Playing phase rendering ==========

  const renderGame = () => {
    switch (gameType) {
      // --- Dilemma Race: online mode (Colyseus real-time game) ---
      case 'dilemma_race':
        if (isOnlineMode && miniGameStart?.connection) {
          return (
            <DilemmaRaceMiniGame
              key={onlineGameKey}
              connection={miniGameStart.connection}
              isParticipant={isParticipant}
              playerId={myUserId}
              participantIds={participantIds}
              participantPlayers={participantPlayers}
            />
          );
        }
        // dilemma_race requires online mode; show waiting message if no connection
        return (
          <div style={styles.gameArea}>
            <p style={styles.submittedText}>步步为营需要联机模式, 等待结算</p>
          </div>
        );
      case 'trust_dilemma':
        if (isOnlineMode && miniGameStart?.connection) {
          return (
            <TrustDilemmaMiniGame
              key={onlineGameKey}
              connection={miniGameStart.connection}
              isParticipant={isParticipant}
              playerId={myUserId}
              participantIds={participantIds}
              participantPlayers={participantPlayers}
            />
          );
        }
        return (
          <div style={styles.gameArea}>
            <p style={styles.submittedText}>信任考验需要联机模式, 等待结算</p>
          </div>
        );
      case 'cake_cutting':
        if (isOnlineMode && miniGameStart?.connection) {
          return (
            <CakeCuttingMiniGame
              key={onlineGameKey}
              connection={miniGameStart.connection}
              isParticipant={isParticipant}
              playerId={myUserId}
              participantIds={participantIds}
              participantPlayers={participantPlayers}
            />
          );
        }
        return (
          <div style={styles.gameArea}>
            <p style={styles.submittedText}>切蛋糕需要联机模式, 等待结算</p>
          </div>
        );
      case 'typing_speed':
        if (isOnlineMode && miniGameStart?.connection) {
          return (
            <TypingSpeedMiniGame
              key={onlineGameKey}
              connection={miniGameStart.connection}
              isParticipant={isParticipant}
              playerId={myUserId}
              participantIds={participantIds}
              participantPlayers={participantPlayers}
            />
          );
        }
        return (
          <div style={styles.gameArea}>
            <p style={styles.submittedText}>打字速度需要联机模式, 等待结算</p>
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
            <p style={styles.submittedText}>{gameType} 小游戏暂未接入前端, 等待服务器处理</p>
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
          <h2 style={styles.title}>小游戏</h2>
          <p style={styles.submittedText}>等待小游戏开始</p>
        </>
      );
    }

    // 2. Result phase (for everyone)
    if (gamePhase === 'result') {
      return (
        <>
          <h2 style={styles.title}>{getGameTitle()} · 结果</h2>
          {renderResult()}
        </>
      );
    }

    // 3. Not a participant (waiting for others)
    if (!isParticipant) {
      return (
        <>
          <h2 style={styles.title}>{getGameTitle()}</h2>
          <p style={styles.submittedText}>未参与本轮, 等待其他玩家</p>
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
        <ScaleWrapper>{renderContent()}</ScaleWrapper>
      </div>
    </div>
  );
};

export default MiniGameSubmitRankScene;
