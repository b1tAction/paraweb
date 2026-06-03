/**
 * App.tsx - 根组件
 *
 * 根据当前场景路由到不同的组件
 */

import React, { Suspense, useEffect, useRef, useState } from 'react';
import {
  BoardScene,
  CreateRoomScene,
  FactionSelectScene,
  GameOverScene,
  HomeScene,
  JoinRoomScene,
  LobbyScene,
  MiniGameBoardScene,
  MiniGameSubmitRankScene,
} from './scenes';
import { SceneStatusPanel } from './scenes/SceneStatusPanel';
import { checkForUpdate, type DesktopUpdateCheckResult, openExternalUrl } from './service/updateService';
import { Scene, useGameStore } from './store/gameStore';
import { playBoardBgm, stopBoardBgm } from './utils/boardBgm';
import { playEndBgm, stopEndBgm } from './utils/endBgm';
import { playMiniGameBgm, stopMiniGameBgm } from './utils/miniGameBgm';
import { playStartBgm, stopStartBgm } from './utils/startBgm';

// DEV-mode debug tools — tree-shaken in production builds
const DevPanel = import.meta.env.DEV
  ? React.lazy(() => import('./components/DevPanel').then((m) => ({ default: m.DevPanel })))
  : null;

if (import.meta.env.DEV) {
  void import('./components/devConsoleApi');
}

const MINI_GAME_GUIDE_DURATION_MS = 4200;
const MINI_GAME_INTRO_DURATION_MS = 2500;
const BOARD_BGM_FADE_OUT_MS = 800;
const MINI_GAME_BGM_LEAD_IN_MS = 700;
const MINI_GAME_BGM_FADE_IN_MS = 1000;

type MiniGameIntroPhase = 'guide' | 'start' | null;

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
  [Scene.MiniGameBoard]: MiniGameBoardScene,
};

/**
 * 加载中场景
 */
function LoadingScene() {
  return (
    <SceneStatusPanel
      title="加载中..."
      variant="loading"
    />
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
    <SceneStatusPanel
      eyebrow="Round Reward"
      title="骰子分配中..."
      variant="dice"
    />
  );
}

/**
 * Boss 战斗场景
 */
function BossBattleScene() {
  return (
    <SceneStatusPanel
      eyebrow="Boss Battle"
      title="Boss 战斗中..."
      variant="boss"
      accent="red"
    />
  );
}

/**
 * 主应用组件
 */
