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
      const errorMessage = err instanceof Error ? err.message : '发送开始游戏请求失败';
      setStartError(errorMessage);
      console.error('[LobbyScene] 开始游戏失败', err);
    } finally {
      setIsStarting(false);
    }
  };

  // 补全截断的返回逻辑
  return (
    <div style={styles.pageWrapper}>
      <div style={styles.container}>
        <h2 style={styles.title}>房间等待</h2>

        <div style={styles.infoSection}>
          <div style={styles.info}>房间ID: {displayMatchId}</div>
          <button 
            style={styles.copyButton} 
            onClick={() => displayMatchId && navigator.clipboard.writeText(displayMatchId)}
          >
            复制房间号
          </button>
          <div style={styles.info}>
            人数: {player_count} / {max_players} (最少 {min_players} 人)
          </div>
          {message && <div style={styles.message}>{message}</div>}
        </div>

        <div style={styles.playerList}>
          {players?.map((player: any, index: number) => {
            const isMe = player.user_id === myPlayerId;
            const isPlayerHost = player.user_id === host_user_id;
            return (
              <div key={player.user_id || index} style={styles.playerItem}>
                <span style={styles.playerName}>
                  {player.display_name || player.user_id}
                  {isPlayerHost ? ' 👑(房主)' : ''}
                  {isMe ? ' (我)' : ''}
                </span>
                <span style={styles.playerFaction}>已加入</span>
              </div>
            );
          })}
        </div>

        <div style={styles.statusSection}>
          {isHost ? (
            <button
              style={{
                ...styles.startButton,
                backgroundColor: can_start ? '#4CAF50' : '#ccc',
                cursor: can_start ? 'pointer' : 'not-allowed',
              }}
              onClick={handleStartGame}
              disabled={!can_start || isStarting}
            >
              {isStarting ? '启动中...' : '开始游戏'}
            </button>
          ) : (
            <div style={styles.waiting}>等待房主开始游戏...</div>
          )}
          {startError && <div style={styles.error}>{startError}</div>}
        </div>
      </div>
    </div>
  );
};

// 适当美化后的样式
const styles: Record<string, React.CSSProperties> = {
  // 新增外层包裹，用于设置全屏背景图和居中
  pageWrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundImage: 'url("/assets/waiting.png")', // public目录下的图片可以直接这样引用
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    padding: '20px',
  },
  // 改造成半透明毛玻璃面板
  container: {
    width: '100%',
    maxWidth: '500px',
    padding: '30px',
    backgroundColor: 'rgba(255, 255, 255, 0.85)', // 85%透明度的白色底
    backdropFilter: 'blur(10px)', // 毛玻璃模糊效果
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)', // 增加立体阴影
    margin: '0 auto',
  },
  title: {
    textAlign: 'center',
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '20px',
    color: '#333',
  },
  infoSection: {
    padding: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    borderRadius: '12px',
    marginBottom: '20px',
  },
  info: {
    fontSize: '15px',
    marginBottom: '6px',
    color: '#444',
  },
  copyButton: {
    marginTop: '6px',
    marginBottom: '12px',
    padding: '6px 12px',
    border: '1px solid #3f51b5',
    backgroundColor: 'transparent',
    color: '#3f51b5',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.2s',
  },
  message: {
    fontSize: '14px',
    color: '#666',
    marginTop: '8px',
  },
  playerList: {
    padding: '8px 16px',
    backgroundColor: '#fff',
    border: '1px solid #eaeaea',
    borderRadius: '12px',
    marginBottom: '20px',
  },
  playerItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: '1px solid #f0f0f0',
  },
  playerName: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#333',
  },
  playerFaction: {
    fontSize: '14px',
    color: '#666',
  },
  statusSection: {
    textAlign: 'center',
    padding: '8px',
  },
  waiting: {
    fontSize: '16px',
    color: '#555',
    fontWeight: '500',
  },
  error: {
    marginTop: '12px',
    color: '#d32f2f',
    fontSize: '14px',
  },
  startButton: {
    width: '100%',
    padding: '14px 32px',
    fontSize: '18px',
    fontWeight: 'bold',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    transition: 'background-color 0.2s',
  },
};

export default LobbyScene;