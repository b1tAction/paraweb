/**
 * GameOverScene - 游戏结束场景
 *
 * 显示游戏结果和统计数据
 */

import React from 'react';
import { useGameStore } from '../store/gameStore';

export const GameOverScene: React.FC = () => {
  const { gameOver, players, myPlayerId } = useGameStore();

  if (!gameOver) {
    return <div>加载中...</div>;
  }

  const { winner_id, stats } = gameOver;
  const winner = players.find((p) => p.player_id === winner_id);

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>游戏结束!</h2>

      {/* 获胜者 */}
      <div style={styles.winnerSection}>
        <p style={styles.winnerLabel}>获胜者</p>
        <p style={styles.winnerName}>
          {winner?.display_name || winner_id}
        </p>
      </div>

      {/* 统计数据 */}
      <div style={styles.statsSection}>
        <h3>统计数据</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>玩家</th>
              <th style={styles.th}>获胜轮数</th>
              <th style={styles.th}>事件抽取</th>
              <th style={styles.th}>道具使用</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat, index) => {
              const player = players.find(
                (p) => p.player_id === stat.player_id
              );
              const isMyStats = stat.player_id === myPlayerId;

              return (
                <tr
                  key={index}
                  style={{
                    backgroundColor: isMyStats ? '#e3f2fd' : 'transparent',
                  }}
                >
                  <td style={styles.td}>
                    {player?.display_name || stat.player_id}
                    {isMyStats && ' (你)'}
                  </td>
                  <td style={styles.td}>{stat.rounds_won}</td>
                  <td style={styles.td}>{stat.events_drawn}</td>
                  <td style={styles.td}>{stat.items_used}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 重新开始按钮 */}
      <div style={styles.actionSection}>
        <button
          onClick={() => {
            console.log('[GameOverScene] 重新开始');
            // TODO: 实现重新开始逻辑
          }}
          style={styles.restartButton}
        >
          重新开始
        </button>
      </div>
    </div>
  );
};

// 简单样式
const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    maxWidth: '600px',
    margin: '0 auto',
  },
  title: {
    textAlign: 'center',
    fontSize: '24px',
    marginBottom: '24px',
  },
  winnerSection: {
    padding: '24px',
    backgroundColor: '#fff9c4',
    borderRadius: '8px',
    textAlign: 'center',
    marginBottom: '24px',
  },
  winnerLabel: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '8px',
  },
  winnerName: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#ff9800',
  },
  statsSection: {
    marginBottom: '24px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '8px',
  },
  th: {
    padding: '12px',
    backgroundColor: '#f5f5f5',
    borderBottom: '2px solid #ddd',
    textAlign: 'left',
    fontSize: '14px',
  },
  td: {
    padding: '12px',
    borderBottom: '1px solid #eee',
    fontSize: '14px',
  },
  actionSection: {
    textAlign: 'center',
  },
  restartButton: {
    padding: '16px 32px',
    fontSize: '18px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
};

export default GameOverScene;
