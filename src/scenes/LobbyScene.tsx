/**
 * LobbyScene - 房间等待场景
 *
 * 显示房间玩家列表，房主可以开始游戏
 */

import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { gameService } from '../service/NakamaService';

export const LobbyScene: React.FC = () => {
  const { waitingSync, myPlayerId, matchId } = useGameStore();
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState('');

  if (!waitingSync) {
    return <div>加载中...</div>;
  }

  const {
    match_id,
    host_user_id,
    players,
    player_count,
    min_players,
    max_players,
    can_start,
    message,
  } = waitingSync;

  const isHost = myPlayerId === host_user_id;
  const displayMatchId = match_id || matchId;

  /**
   * 处理开始游戏
   */
  const handleStartGame = async () => {
    try {
      setStartError('');
      setIsStarting(true);
      console.log('[LobbyScene] 开始游戏');
      await gameService.sendStartGame();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '发送开始游戏请求失败';
      setStartError(message);
      console.error('[LobbyScene] 开始游戏失败', err);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>房间等待</h2>

      <div style={styles.infoSection}>
        <p style={styles.info}>房间 ID: {displayMatchId || '加载中...'}</p>
        {displayMatchId && (
          <button
            onClick={() => navigator.clipboard.writeText(displayMatchId)}
            style={styles.copyButton}
          >
            复制 ID
          </button>
        )}
        <p style={styles.info}>
          玩家：{player_count} / {max_players}
        </p>
        {message && <p style={styles.message}>{message}</p>}
      </div>

      <div style={styles.playerList}>
        <h3>玩家列表</h3>
        {players.map((player, index) => (
          <div key={index} style={styles.playerItem}>
            <span style={styles.playerName}>
              {player.display_name}
              {player.is_host && ' (房主)'}
            </span>
            <span style={styles.playerFaction}>{player.faction}</span>
          </div>
        ))}
      </div>

      <div style={styles.statusSection}>
        {player_count < min_players ? (
          <p style={styles.waiting}>
            等待更多玩家加入 (至少需要 {min_players} 人)...
          </p>
        ) : isHost ? (
          <button
            onClick={handleStartGame}
            style={styles.startButton}
            disabled={!can_start || isStarting}
          >
            {!can_start ? '等待中...' : isStarting ? '发送中...' : '开始游戏'}
          </button>
        ) : (
          <p style={styles.waiting}>等待房主开始游戏...</p>
        )}
        {startError && <p style={styles.error}>{startError}</p>}
      </div>
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
  infoSection: {
    padding: '12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  info: {
    fontSize: '14px',
    marginBottom: '4px',
  },
  copyButton: {
    marginTop: '6px',
    marginBottom: '8px',
    padding: '6px 10px',
    border: '1px solid #3f51b5',
    backgroundColor: '#fff',
    color: '#3f51b5',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  message: {
    fontSize: '14px',
    color: '#666',
    marginTop: '8px',
  },
  playerList: {
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  playerItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #eee',
  },
  playerName: {
    fontSize: '16px',
  },
  playerFaction: {
    fontSize: '14px',
    color: '#666',
  },
  statusSection: {
    textAlign: 'center',
    padding: '16px',
  },
  waiting: {
    fontSize: '14px',
    color: '#666',
  },
  error: {
    marginTop: '8px',
    color: '#d32f2f',
    fontSize: '13px',
  },
  startButton: {
    padding: '12px 24px',
    fontSize: '18px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
};

export default LobbyScene;
