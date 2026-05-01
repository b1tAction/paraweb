/**
 * HomeScene - 主菜单场景
 *
 * 提供用户名登录、创建房间和加入房间功能
 */

import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { gameService } from '../service/NakamaService';

const factionOptions = [
  { value: 'qing_long', label: '青龙', figure: '/assets/figures/green_idle.png' },
  { value: 'zhu_que', label: '朱雀', figure: '/assets/figures/red_idle.png' },
  { value: 'bai_hu', label: '白虎', figure: '/assets/figures/white_idle.png' },
  { value: 'xuan_wu', label: '玄武', figure: '/assets/figures/black_idle.png' },
] as const;

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

  // Login form state (username only)
  const [username, setUsername] = useState<string>('');

  // Server config
  const [serverHost, setServerHost] = useState<string>('');
  const [serverPort, setServerPort] = useState<string>('');
  const [serverSSL, setServerSSL] = useState<boolean>(false);
  const [useCustomServerOptions, setUseCustomServerOptions] = useState<boolean>(false);
  const [showServerConfig, setShowServerConfig] = useState<boolean>(false);
  const [isStartPressed, setIsStartPressed] = useState<boolean>(false);
  const [pressedRoomAction, setPressedRoomAction] = useState<'create' | 'join' | null>(null);

  // Create room form
  const [faction, setFaction] = useState<string>('qing_long');
  const [maxPlayers, setMaxPlayers] = useState<number>(4);

  // Join room form
  const [joinMatchId, setJoinMatchId] = useState<string>('');

  // Error message
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const cfg = gameService.getServerConfig();
    setServerHost(cfg.host);
    setServerPort(cfg.port);
    setServerSSL(cfg.useSSL);
  }, []);

  /**
   * Handle username-only login (no password required)
   */
  const handleConnect = async () => {
    if (!username.trim()) {
      setError('请输入昵称');
      return;
    }

    try {
      setError('');
      const session = await gameService.loginByUsername(username.trim());
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

  const handleSaveServerConfig = () => {
    try {
      const current = gameService.getServerConfig();
      const portToSave = useCustomServerOptions ? serverPort : current.port;
      const sslToSave = useCustomServerOptions ? serverSSL : current.useSSL;

      gameService.setServerConfig(serverHost, portToSave, sslToSave);
      setError('');
      console.log('[HomeScene] 服务器配置保存成功', {
        host: serverHost,
        port: portToSave,
        ssl: sslToSave,
      });
    } catch (err: any) {
      setError(`服务器配置无效：${err?.message || '未知错误'}`);
    }
  };

  const handleUsernameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      void handleConnect();
    }
  };

  const getRoomActionButtonStyle = (action: 'create' | 'join'): React.CSSProperties => ({
    ...styles.button,
    ...styles.roomActionButton,
    ...(pressedRoomAction === action ? styles.roomActionButtonPressed : undefined),
  });

  const selectedFaction = factionOptions.find((option) => option.value === faction) ?? factionOptions[0];

  /**
   * 处理创建房间
   */
  const handleCreateRoom = async () => {
    try {
      setError('');
      useGameStore.getState().setFaction(faction);
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
      useGameStore.getState().setFaction(faction);
      await gameService.joinRoom(joinMatchId, { faction });
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
      <div style={{ ...styles.page, ...styles.sessionPage }}>
        <div style={styles.dimOverlay} aria-hidden="true" />
        <div style={styles.sessionLayout}>
          <div style={{ ...styles.mask, ...styles.sessionMask }}>
            <div style={{ ...styles.container, ...styles.sessionContainer }}>
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
                <button
                  onClick={handleCreateRoom}
                  onPointerDown={() => setPressedRoomAction('create')}
                  onPointerUp={() => setPressedRoomAction(null)}
                  onPointerLeave={() => setPressedRoomAction(null)}
                  onPointerCancel={() => setPressedRoomAction(null)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      setPressedRoomAction('create');
                    }
                  }}
                  onKeyUp={() => setPressedRoomAction(null)}
                  style={getRoomActionButtonStyle('create')}
                >
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
                <button
                  onClick={handleJoinRoom}
                  onPointerDown={() => setPressedRoomAction('join')}
                  onPointerUp={() => setPressedRoomAction(null)}
                  onPointerLeave={() => setPressedRoomAction(null)}
                  onPointerCancel={() => setPressedRoomAction(null)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      setPressedRoomAction('join');
                    }
                  }}
                  onKeyUp={() => setPressedRoomAction(null)}
                  style={getRoomActionButtonStyle('join')}
                >
                  加入房间
                </button>
              </div>

              {error && <p style={styles.error}>{error}</p>}
            </div>
          </div>

          <aside style={styles.factionPanel}>
            <h3 style={styles.factionTitle}>选择阵营</h3>
            <div style={styles.figureStage}>
              <div
                style={styles.factionFigureViewport}
                role="img"
                aria-label={selectedFaction.label}
              >
                <img
                  src={selectedFaction.figure}
                  alt=""
                  aria-hidden="true"
                  className="paradice-figure-idle"
                  style={styles.factionFigureSprite}
                />
              </div>
            </div>
            <div style={styles.factionName}>{selectedFaction.label}</div>
            <div style={styles.factionGrid}>
              {factionOptions.map((option) => {
                const isSelected = option.value === faction;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFaction(option.value)}
                    style={{
                      ...styles.factionButton,
                      ...(isSelected ? styles.factionButtonSelected : undefined),
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  // 未登录状态
  return (
    <div style={styles.page}>
      <div style={styles.leftColumn}>
        <img
          src="/assets/logo.png"
          alt="logo"
          style={styles.standaloneLogo}
          onError={(e: any) => {
            e.currentTarget.style.display = 'none';
          }}
        />

        <div style={styles.mask}>
          <div style={{ ...styles.container, ...styles.homeContainer }}>
            <div style={styles.loginPanel}>
              <div style={styles.loginFormGroup}>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={handleUsernameKeyDown}
                  placeholder="输入昵称"
                  style={{ ...styles.input, ...styles.heroInput }}
                />
              </div>
              <button
                onClick={handleConnect}
                onPointerDown={() => setIsStartPressed(true)}
                onPointerUp={() => setIsStartPressed(false)}
                onPointerLeave={() => setIsStartPressed(false)}
                onPointerCancel={() => setIsStartPressed(false)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    setIsStartPressed(true);
                  }
                }}
                onKeyUp={() => setIsStartPressed(false)}
                style={{
                  ...styles.button,
                  ...styles.startButton,
                  ...(isStartPressed ? styles.startButtonPressed : undefined),
                }}
              >
                开始游戏
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowServerConfig((visible) => !visible)}
              style={styles.customButton}
              aria-expanded={showServerConfig}
            >
              Custom
            </button>

            {showServerConfig && (
              <div style={styles.serverPanel}>
                <h3 style={styles.serverTitle}>服务器配置</h3>
                <div style={styles.formGroup}>
                  <label>Host：</label>
                  <input
                    type="text"
                    value={serverHost}
                    onChange={(e) => setServerHost(e.target.value)}
                    placeholder="例如 127.0.0.1 或 your.server.com"
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroupInline}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={useCustomServerOptions}
                      onChange={(e) => setUseCustomServerOptions(e.target.checked)}
                    />{' '}
                    自定义端口和 SSL
                  </label>
                </div>
                {useCustomServerOptions && (
                  <>
                    <div style={styles.formGroup}>
                      <label>Port：</label>
                      <input
                        type="text"
                        value={serverPort}
                        onChange={(e) => setServerPort(e.target.value)}
                        placeholder="7350"
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.formGroupInline}>
                      <label style={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={serverSSL}
                          onChange={(e) => setServerSSL(e.target.checked)}
                        />{' '}
                        使用 SSL
                      </label>
                    </div>
                  </>
                )}
                <button onClick={handleSaveServerConfig} style={styles.secondaryButton}>
                  保存服务器配置
                </button>
              </div>
            )}

            {error && <p style={styles.error}>{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

// Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    maxWidth: '400px',
    margin: '0 auto',
  },
  homeContainer: {
    width: '100%',
    maxWidth: '420px',
    padding: '8px 0 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
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
    color: 'inherit',
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
    marginBottom: '18px',
    padding: '14px',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.06)',
  },
  formGroup: {
    marginBottom: '12px',
  },
  formGroupInline: {
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    marginTop: '4px',
    border: '1px solid rgba(43, 91, 67, 0.32)',
    borderRadius: '8px',
    boxSizing: 'border-box',
    background: 'rgba(250,255,248,0.94)',
    color: '#183127',
    outline: 'none',
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
    padding: '12px',
    backgroundColor: '#2f8f55',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    boxShadow: '0 5px 0 #1d5f38, 0 12px 24px rgba(23, 74, 44, 0.24)',
  },
  secondaryButton: {
    width: '100%',
    padding: '10px',
    backgroundColor: '#25513d',
    color: '#f8fff8',
    border: '1px solid rgba(248,255,248,0.24)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  error: {
    color: '#9d2424',
    fontSize: '14px',
    marginTop: '14px',
    padding: '10px 12px',
    background: 'rgba(255, 236, 232, 0.92)',
    border: '1px solid rgba(157, 36, 36, 0.2)',
    borderRadius: '8px',
  },
  info: {
    fontSize: '14px',
    color: 'inherit',
    marginBottom: '4px',
  },
  roomInfo: {
    marginBottom: '16px',
    padding: '12px',
    border: '1px solid rgba(120, 210, 140, 0.5)',
    borderRadius: '8px',
    backgroundColor: 'rgba(20, 80, 45, 0.35)',
  },
  matchId: {
    fontSize: '12px',
    color: 'inherit',
    fontFamily: 'inherit',
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
  // page background and mask styles
  page: {
    minHeight: '100vh',
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundImage: "url('/assets/cover.png')",
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    padding: '48px 24px 48px clamp(24px, 6vw, 96px)',
    boxSizing: 'border-box',
  },
  dimOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.42)',
    pointerEvents: 'none',
    zIndex: 0,
  },
  sessionPage: {
    justifyContent: 'center',
    padding: '48px clamp(24px, 5vw, 88px)',
  },
  sessionLayout: {
    width: '100%',
    maxWidth: '1280px',
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    gridTemplateColumns: '560px minmax(280px, 360px)',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 'clamp(32px, 7vw, 96px)',
  },
  leftColumn: {
    width: 'min(94vw, clamp(480px, 36vw, 700px))',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '18px',
    position: 'relative',
    zIndex: 1,
  },
  standaloneLogo: {
    width: 'min(133%, 960px)',
    height: 'auto',
    objectFit: 'contain',
    display: 'block',
    imageRendering: 'pixelated',
    filter: 'drop-shadow(0 16px 22px rgba(0,0,0,0.42))',
  },
  mask: {
    maxWidth: 'none',
    width: '88%',
    position: 'relative',
    zIndex: 1,
    background: 'transparent',
    border: 'none',
    borderRadius: 0,
    boxShadow: 'none',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14px',
  },
  sessionMask: {
    width: '560px',
    minHeight: '780px',
    backgroundColor: 'transparent',
    backgroundImage: "url('/assets/frame/big_stone_frame.png')",
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    border: 'none',
    borderRadius: 0,
    boxShadow: '0 28px 46px rgba(0,0,0,0.38)',
    padding: '70px 58px 58px',
    boxSizing: 'border-box',
    imageRendering: 'pixelated',
  },
  sessionContainer: {
    width: '100%',
    maxWidth: 'none',
    height: '100%',
    overflow: 'auto',
    color: '#f8fff8',
  },
  factionPanel: {
    minHeight: '620px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#f8fff8',
    textAlign: 'center',
  },
  factionTitle: {
    margin: '0 0 22px',
    fontSize: '30px',
    lineHeight: 1.3,
    textShadow: '0 4px 12px rgba(0,0,0,0.55)',
  },
  figureStage: {
    width: 'min(320px, 28vw)',
    height: 'min(390px, 48vh)',
    minWidth: '240px',
    minHeight: '320px',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    padding: '18px',
    boxSizing: 'border-box',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: '14px',
    boxShadow: '0 24px 44px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.14)',
    backdropFilter: 'blur(2px)',
  },
  factionFigureViewport: {
    width: 'min(500px, 100%)',
    aspectRatio: '1 / 1',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    imageRendering: 'pixelated',
    filter: 'drop-shadow(0 18px 18px rgba(0,0,0,0.48))',
  },
  factionFigureSprite: {
    width: '400%',
    maxWidth: 'none',
    height: '100%',
    objectFit: 'fill',
    flex: '0 0 auto',
    imageRendering: 'pixelated',
  },
  factionName: {
    marginTop: '18px',
    marginBottom: '18px',
    fontSize: '28px',
    textShadow: '0 4px 12px rgba(0,0,0,0.55)',
  },
  factionGrid: {
    width: '100%',
    maxWidth: '360px',
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
  },
  factionButton: {
    minHeight: '48px',
    padding: '10px 12px',
    color: '#f8fff8',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.24)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '18px',
    textShadow: '0 2px 6px rgba(0,0,0,0.45)',
    boxShadow: '0 10px 20px rgba(0,0,0,0.18)',
  },
  factionButtonSelected: {
    color: '#273026',
    background: 'rgba(244, 238, 210, 0.94)',
    borderColor: '#f4e6a8',
    textShadow: '0 1px 0 rgba(255,255,255,0.7)',
    boxShadow: '0 0 0 3px rgba(244, 230, 168, 0.22), 0 14px 24px rgba(0,0,0,0.24)',
  },
  logoImage: {
    width: 'min(360px, 82vw)',
    height: 'auto',
    objectFit: 'contain',
    display: 'block',
    margin: '0 auto 26px auto', // 居中并增加底边距(替代原来h2留下的间隙)
    filter: 'drop-shadow(0 8px 14px rgba(70, 37, 14, 0.2))',
  },
  loginPanel: {
    width: '100%',
    padding: '20px 4px 8px',
  },
  loginTitle: {
    margin: '0 0 22px',
    textAlign: 'center',
    fontSize: '28px',
    lineHeight: 1.4,
    color: '#f8fff8',
    textShadow: '0 2px 8px rgba(0,0,0,0.28)',
  },
  loginFormGroup: {
    marginBottom: '20px',
  },
  heroInput: {
    minHeight: '58px',
    marginTop: 0,
    fontSize: '20px',
    textAlign: 'center',
    borderColor: 'rgba(205, 240, 211, 0.5)',
    boxShadow: 'inset 0 2px 4px rgba(20, 54, 37, 0.1), 0 10px 22px rgba(0,0,0,0.12)',
  },
  startButton: {
    width: 'min(320px, 78vw)',
    aspectRatio: '112 / 60',
    display: 'block',
    margin: '0 auto',
    minHeight: '74px',
    fontSize: '24px',
    letterSpacing: 0,
    color: '#3c3833',
    backgroundColor: 'transparent',
    backgroundImage: "url('/assets/button/button_up.png')",
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    border: 'none',
    borderRadius: 0,
    boxShadow: 'none',
    textShadow: '0 1px 0 rgba(255,255,255,0.7)',
    imageRendering: 'pixelated',
  },
  startButtonPressed: {
    backgroundImage: "url('/assets/button/button_press.png')",
    transform: 'translateY(2px)',
  },
  roomActionButton: {
    width: 'min(300px, 100%)',
    aspectRatio: '112 / 60',
    display: 'block',
    margin: '14px auto 0',
    padding: 0,
    color: '#3c3833',
    backgroundColor: 'transparent',
    backgroundImage: "url('/assets/button/button_up.png')",
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    border: 'none',
    borderRadius: 0,
    boxShadow: 'none',
    fontSize: '20px',
    textShadow: '0 1px 0 rgba(255,255,255,0.75)',
    imageRendering: 'pixelated',
  },
  roomActionButtonPressed: {
    backgroundImage: "url('/assets/button/button_press.png')",
    transform: 'translateY(2px)',
  },
  customButton: {
    alignSelf: 'center',
    marginTop: '18px',
    padding: '10px 20px',
    color: '#f8fff8',
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(220,255,225,0.22)',
    borderRadius: '999px',
    cursor: 'pointer',
    fontSize: '16px',
  },
  serverPanel: {
    width: '100%',
    marginTop: '12px',
    padding: '16px',
    background: 'rgba(11, 23, 20, 0.72)',
    color: '#f8fff8',
    border: '1px solid rgba(220,255,225,0.18)',
    borderRadius: '12px',
    boxShadow: '0 14px 28px rgba(0,0,0,0.22)',
  },
  serverTitle: {
    margin: '0 0 14px',
    fontSize: '15px',
    color: '#f8fff8',
  },
  checkboxLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    lineHeight: 1.5,
  },
};

export default HomeScene;
