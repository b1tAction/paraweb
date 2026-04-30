/**
 * App.tsx - 根组件
 *
 * 根据当前场景路由到不同的组件
 */

import React, { useEffect, useState } from 'react';
import { useGameStore, Scene } from './store/gameStore';
import { gameService } from './service/NakamaService';
import {
  HomeScene,
  LobbyScene,
  BoardScene,
  MiniGameSubmitRankScene,
  GameOverScene,
} from './scenes';

/**
 * 场景路由配置
 */
const sceneComponents: Record<Scene, React.ComponentType> = {
  [Scene.Home]: HomeScene,
  [Scene.CreateRoom]: HomeScene, // 暂时复用 HomeScene
  [Scene.JoinRoom]: HomeScene, // 暂时复用 HomeScene
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

  // 用于跟踪是否正在恢复 session
  const [isRestoring, setIsRestoring] = useState(true);

  // 应用启动时尝试恢复 session
  useEffect(() => {
    const tryRestore = async () => {
      try {
        const restored = await gameService.restoreSession();
        console.log('[App] Session 恢复结果:', restored);
      } catch (err) {
        console.error('[App] Session 恢复失败:', err);
      } finally {
        setIsRestoring(false);
      }
    };

    tryRestore();
  }, []);

  // 恢复期间显示加载中
  if (isRestoring) {
    return (
      <div style={styles.app}>
        <span className="zpix-font-loader" aria-hidden="true">
          Zpix 中文字体预加载
        </span>
        <main style={styles.main}>
          <LoadingScene />
        </main>
      </div>
    );
  }

  const SceneComponent = sceneComponents[currentScene] || HomeScene;
  const isHomeScene =
    currentScene === Scene.Home ||
    currentScene === Scene.CreateRoom ||
    currentScene === Scene.JoinRoom;

  return (
    <div style={styles.app}>
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
        <SceneComponent />
      </main>
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
};

export default App;
