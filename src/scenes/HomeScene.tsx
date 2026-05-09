/**
 * StartScene - first step before room browsing.
 */

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { gameService } from '../service/NakamaService';
import { Scene, useGameStore } from '../store/gameStore';
import { assetCssUrl, assetImageCssUrl, assetUrl } from '../utils/assets';

async function getErrorMessage(err: unknown): Promise<string> {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  try {
    return JSON.stringify(err);
  } catch {
    return '未知错误';
  }
}

export const StartScene: React.FC = () => {
  const { session, displayName } = useGameStore();
  const [nickname, setNickname] = useState('');
  const hasHydratedNicknameRef = useRef(false);
  const [serverEndpoint, setServerEndpoint] = useState('');
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStartPressed, setIsStartPressed] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const cfg = gameService.getServerConfig();
    setServerEndpoint(cfg.endpoint);
  }, []);

  useEffect(() => {
    if (displayName && !hasHydratedNicknameRef.current) {
      setNickname(displayName);
      hasHydratedNicknameRef.current = true;
    }
  }, [displayName]);

  const handleSaveServerConfig = () => {
    try {
      gameService.setServerConfig(serverEndpoint);
      setServerEndpoint(gameService.getServerConfig().endpoint);
      setError('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '未知错误';
      setError(`服务器配置无效：${message}`);
    }
  };

  const handleStart = async () => {
    const trimmedName = nickname.trim();
    if (!trimmedName) {
      setError('请输入昵称');
      return;
    }

    try {
      setError('');
      setIsStarting(true);
      if (!session) {
        await gameService.autoLogin();
      }
      await gameService.updateDisplayName(trimmedName);
      useGameStore.getState().setScene(Scene.JoinRoom);
    } catch (err: unknown) {
      const message = await getErrorMessage(err);
      setError(`开始失败：${message}`);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <main style={styles.page}>
      <img
        src={assetUrl('assets/logo.png')}
        alt="ParaDiced"
        style={styles.logo}
        onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
          e.currentTarget.style.display = 'none';
        }}
      />

      <section style={styles.panel} aria-label="start">
        <label style={styles.label} aria-label="昵称">
          <input
            value={nickname}
            onChange={(e) => {
              hasHydratedNicknameRef.current = true;
              setNickname(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleStart();
            }}
            placeholder="输入昵称"
            style={styles.input}
            maxLength={20}
          />
        </label>

        <button
          type="button"
          onClick={handleStart}
          disabled={isStarting}
          style={{
            ...styles.primaryButton,
            ...(isStartPressed ? styles.primaryButtonPressed : undefined),
            ...(isStarting ? styles.primaryButtonDisabled : undefined),
          }}
          onPointerDown={() => setIsStartPressed(true)}
          onPointerUp={() => setIsStartPressed(false)}
          onPointerLeave={() => setIsStartPressed(false)}
          onPointerCancel={() => setIsStartPressed(false)}
          onKeyDown={(event) => {
            if (event.key === ' ' || event.key === 'Enter') {
              setIsStartPressed(true);
            }
          }}
          onKeyUp={() => setIsStartPressed(false)}
        >
          {isStarting ? '连接中...' : '开始游戏'}
        </button>

        <button type="button" onClick={() => setShowServerConfig((visible) => !visible)} style={styles.linkButton}>
          SERVER
        </button>

        {showServerConfig && (
          <div style={styles.serverPanel}>
            <label style={styles.label}>
              SERVER ADDRESS
              <input
                type="text"
                value={serverEndpoint}
                onChange={(e) => setServerEndpoint(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveServerConfig();
                }}
                placeholder="https://bitaction.cn"
                style={styles.input}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <button type="button" onClick={handleSaveServerConfig} style={styles.secondaryButton}>
              SAVE
            </button>
          </div>
        )}

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
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '28px',
    padding: '24px',
    backgroundImage: assetImageCssUrl('assets/cover.png'),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    fontFamily: 'Zpix, sans-serif',
    color: '#fff7d6',
  },
  logo: {
    width: 'min(640px, 86vw)',
    display: 'block',
    alignSelf: 'center',
    margin: '0 auto',
    imageRendering: 'pixelated',
    filter: 'drop-shadow(0 12px 20px rgba(0,0,0,0.45))',
  },
  panel: {
    width: 'min(420px, calc(100vw - 40px))',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '22px',
    background: 'rgba(19, 32, 33, 0.72)',
    border: '1px solid rgba(255, 233, 172, 0.38)',
    borderRadius: '8px',
    boxShadow: '0 18px 44px rgba(0, 0, 0, 0.34)',
    backdropFilter: 'blur(3px)',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '7px',
    fontSize: '13px',
    color: '#f6df9e',
  },
  input: {
    width: 'min(320px, 100%)',
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
  primaryButton: {
    width: 'min(260px, 76vw)',
    aspectRatio: '112 / 60',
    alignSelf: 'center',
    minHeight: 0,
    padding: 0,
    color: '#352c20',
    backgroundImage: assetCssUrl('assets/button/button_up.png'),
    backgroundSize: '100% 100%',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '17px',
    imageRendering: 'pixelated',
    boxShadow: 'none',
  },
  primaryButtonPressed: {
    backgroundImage: assetCssUrl('assets/button/button_press.png'),
    transform: 'translateY(2px)',
  },
  primaryButtonDisabled: {
    filter: 'grayscale(0.7)',
    opacity: 0.72,
    cursor: 'not-allowed',
  },
  secondaryButton: {
    minHeight: '38px',
    color: '#fff7d6',
    background: 'rgba(255, 247, 214, 0.1)',
    border: '1px solid rgba(255, 247, 214, 0.35)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  linkButton: {
    alignSelf: 'center',
    color: '#d6c38a',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '12px',
  },
  serverPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    paddingTop: '4px',
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

export const HomeScene = StartScene;
export default StartScene;
