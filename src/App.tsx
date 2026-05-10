/**
 * App.tsx - 根组件
 *
 * 根据当前场景路由到不同的组件
 */

import type React from 'react';
import { Suspense, useEffect, useState } from 'react';
import {
  BoardScene,
  CreateRoomScene,
  FactionSelectScene,
  GameOverScene,
  HomeScene,
  JoinRoomScene,
  LobbyScene,
  MiniGameSubmitRankScene,
} from './scenes';
import { checkForUpdate, type DesktopUpdateCheckResult, openExternalUrl } from './service/updateService';
import { Scene, useGameStore } from './store/gameStore';

/**
 * 场景路由配置
 */
const sceneComponents: Record<Scene, React.ComponentType> = {
  [Scene.Home]: HomeScene,
  [Scene.CreateRoom]: CreateRoomScene,
  [Scene.JoinRoom]: JoinRoomScene,
  [Scene.FactionSelect]: FactionSelectScene,
  [Scene.Lobby]: LobbyScene,
  [Scene.Loading]: LoadingScene,
  [Scene.MiniGameSubmitRank]: MiniGameSubmitRankScene,
  [Scene.DiceAssign]: DiceAssignScene,
  [Scene.Board]: BoardScene,
  [Scene.BossBattle]: BossBattleScene,
  [Scene.GameOver]: GameOverScene,
};

/**
 * 加载中场景
 */
function LoadingScene() {
  return (
    <div style={styles.container}>
      <h2>加载中...</h2>
      <p>正在初始化游戏</p>
    </div>
  );
}

type DesktopUpdateNoticeProps = {
  update: DesktopUpdateCheckResult;
  onDismiss: () => void;
};

function DesktopUpdateNotice({ update, onDismiss }: DesktopUpdateNoticeProps) {
  const releaseUrl = update.releaseUrl || 'https://github.com/b1tAction/paraweb/releases/latest';

  return (
    <aside style={styles.updateNotice} role="status" aria-live="polite">
      <div style={styles.updateNoticeHeader}>
        <strong style={styles.updateNoticeTitle}>发现新版本</strong>
      </div>
      <p style={styles.updateNoticeText}>
        当前版本 {update.currentVersion}，最新版本 {update.latestVersion || '未知'}
      </p>
      <div style={styles.updateNoticeActions}>
        <button type="button" onClick={() => openExternalUrl(releaseUrl)} style={styles.updateNoticePrimaryButton}>
          查看下载
        </button>
        <button type="button" onClick={onDismiss} style={styles.updateNoticeSecondaryButton}>
          稍后提醒
        </button>
      </div>
    </aside>
  );
}

/**
 * 骰子分配展示场景
 */
function DiceAssignScene() {
  return (
    <div style={styles.container}>
      <h2>骰子分配</h2>
      <p>根据小游戏排名分配骰子类型</p>
      <p>金骰子 (第 1 名) / 银骰子 (第 2 名) / 铜骰子 (第 3 名) / 木骰子 (第 4 名)</p>
    </div>
  );
}

/**
 * Boss 战斗场景
 */
function BossBattleScene() {
  return (
    <div style={styles.container}>
      <h2>Boss 战斗</h2>
      <p>挑战最终 Boss!</p>
    </div>
  );
}

/**
 * 主应用组件
 */
const App: React.FC = () => {
  const currentScene = useGameStore((state) => state.currentScene);
  const [desktopUpdate, setDesktopUpdate] = useState<DesktopUpdateCheckResult | null>(null);
  const [isUpdateDismissed, setIsUpdateDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkUpdate = async () => {
      try {
        const result = await checkForUpdate();
        if (!cancelled && result?.hasUpdate) {
          setDesktopUpdate(result);
        }
      } catch (error) {
        console.warn('[App] 桌面更新检查失败:', error);
      }
    };

    void checkUpdate();

    return () => {
      cancelled = true;
    };
  }, []);

  const isMiniGameOverlay = currentScene === Scene.MiniGameSubmitRank;
  const SceneComponent = isMiniGameOverlay ? BoardScene : sceneComponents[currentScene] || HomeScene;
  const isHomeScene =
    currentScene === Scene.Home ||
    currentScene === Scene.CreateRoom ||
    currentScene === Scene.JoinRoom ||
    currentScene === Scene.FactionSelect;

  return (
    <div style={styles.app}>
      {desktopUpdate?.hasUpdate && !isUpdateDismissed && (
        <DesktopUpdateNotice update={desktopUpdate} onDismiss={() => setIsUpdateDismissed(true)} />
      )}
      <span className="zpix-font-loader" aria-hidden="true">
        Zpix 中文字体预加载
      </span>
      {!isHomeScene && (
        <header style={styles.header}>
          <h1 style={styles.logo}>ParaDiced</h1>
          <nav style={styles.nav}>
            <span>场景：{currentScene}</span>
          </nav>
        </header>
      )}
      <main style={isHomeScene ? { ...styles.main, ...styles.homeMain } : styles.main}>
        <Suspense fallback={<LoadingScene />}>
          <SceneComponent />
        </Suspense>
      </main>

      {isMiniGameOverlay && (
        <div style={styles.overlay}>
          <Suspense fallback={<LoadingScene />}>
            <MiniGameSubmitRankScene />
          </Suspense>
        </div>
      )}

      {!isHomeScene && (
        <footer style={styles.footer}>
          <p>派乐代 - 回合制派对游戏</p>
        </footer>
      )}
    </div>
  );
};

// 简单样式
const styles: Record<string, React.CSSProperties> = {
  app: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#3f51b5',
    color: 'white',
    padding: '16px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    margin: 0,
    fontSize: '24px',
  },
  nav: {
    fontSize: '14px',
    opacity: 0.8,
  },
  main: {
    flex: 1,
    padding: '20px',
  },
  updateNotice: {
    position: 'fixed',
    top: '18px',
    right: '18px',
    zIndex: 1200,
    width: 'min(360px, calc(100vw - 36px))',
    padding: '16px 18px',
    borderRadius: '16px',
    border: '2px solid rgba(255, 248, 215, 0.7)',
    backgroundColor: 'rgba(28, 24, 18, 0.96)',
    color: '#fff8d7',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.28)',
  },
  updateNoticeHeader: {
    marginBottom: '10px',
  },
  updateNoticeTitle: {
    fontSize: '16px',
    lineHeight: 1.2,
  },
  updateNoticeText: {
    margin: '0 0 14px',
    fontSize: '13px',
    lineHeight: 1.6,
    color: 'rgba(255, 248, 215, 0.9)',
  },
  updateNoticeActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },
  updateNoticePrimaryButton: {
    minWidth: '104px',
    padding: '10px 16px',
    border: 'none',
    borderRadius: '999px',
    color: '#332817',
    backgroundColor: '#ffe08a',
    cursor: 'pointer',
  },
  updateNoticeSecondaryButton: {
    minWidth: '104px',
    padding: '10px 16px',
    border: '1px solid rgba(255, 248, 215, 0.45)',
    borderRadius: '999px',
    color: '#fff8d7',
    backgroundColor: 'transparent',
    cursor: 'pointer',
  },
  homeMain: {
    padding: 0,
  },
  footer: {
    backgroundColor: '#333',
    color: 'white',
    padding: '12px 20px',
    textAlign: 'center',
    fontSize: '12px',
  },
  container: {
    padding: '20px',
    textAlign: 'center',
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
};

export default App;