const App: React.FC = () => {
  const currentScene = useGameStore((state) => state.currentScene);
  const [desktopUpdate, setDesktopUpdate] = useState<DesktopUpdateCheckResult | null>(null);
  const [isUpdateDismissed, setIsUpdateDismissed] = useState(false);
  const [miniGameIntroPhase, setMiniGameIntroPhase] = useState<MiniGameIntroPhase>(null);
  const miniGameIntroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const miniGameAudioLeadInTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const miniGameTransitionRef = useRef({
    fromBoard: false,
    miniGameAudioStarted: false,
  });
  const previousSceneRef = useRef<Scene | null>(null);

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

  useEffect(() => {
    const isMiniGameScene = currentScene === Scene.MiniGameSubmitRank;
    const previousScene = previousSceneRef.current;

    if (isMiniGameScene) {
      const transitionFromBoard = previousScene === Scene.Board;
      miniGameTransitionRef.current = {
        fromBoard: transitionFromBoard,
        miniGameAudioStarted: false,
      };

      if (miniGameIntroTimerRef.current) {
        clearTimeout(miniGameIntroTimerRef.current);
      }
      if (miniGameAudioLeadInTimerRef.current) {
        clearTimeout(miniGameAudioLeadInTimerRef.current);
      }

      const store = useGameStore.getState();
      const shouldShowGuide = !store.miniGameGuideSeen;
      const shouldShowIntro = transitionFromBoard || shouldShowGuide;

      if (shouldShowIntro) {
        const totalIntroDuration = shouldShowGuide ? MINI_GAME_GUIDE_DURATION_MS : MINI_GAME_INTRO_DURATION_MS;
        setMiniGameIntroPhase(shouldShowGuide ? 'guide' : 'start');
        if (shouldShowGuide) {
          store.setMiniGameGuideSeen(true);
        }

        stopBoardBgm(false, BOARD_BGM_FADE_OUT_MS);
        stopMiniGameBgm(true, 0);

        miniGameAudioLeadInTimerRef.current = setTimeout(() => {
          if (
            useGameStore.getState().currentScene === Scene.MiniGameSubmitRank &&
            !miniGameTransitionRef.current.miniGameAudioStarted
          ) {
            playMiniGameBgm(MINI_GAME_BGM_FADE_IN_MS);
            miniGameTransitionRef.current.miniGameAudioStarted = true;
          }
          miniGameAudioLeadInTimerRef.current = null;
        }, Math.max(0, totalIntroDuration - MINI_GAME_BGM_LEAD_IN_MS));

        miniGameIntroTimerRef.current = setTimeout(() => {
          setMiniGameIntroPhase(null);
          miniGameIntroTimerRef.current = null;
        }, totalIntroDuration);
      } else {
        setMiniGameIntroPhase(null);
        playMiniGameBgm(0);
        miniGameTransitionRef.current.miniGameAudioStarted = true;
      }

      return;
    }

    setMiniGameIntroPhase(null);
    if (miniGameIntroTimerRef.current) {
      clearTimeout(miniGameIntroTimerRef.current);
      miniGameIntroTimerRef.current = null;
    }
    if (miniGameAudioLeadInTimerRef.current) {
      clearTimeout(miniGameAudioLeadInTimerRef.current);
      miniGameAudioLeadInTimerRef.current = null;
    }
    miniGameTransitionRef.current = {
      fromBoard: false,
      miniGameAudioStarted: false,
    };
  }, [currentScene]);

  useEffect(() => {
    return () => {
      if (miniGameIntroTimerRef.current) {
        clearTimeout(miniGameIntroTimerRef.current);
        miniGameIntroTimerRef.current = null;
      }
      if (miniGameAudioLeadInTimerRef.current) {
        clearTimeout(miniGameAudioLeadInTimerRef.current);
        miniGameAudioLeadInTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const previousScene = previousSceneRef.current;
    const isPrepScene =
      currentScene === Scene.Home ||
      currentScene === Scene.CreateRoom ||
      currentScene === Scene.JoinRoom ||
      currentScene === Scene.FactionSelect ||
      currentScene === Scene.Lobby ||
      currentScene === Scene.Loading ||
      currentScene === Scene.DiceAssign;
    const isMiniGameScene = currentScene === Scene.MiniGameSubmitRank;
    const isBoardScene = currentScene === Scene.Board;
    const isGameOverScene = currentScene === Scene.GameOver;
    const transition = miniGameTransitionRef.current;
    const isBoardMiniGameReturn = previousScene === Scene.MiniGameSubmitRank && isBoardScene;

    if (isPrepScene) {
      playStartBgm();
      stopBoardBgm();
      stopEndBgm();
      stopMiniGameBgm();
      previousSceneRef.current = currentScene;
      return;
    }

    stopStartBgm();

    if (isBoardScene) {
      playBoardBgm(isBoardMiniGameReturn ? MINI_GAME_BGM_FADE_IN_MS : 0);
      stopEndBgm();
      stopMiniGameBgm(false, isBoardMiniGameReturn ? MINI_GAME_BGM_FADE_IN_MS : 0);
      miniGameTransitionRef.current = {
        fromBoard: false,
        miniGameAudioStarted: false,
      };
      previousSceneRef.current = currentScene;
      return;
    }

    if (isMiniGameScene) {
      stopEndBgm();
      stopBoardBgm(false, transition.fromBoard ? BOARD_BGM_FADE_OUT_MS : 0);
      if (!miniGameIntroPhase && !transition.miniGameAudioStarted) {
        playMiniGameBgm(transition.fromBoard ? MINI_GAME_BGM_FADE_IN_MS : 0);
        transition.miniGameAudioStarted = true;
      }
      previousSceneRef.current = currentScene;
      return;
    }

    if (isGameOverScene) {
      stopBoardBgm(true, 0);
      stopMiniGameBgm(true, 0);
      stopStartBgm(true);
      playEndBgm();
      previousSceneRef.current = currentScene;
      return;
    }

    stopBoardBgm();
    stopEndBgm();
    stopMiniGameBgm();
    previousSceneRef.current = currentScene;
  }, [currentScene, miniGameIntroPhase]);

  const isMiniGameOverlay = currentScene === Scene.MiniGameSubmitRank;
  const shouldRenderMiniGameOverlay = isMiniGameOverlay && !miniGameIntroPhase;
  const SceneComponent = isMiniGameOverlay ? BoardScene : sceneComponents[currentScene] || HomeScene;
  const isHomeScene =
    currentScene === Scene.Home ||
    currentScene === Scene.CreateRoom ||
    currentScene === Scene.JoinRoom ||
    currentScene === Scene.FactionSelect;
  const isStandaloneDevScene = currentScene === Scene.MiniGameBoard;
  const shouldRenderAppChrome = !isHomeScene && !isStandaloneDevScene;

  return (
    <div style={isStandaloneDevScene ? { ...styles.app, ...styles.standaloneApp } : styles.app}>
      {desktopUpdate?.hasUpdate && !isUpdateDismissed && (
        <DesktopUpdateNotice update={desktopUpdate} onDismiss={() => setIsUpdateDismissed(true)} />
      )}
      <span className="zpix-font-loader" aria-hidden="true">
        Zpix 中文字体预加载
      </span>
      {shouldRenderAppChrome && (
        <header style={styles.header}>
          <h1 style={styles.logo}>ParaDiced</h1>
          <nav style={styles.nav}>
            <span>场景：{currentScene}</span>
          </nav>
        </header>
      )}
      <main
        style={
          isHomeScene
            ? { ...styles.main, ...styles.homeMain }
            : isStandaloneDevScene
              ? { ...styles.main, ...styles.standaloneMain }
              : styles.main
        }
      >
        <Suspense fallback={<LoadingScene />}>
          <SceneComponent />
        </Suspense>
      </main>

      {isMiniGameOverlay && miniGameIntroPhase && (
        <div style={styles.overlay}>
          {miniGameIntroPhase === 'guide' ? (
            <div style={styles.miniGameGuideCard}>
              <h2 style={styles.miniGameGuideTitle}>用游戏确定顺序</h2>
              <p style={styles.miniGameGuideText}>为决定前进的顺序进行【小游戏】</p>
              <p style={styles.miniGameGuideText}>按照名次依次获得「金、银、铜、木」材质的骰子</p>
              <p style={styles.miniGameGuideHint}>金骰子将更容易掷出高点数</p>
            </div>
          ) : (
            <div style={styles.miniGameIntroCard}>
              <div style={styles.miniGameIntroEyebrow}>Mini Game</div>
              <h2 style={styles.miniGameIntroTitle}>小游戏要开始啦</h2>
              <p style={styles.miniGameIntroText}>准备好，马上进入轻松又刺激的小挑战。</p>
            </div>
          )}
        </div>
      )}

      {shouldRenderMiniGameOverlay && (
        <div style={styles.overlay}>
          <Suspense fallback={<LoadingScene />}>
            <MiniGameSubmitRankScene />
          </Suspense>
        </div>
      )}

      {shouldRenderAppChrome && (
        <footer style={styles.footer}>
          <p>派乐代 - 回合制派对游戏</p>
        </footer>
      )}

      {import.meta.env.DEV && DevPanel && (
        <Suspense fallback={null}>
          <DevPanel />
        </Suspense>
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
  standaloneApp: {
    height: '100dvh',
    minHeight: 0,
    backgroundColor: '#101216',
    overflow: 'hidden',
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
  standaloneMain: {
    minHeight: 0,
    padding: 0,
    overflow: 'hidden',
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
  miniGameIntroCard: {
    width: 'min(760px, calc(100vw - 40px))',
    padding: '48px 42px',
    border: '2px solid rgba(255, 236, 170, 0.62)',
    borderRadius: '8px',
    background: 'linear-gradient(180deg, rgba(28, 25, 18, 0.96) 0%, rgba(48, 36, 21, 0.96) 100%)',
    color: '#fff7d6',
    textAlign: 'center',
    boxShadow: '0 28px 60px rgba(0, 0, 0, 0.38)',
  },
  miniGameIntroEyebrow: {
    marginBottom: '14px',
    color: '#f6df9e',
    fontSize: '16px',
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  miniGameIntroTitle: {
    margin: 0,
    fontSize: '42px',
    lineHeight: 1.2,
  },
  miniGameIntroText: {
    margin: '18px 0 0',
    color: 'rgba(255, 247, 214, 0.88)',
    fontSize: '22px',
    lineHeight: 1.6,
  },
  miniGameGuideCard: {
    width: 'min(820px, calc(100vw - 40px))',
    padding: '46px 44px',
    border: '2px solid rgba(255, 236, 170, 0.66)',
    borderRadius: '8px',
    background: 'linear-gradient(180deg, rgba(28, 25, 18, 0.97) 0%, rgba(50, 38, 22, 0.97) 100%)',
    color: '#fff7d6',
    textAlign: 'center',
    boxShadow: '0 28px 60px rgba(0, 0, 0, 0.38)',
  },
  miniGameGuideTitle: {
    margin: '0 0 22px',
    fontSize: '42px',
    lineHeight: 1.2,
  },
  miniGameGuideText: {
    margin: '10px 0 0',
    color: 'rgba(255, 247, 214, 0.92)',
    fontSize: '24px',
    lineHeight: 1.55,
  },
  miniGameGuideHint: {
    margin: '18px 0 0',
    color: '#f6df9e',
    fontSize: '24px',
    fontWeight: 800,
    lineHeight: 1.55,
  },
};

export default App;
