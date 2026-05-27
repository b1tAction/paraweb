/**
 * CountSecondsMiniGame - count_seconds mini-game component
 *
 * Player estimates 5 seconds, submits elapsed time.
 * Deviation ascending ranking (closer to 5.0 = better rank).
 */

import type React from 'react';
import { useCallback, useState } from 'react';
import { getDisambiguatedDisplayName } from '../../utils/displayName';
import { styles } from './MiniGameStyles';
import { type MiniGameViewContext, useMiniGameViewContext } from './miniGameViewContext';

// ========== CountSecondsMiniGame Component ==========

type CountSecondsPhase = 'idle' | 'running' | 'stopped';

export interface CountSecondsMiniGameProps {
  isParticipant: boolean;
  isSubmitting: boolean;
  submitError: string;
  onSubmit: (gameData: Record<string, unknown>) => void;
  viewContext?: MiniGameViewContext;
}

export const CountSecondsMiniGame: React.FC<CountSecondsMiniGameProps> = ({
  isParticipant,
  isSubmitting,
  submitError,
  onSubmit,
  viewContext,
}) => {
  const { miniGameStart, miniGameResult, myPlayerId, players } = useMiniGameViewContext(viewContext);
  const [phase, setPhase] = useState<CountSecondsPhase>('idle');
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  const handleStart = useCallback(() => {
    setStartTime(Date.now());
    setPhase('running');
  }, []);

  const handleStop = useCallback(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    setElapsedSeconds(elapsed);
    setPhase('stopped');

    // Auto-submit immediately
    const deviation = Math.abs(elapsed - 5.0);
    onSubmit({ elapsed, deviation });
  }, [startTime, onSubmit]);


  return (
    <div style={styles.gameArea}>
      {phase === 'idle' && (
        <>
          <p style={{ fontSize: '14px', color: '#666', textAlign: 'center' }}>在脑子里数5秒，然后点击停止！</p>
          <button
            type="button"
            onClick={handleStart}
            style={
              isParticipant
                ? {
                    ...styles.button,
                    backgroundColor: '#2196F3',
                    backgroundImage: 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
                    boxShadow: '0 4px 6px rgba(33, 150, 243, 0.2)',
                  }
                : styles.buttonDisabled
            }
            disabled={!isParticipant}
          >
            开始
          </button>
        </>
      )}

      {phase === 'running' && (
        <>
          <p style={styles.timerDisplay}>???</p>
          <p style={{ fontSize: '14px', color: '#888', textAlign: 'center' }}>在脑子里数5秒...</p>
          <button
            type="button"
            onClick={handleStop}
            style={{
              ...styles.button,
              backgroundColor: '#f44336',
              backgroundImage: 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)',
              boxShadow: '0 4px 6px rgba(244, 67, 54, 0.2)',
              marginTop: '16px',
            }}
          >
            停止
          </button>
        </>
      )}

      {phase === 'stopped' && (
        <div style={{ ...styles.resultContainer, backgroundColor: 'transparent', padding: '16px', width: '100%' }}>
          <p style={{ ...styles.submittedText, fontWeight: 'bold' }}>
            {isSubmitting ? '正在提交...' : '成绩已提交！'}
          </p>

          <div style={styles.miniRankingList}>
            {(miniGameStart?.players || []).map((pId) => {
              const isMe = pId === myPlayerId;
              const playerInfo = players.find((p) => p.player_id === pId);
              const allPlayersData = players.map((p) => ({
                displayName: p.display_name || p.player_id,
                userId: p.player_id,
              }));
              const name = getDisambiguatedDisplayName(playerInfo?.display_name || pId, pId, allPlayersData);
              const resultEntry = miniGameResult?.rankings.find((r) => r.player_id === pId);
              const isFinished = !!resultEntry;
              const resElapsed =
                typeof resultEntry?.game_data?.elapsed === 'number' ? resultEntry.game_data.elapsed : null;

              return (
                <div key={pId} style={styles.miniRankingItem}>
                  <span style={{ fontWeight: isMe ? 'bold' : 'normal' }}>
                    {name} {isMe ? '(我)' : ''}
                  </span>
                  {isMe ? (
                    <span style={styles.statusFinished}>{elapsedSeconds.toFixed(2)}s</span>
                  ) : isFinished ? (
                    <span style={styles.statusFinished}>{resElapsed?.toFixed(2) ?? '?'}s</span>
                  ) : (
                    <span style={styles.statusPlaying}>正在计时...</span>
                  )}
                </div>
              );
            })}
          </div>

          <p style={{ fontSize: '14px', color: '#888', textAlign: 'center', marginTop: '8px' }}>
            {miniGameResult ? '全员挑战结束，即将跳转...' : '等待其他玩家结束...'}
          </p>
        </div>
      )}


      {submitError && <p style={styles.errorText}>{submitError}</p>}
    </div>
  );
};
