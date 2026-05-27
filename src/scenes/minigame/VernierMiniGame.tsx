import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { getDisambiguatedDisplayName } from '../../utils/displayName';
import { styles } from './MiniGameStyles';
import { type MiniGameViewContext, useMiniGameViewContext } from './miniGameViewContext';

export interface VernierMiniGameProps {
  isParticipant: boolean;
  isSubmitting: boolean;
  submitError: string;
  onSubmit: (gameData: Record<string, unknown>) => void;
  viewContext?: MiniGameViewContext;
}

type Phase = 'countdown' | 'playing' | 'reveal' | 'finished';

export const VernierMiniGame: React.FC<VernierMiniGameProps> = ({
  isParticipant,
  isSubmitting,
  submitError,
  onSubmit,
  viewContext,
}) => {
  const { myPlayerId, miniGameStart, miniGameResult, players } = useMiniGameViewContext(viewContext);
  const [phase, setPhase] = useState<Phase>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [position, setPosition] = useState(50); // 0 to 100 percentage
  const [deviation, setDeviation] = useState<number | null>(null);
  const [animatedDeviation, setAnimatedDeviation] = useState(0);

  const [isBtnActive, setIsBtnActive] = useState(false);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (finishTimerRef.current !== null) {
        clearTimeout(finishTimerRef.current);
      }
    };
  }, []);

  // Seeded parameters
  const frequency = 0.0025;
  const amplitude = 42;

  // Animation Loop - Cleanly handles phase changes
  useEffect(() => {
    if (phase !== 'playing') return;

    let requestID: number;
    const startTimestamp = performance.now();

    const tick = (time: number) => {
      const elapsed = time - startTimestamp;
      // Start from the far left (phase offset of -PI/2)
      const currentPos = 50 + amplitude * Math.sin(elapsed * frequency - Math.PI / 2);
      setPosition(currentPos);
      requestID = requestAnimationFrame(tick);
    };

    requestID = requestAnimationFrame(tick);
    return () => {
      if (requestID) cancelAnimationFrame(requestID);
    };
  }, [phase]);

  // Counting animation for deviation sync
  useEffect(() => {
    if (phase === 'reveal' && deviation !== null) {
      const duration = 1500; // 1.5s animation
      const startTime = performance.now();

      const animateCount = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out quad
        const easeProgress = 1 - (1 - progress) * (1 - progress);
        setAnimatedDeviation(easeProgress * deviation);

        if (progress < 1) {
          requestAnimationFrame(animateCount);
        }
      };
      requestAnimationFrame(animateCount);
    }
  }, [phase, deviation]);

  useEffect(() => {
    if (!isParticipant) return;

    if (phase === 'countdown') {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        setPhase('playing');
      }
    }
  }, [countdown, phase, isParticipant]);

  const handleStop = () => {
    if (phase !== 'playing' || !isParticipant || isSubmitting) return;

    const dev = Math.abs(position - 50);
    setDeviation(dev);
    setPhase('reveal');

    onSubmit({ deviation: dev });

    // Wait 3.5s then show the full ranking list
    if (finishTimerRef.current !== null) {
      clearTimeout(finishTimerRef.current);
    }
    finishTimerRef.current = setTimeout(() => {
      finishTimerRef.current = null;
      setPhase('finished');
    }, 3500);
  };

  // Helper to calculate highlight bar style
  const getHighlightStyle = () => {
    if (deviation === null || phase === 'countdown' || phase === 'playing') return { display: 'none' };

    const isRight = position >= 50;
    return {
      left: isRight ? '50%' : `${50 - animatedDeviation}%`,
      width: `${animatedDeviation}%`,
    };
  };

  if (phase === 'reveal') {
    return (
      <div style={styles.vernierContainer}>
        <h3 style={styles.resultTitle}>锁定完成!</h3>
        <div style={{ ...styles.deviationText, color: '#e74c3c' }}>误差: {animatedDeviation.toFixed(2)}%</div>

        <div style={{ ...styles.vernierTrack, opacity: 0.9 }}>
          <div style={styles.vernierIndicator}>▼</div>
          <div style={styles.vernierIndicatorBottom}>▼</div>

          {/* Animated Highlight Bar - Above the ruler */}
          <div style={{ ...styles.vernierHighlight, ...getHighlightStyle(), zIndex: 10 }} />

          <div style={{ ...styles.vernierRuler, left: `${position}%`, transform: 'translateX(-50%)', zIndex: 5 }}>
            <div style={styles.vernierCenterLine} />
          </div>
        </div>

        <p style={{ color: '#666', fontSize: '16px', marginTop: '20px' }}>正在同步全员数据...</p>
      </div>
    );
  }

  if (phase === 'finished') {
    const participants = miniGameStart?.players || [];
    const allPlayersData = players.map((p) => ({
      displayName: p.display_name || p.player_id,
      userId: p.player_id,
    }));

    return (
      <div style={styles.mathGameContainer}>
        <h3 style={styles.resultTitle}>最终排名</h3>

        <div style={styles.miniRankingList}>
          {participants.map((pId) => {
            const isMe = pId === myPlayerId;
            const playerInfo = players.find((p) => p.player_id === pId);
            const name = getDisambiguatedDisplayName(playerInfo?.display_name || pId, pId, allPlayersData);
            const resultEntry = miniGameResult?.rankings.find((r) => r.player_id === pId);
            const isFinished = !!resultEntry;
            const resultDeviation =
              typeof resultEntry?.game_data?.deviation === 'number' ? resultEntry.game_data.deviation : null;

            return (
              <div key={pId} style={styles.miniRankingItem}>
                <span style={{ fontWeight: isMe ? 'bold' : 'normal' }}>
                  {name} {isMe ? '(我)' : ''}
                </span>
                {isMe ? (
                  <span style={styles.statusFinished}>{deviation?.toFixed(2)}%</span>
                ) : isFinished ? (
                  <span style={styles.statusFinished}>
                    {resultDeviation === null ? '?' : resultDeviation.toFixed(2)}%
                  </span>
                ) : (
                  <span style={styles.statusPlaying}>正在瞄准中...</span>
                )}
              </div>
            );
          })}
        </div>
        <p style={{ ...styles.gameDataDetail, fontSize: '14px', textAlign: 'center' }}>
          {isSubmitting ? '同步中...' : miniGameResult ? '全员挑战结束，即将跳转...' : '等待其他玩家...'}
        </p>
        {submitError && <p style={{ color: 'red', fontSize: '12px', textAlign: 'center' }}>{submitError}</p>}
      </div>
    );
  }

  return (
    <div style={styles.vernierContainer}>
      <div style={{ ...styles.questionHeader, justifyContent: 'center' }}>
        <span style={{ color: '#e74c3c', fontSize: '20px', fontWeight: 'bold' }}>
          {phase === 'countdown' ? `准备: ${countdown}s` : '锁定中心!'}
        </span>
      </div>

      <div style={styles.vernierTrack}>
        <div style={styles.vernierIndicator}>▼</div>
        <div style={styles.vernierIndicatorBottom}>▼</div>

        {/* Animated Highlight Bar - Above the ruler */}
        <div style={{ ...styles.vernierHighlight, ...getHighlightStyle(), zIndex: 10 }} />

        <div style={{ ...styles.vernierRuler, left: `${position}%`, transform: 'translateX(-50%)', zIndex: 5 }}>
          <div style={styles.vernierCenterLine} />
        </div>
      </div>

      {phase === 'playing' && (
        <button
          type="button"
          style={{ ...styles.stopBtn, ...(isBtnActive ? styles.stopBtnActive : {}) }}
          onMouseDown={() => setIsBtnActive(true)}
          onMouseUp={() => {
            setIsBtnActive(false);
            handleStop();
          }}
          onTouchStart={() => setIsBtnActive(true)}
          onTouchEnd={(e) => {
            e.preventDefault();
            setIsBtnActive(false);
            handleStop();
          }}
        >
          STOP!
        </button>
      )}

      {phase === 'countdown' && (
        <div style={{ height: '80px', display: 'flex', alignItems: 'center', fontSize: '20px', color: '#666' }}>
          观察尺子摆动频率...
        </div>
      )}
    </div>
  );
};
