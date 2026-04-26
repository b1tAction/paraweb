/**
 * HomeScene - 主菜单场景
 *
 * 提供登录、创建房间和加入房间功能
 */

import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { gameService } from '../service/NakamaService';

export const HomeScene: React.FC = () => {
  const { session, myPlayerId, displayName, matchId, setMyPlayerId } = useGameStore();

  const getErrorMessage = async (err: unknown): Promise<string> => {
    if (err instanceof Response) {
      try {
        const data = await err.clone().json();
        if (data && typeof data === 'object') {
          const maybeData = data as {
            message?: string;
            error?: string;
            detail?: string;
          };
          if (typeof maybeData.message === 'string' && maybeData.message.trim()) {
            return maybeData.message;
          }
          if (typeof maybeData.error === 'string' && maybeData.error.trim()) {
            return maybeData.error;
          }
          if (typeof maybeData.detail === 'string' && maybeData.detail.trim()) {
            return maybeData.detail;
          }
        }
      } catch {
        // ignore json parse errors
      }

      try {
        const text = (await err.clone().text()).trim();
        if (text) {
          return text;
        }
      } catch {
        // ignore text parse errors
      }

      return `HTTP ${err.status}: ${err.statusText || '请求失败'}`;
    }

    if (err instanceof Error && err.message) {
      return err.message;
    }

    if (typeof err === 'string' && err.trim()) {
      return err;
    }

    if (err && typeof err === 'object') {
      const maybeError = err as {
        message?: string;
        error?: string;
        detail?: string;
        statusText?: string;
        status?: number;
      };

      if (typeof maybeError.message === 'string' && maybeError.message.trim()) {
        return maybeError.message;
      }
      if (typeof maybeError.error === 'string' && maybeError.error.trim()) {
        return maybeError.error;
      }
      if (typeof maybeError.detail === 'string' && maybeError.detail.trim()) {
        return maybeError.detail;
      }
      if (typeof maybeError.statusText === 'string' && maybeError.statusText.trim()) {
        return maybeError.statusText;
      }
      if (typeof maybeError.status === 'number') {
        return `请求失败 (status=${maybeError.status})`;
      }

      try {
        return JSON.stringify(err);
      } catch {
        // ignore
      }
    }

    return '未知错误';
  };

  // 登录表单状态
  const [username, setUsername] = useState<string>('');
  const[password, setPassword] = useState<string>('');
  const [isRegister, setIsRegister] = useState<boolean>(false);

  // 创建房间表单
  const [faction, setFaction] = useState<string>('qing_long');
  const [maxPlayers, setMaxPlayers] = useState<number>(4);

  // 加入房间表单 (输入框的临时状态)
  const[joinMatchId, setJoinMatchId] = useState<string>('');

  // 错误信息
  const [error, setError] = useState<string>('');

  /**
   * 处理登录/注册
   */
  const handleConnect = async () => {
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }

    if (password.length < 8) {
      setError('密码至少需要 8 位');
      return;
    }

    try {
      setError('');
      // 使用用户名 + 密码认证 (自动注册或登录)
      const session = await gameService.loginWithPassword(username, password, isRegister);
      if (session.user_id) {
        setMyPlayerId(session.user_id);
      }
      console.log('[HomeScene] 登录成功', { userId: session.user_id, username });
    } catch (err: unknown) {
      const message = await getErrorMessage(err);
      setError(`登录失败：${message}`);
      console.error('[HomeScene] 登录失败', err);
    }
  };

  /**
   * 处理创建房间
   */
  const handleCreateRoom = async () => {
    try {
      setError('');
      await gameService.createRoom(faction, maxPlayers);
      console.log('[HomeScene] 房间创建成功');
    } catch (err: unknown) {
      const message = await getErrorMessage(err);
      setError(`创建房间失败：${message}`);
      console.error('[HomeScene] 创建房间失败', err);
    }
  };

  /**
   * 处理加入房间
   */
  const handleJoinRoom = async () => {
    if (!joinMatchId) {
      setError('请输入房间 ID');
      return;
    }

    try {
      setError('');
      await gameService.joinRoom(joinMatchId);
      console.log('[HomeScene] 加入房间成功');
    } catch (err: unknown) {
      const message = await getErrorMessage(err);
      setError(`加入房间失败：${message}`);
      console.error('[HomeScene] 加入房间失败', err);
    }
  };

  // 已登录状态
  if (session) {
    return (
      <div style={styles.page}>
        <div style={styles.mask}>
          <div style={styles.container}>
            <img
              src="/assets/cover_logo.png"
              alt="logo"
              style={styles.logoImage}
              onError={(e: any) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div style={styles.header}>
              <h2 style={styles.title}>欢迎！</h2>
              <button onClick={() => gameService.logout()} style={styles.logoutButton}>
                登出
              </button>
            </div>
            <p style={styles.info} title={myPlayerId}>用户名：{displayName || '加载中...'}</p>

            {matchId && (
              <div style={styles.roomInfo}>
                <h3>当前房间</h3>
                <p style={styles.matchId}>房间 ID: {matchId}</p>
                <button onClick={() => navigator.clipboard.writeText(matchId)} style={styles.copyButton}>
                  复制 ID
                </button>
              </div>
            )}

            <div style={styles.section}>
              <h3>创建房间</h3>
              <div style={styles.formGroup}>
                <label>阵营：</label>
                <select
                  value={faction}
                  onChange={(e) => setFaction(e.target.value)}
                  style={styles.select}
                >
                  <option value="qing_long">青龙</option>
                  <option value="zhu_que">朱雀</option>
                  <option value="bai_hu">白虎</option>
                  <option value="xuan_wu">玄武</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label>最大玩家数：</label>
                <select
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                  style={styles.select}
                >
                  <option value={2}>2 人</option>
                  <option value={3}>3 人</option>
                  <option value={4}>4 人</option>
                </select>
              </div>
              <button onClick={handleCreateRoom} style={styles.button}>
                创建房间
              </button>
            </div>

            <div style={styles.section}>
              <h3>加入房间</h3>
              <div style={styles.formGroup}>
                <label>房间 ID：</label>
                <input
                  type="text"
                  value={joinMatchId}
                  onChange={(e) => setJoinMatchId(e.target.value)}
                  placeholder="输入房间 ID"
                  style={styles.input}
                />
              </div>
              <button onClick={handleJoinRoom} style={styles.button}>
                加入房间
              </button>
            </div>

            {error && <p style={styles.error}>{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  // 未登录状态
  return (
    <div style={styles.page}>
      <div style={styles.mask}>
        <div style={styles.container}>
          {/* 将原本的 "ParaDiced 派乐代" 文字替换为 Logo 图 */}
          <img
            src="/assets/cover_logo.png"
            alt="logo"
            style={styles.logoImage}
            onError={(e: any) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <p style={styles.subtitle}>回合制派对游戏</p>

          <div style={styles.section}>
            <h3>{isRegister ? '注册账号' : '登录'}</h3>
            <div style={styles.formGroup}>
              <label>用户名：</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="输入用户名"
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label>密码：</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
                style={styles.input}
              />
            </div>
            <button onClick={handleConnect} style={styles.button}>
              {isRegister ? '注册' : '登录'}
            </button>
            <div style={styles.toggleContainer}>
              <span style={styles.toggleText}>
                {isRegister ? '已有账号？' : '没有账号？'}
              </span>
              <button
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError('');
                }}
                style={styles.toggleButton}
              >
                {isRegister ? '去登录' : '去注册'}
              </button>
            </div>
          </div>

          {error && <p style={styles.error}>{error}</p>}
        </div>
      </div>
    </div>
  );
};

// 简单样式
const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    maxWidth: '400px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: {
    textAlign: 'center',
    fontSize: '24px',
    marginBottom: '8px',
  },
  logoutButton: {
    padding: '6px 12px',
    backgroundColor: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  subtitle: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#666',
    marginBottom: '24px',
  },
  section: {
    marginBottom: '24px',
    padding: '16px',
    border: '1px solid #ddd',
    borderRadius: '8px',
  },
  formGroup: {
    marginBottom: '12px',
  },
  input: {
    width: '100%',
    padding: '8px',
    marginTop: '4px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '8px',
    marginTop: '4px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    padding: '10px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
  },
  error: {
    color: 'red',
    fontSize: '14px',
    marginTop: '8px',
  },
  info: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '4px',
  },
  roomInfo: {
    marginBottom: '16px',
    padding: '12px',
    border: '1px solid #4CAF50',
    borderRadius: '8px',
    backgroundColor: '#f0f8f0',
  },
  matchId: {
    fontSize: '12px',
    color: '#333',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
    marginBottom: '8px',
  },
  copyButton: {
    padding: '6px 12px',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  toggleContainer: {
    marginTop: '12px',
    textAlign: 'center',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '8px',
  },
  toggleText: {
    fontSize: '14px',
    color: '#666',
  },
  toggleButton: {
    padding: '4px 8px',
    backgroundColor: 'transparent',
    color: '#2196F3',
    border: '1px solid #2196F3',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  // 页面背景与蒙版样式
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundImage: "url('/assets/cover.png')",
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    padding: '40px',
    boxSizing: 'border-box',
  },
  mask: {
    maxWidth: '720px',
    width: '100%',
    background: 'rgba(255,255,255,0.85)',
    borderRadius: '12px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  logoImage: {
    width: '220px',
    height: 'auto',
    objectFit: 'contain',
    display: 'block',
    margin: '0 auto 8px auto', // 居中并增加底边距(替代原来h2留下的间隙)
  },
};

export default HomeScene;