/**
 * MiniGameSubmitRankScene - 小游戏提交排名场景
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { gameService } from '../service/NakamaService';

export const MiniGameSubmitRankScene: React.FC = () => {
  const { miniGameStart, miniGameResult, myPlayerId, session } = useGameStore();
  const [submittedRank, setSubmittedRank] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const participantIds = miniGameStart?.players || [];
  const hasMiniGameStart = participantIds.length > 0;
  const myUserId = myPlayerId || session?.user_id || '';
  const isParticipant = hasMiniGameStart && participantIds.includes(myUserId);
  const maxRank = hasMiniGameStart ? participantIds.length : 0;

  const startKey = useMemo(
    () => `${miniGameStart?.game_type || ''}:${participantIds.join(',')}`,
    [miniGameStart?.game_type, participantIds]
  );

  useEffect(() => {
    setSubmittedRank(null);
    setSubmitError('');
    setIsSubmitting(false);
  }, [startKey]);

  /**
   * 处理提交排名
   */
  const handleSubmitRank = async (rank: number) => {
    if (!isParticipant) {
      return;
    }

    try {
      setSubmitError('');
      setIsSubmitting(true);
      console.log('[MiniGameScene] 提交排名', rank);
      await gameService.sendMiniGameResult(rank);
      setSubmittedRank(rank);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '提交小游戏排名失败';
      setSubmitError(message);
      console.error('[MiniGameScene] 提交排名失败', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>小游戏提交排名</h2>

      <p style={styles.description}>
        {!hasMiniGameStart
          ? '等待服务端同步小游戏参与者...'
          : miniGameResult
          ? '已收到小游戏结果，等待进入下一阶段...'
          : isParticipant
          ? `请选择你的排名 (1-${maxRank})`
          : '你不是本轮小游戏参与者，等待其他玩家提交结果...'}
      </p>

      {/* 排名选择 */}
      <div style={styles.rankSection}>
        {hasMiniGameStart && !miniGameResult && Array.from({ length: maxRank }, (_, i) => i + 1).map((rank) => (
          <button
            key={rank}
            onClick={() => handleSubmitRank(rank)}
            style={{
              ...styles.rankButton,
              backgroundColor: submittedRank === rank ? '#4CAF50' : '#2196F3',
            }}
            disabled={!isParticipant || submittedRank !== null || isSubmitting}
          >
            第 {rank} 名
          </button>
        ))}
      </div>

      {submittedRank && (
        <p style={styles.submitted}>
          已提交排名：第 {submittedRank} 名
        </p>
      )}

      {submitError && <p style={styles.error}>{submitError}</p>}

      {miniGameResult && (
        <p style={styles.resultNotice}>小游戏结果已广播，等待进入下一阶段...</p>
      )}
    </div>
  );
};

// 简单样式
const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    maxWidth: '500px',
    margin: '0 auto',
  },
  title: {
    textAlign: 'center',
    fontSize: '20px',
    marginBottom: '16px',
  },
  description: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#666',
    marginBottom: '24px',
  },
  rankSection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    marginBottom: '24px',
  },
  rankButton: {
    padding: '16px',
    fontSize: '18px',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  submitted: {
    textAlign: 'center',
    fontSize: '16px',
    color: '#4CAF50',
    marginBottom: '24px',
  },
  resultNotice: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#666',
    marginTop: '8px',
  },
  error: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#d32f2f',
    marginBottom: '20px',
  },
};

export default MiniGameSubmitRankScene;
