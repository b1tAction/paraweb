import type React from 'react';
import { useState } from 'react';
import { gameService } from '../service/NakamaService';
import { Scene, useGameStore } from '../store/gameStore';

async function getErrorMessage(err: unknown): Promise<string> {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  try {
    return JSON.stringify(err);
  } catch {
    return '未知错误';
  }
}

export const CreateRoomScene: React.FC = () => {
  const displayName = useGameStore((state) => state.displayName);
  const [lobbyName, setLobbyName] = useState(`${displayName || 'PLAYER'}'S LOBBY`);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const name = lobbyName.trim();
    if (!name) {
      setError('请输入房间名');
      return;
    }

    try {
      setError('');
      setIsCreating(true);
      await gameService.createRoom(name, maxPlayers);
      useGameStore.getState().setScene(Scene.Lobby);
    } catch (err: unknown) {
      const message = await getErrorMessage(err);
      setError(`创建房间失败：${message}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.panel}>
        <div style={styles.cornerTitle}>房间设置</div>
        <button
          type="button"
          onClick={() => useGameStore.getState().setScene(Scene.JoinRoom)}
          style={styles.backButton}
        >
          <span style={styles.backArrow}>{'<'}</span>
          返回
        </button>

        <label style={styles.label}>
          房间名
          <input
            value={lobbyName}
            onChange={(e) => setLobbyName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
            placeholder="输入房间名"
            maxLength={32}
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          最大玩家数
          <select value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))} style={styles.input}>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>

        <div style={styles.actions}>
          <button type="button" onClick={handleCreate} disabled={isCreating} style={styles.primaryButton}>
            {isCreating ? '创建中...' : '创建'}
          </button>
        </div>

        {error && <p style={styles.error}>{error}</p>}
      </section>
    </main>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '28px',
    backgroundImage: 'url("/assets/cover.png")',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    fontFamily: 'Zpix, sans-serif',
    color: '#fff7d6',
  },
  panel: {
    position: 'relative',
    width: 'min(520px, calc(100vw - 56px))',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '78px 24px 24px',
    background: 'rgba(18, 30, 31, 0.74)',
    border: '1px solid rgba(255, 233, 172, 0.38)',
    borderRadius: '8px',
    boxShadow: '0 18px 44px rgba(0,0,0,0.34)',
    backdropFilter: 'blur(3px)',
  },
  cornerTitle: {
    position: 'fixed',
    left: '50%',
    top: '28px',
    transform: 'translateX(-50%)',
    color: '#fff0b8',
    fontSize: '24px',
    textShadow: '0 3px 0 rgba(0,0,0,0.42)',
  },
  backButton: {
    position: 'absolute',
    left: '24px',
    top: '24px',
    minHeight: '28px',
    padding: '0 9px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color: '#fff7d6',
    background: 'rgba(0, 0, 0, 0.24)',
    border: '1px solid rgba(255, 247, 214, 0.28)',
    borderRadius: '20px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '12px',
  },
  backArrow: {
    display: 'inline-block',
    transform: 'translateY(-1px)',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    color: '#f4dda1',
    fontSize: '13px',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 13px',
    color: '#20322a',
    background: '#fff8df',
    border: '1px solid rgba(58, 47, 32, 0.38)',
    borderRadius: '8px',
    fontFamily: 'inherit',
    fontSize: '15px',
    outline: 'none',
  },
  actions: {
    display: 'flex',
    justifyContent: 'center',
  },
  primaryButton: {
    justifySelf: 'center',
    minHeight: '48px',
    padding: '0 36px',
    color: '#20322a',
    background: 'rgba(255, 255, 255, 0.62)',
    border: '1px solid rgba(255, 255, 255, 0.72)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '17px',
  },
  error: {
    margin: 0,
    padding: '10px 12px',
    color: '#ffe0d9',
    background: 'rgba(97, 30, 22, 0.66)',
    border: '1px solid rgba(255, 184, 172, 0.35)',
    borderRadius: '8px',
    fontSize: '13px',
  },
};

export default CreateRoomScene;
