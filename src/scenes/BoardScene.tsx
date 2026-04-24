/**
 * BoardScene - 主棋盘场景
 *
 * 显示游戏主界面，玩家可以进行回合操作
 */

import React, { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { gameService } from '../service/NakamaService';
import { PhaserBoard } from '../components/PhaserBoard';

export const BoardScene: React.FC = () => {
  const {
    globalState,
    turnState,
    myPlayerId,
    currentPlayerId,
    players,
    availableActions,
    decisionRequest,
    turnSync,
    mapConfig,
  } = useGameStore();

  // #region agent instrumentation - Hypothesis C
  useEffect(() => {
    fetch('http://127.0.0.1:7649/ingest/fd570d88-3ae3-47ed-8ee1-493b444c6f23', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '31c30f' },
      body: JSON.stringify({
        sessionId: '31c30f',
        location: 'BoardScene.tsx:mapConfig',
        message: 'mapConfig in BoardScene',
        data: { hasMapConfig: !!mapConfig, mapLength: mapConfig?.length, cells: mapConfig?.cells?.length },
        timestamp: Date.now(),
        runId: 'debug',
        hypothesisId: 'C'
      })
    }).catch(() => {});
  }, [mapConfig]);
  // #endregion

  const isMyTurn = myPlayerId === currentPlayerId;

  /**
   * 处理掷骰子
   */
  const handleRollDice = () => {
    console.log('[BoardScene] 掷骰子');
    gameService.sendRollDice();
  };

  /**
   * 处理使用技能
   */
  const handleUseSkill = () => {
    console.log('[BoardScene] 使用技能');
    gameService.sendUseSkill();
  };

  /**
   * 处理使用道具
   */
  const handleUseItem = (itemId: string) => {
    console.log('[BoardScene] 使用道具', itemId);
    gameService.sendUseItem(itemId);
  };

  /**
   * 处理决策选择
   */
  const handleChoice = (choice: number) => {
    if (decisionRequest) {
      console.log('[BoardScene] 提交决策', choice);
      gameService.sendUserChoice(decisionRequest.id, choice);
    }
  };

  // 获取当前玩家对象
  const currentPlayer = players.find((p) => p.player_id === currentPlayerId);
  const myPlayer = players.find((p) => p.player_id === myPlayerId);

  return (
    <div style={styles.sceneRoot}>
      <div style={styles.boardLayer}>
        {mapConfig ? (
          <PhaserBoard
            mapConfig={mapConfig}
            players={players}
            followPlayerId={myPlayerId || currentPlayerId}
          />
        ) : (
          <div style={styles.mapMissing}>地图未加载 (mapConfig is null)</div>
        )}
      </div>

      <div style={styles.uiLayer}>
        <div style={styles.topHud}>
          <h2 style={styles.title}>主棋盘</h2>
          <div style={styles.statusSection}>
            <p style={styles.info}>全局状态：{globalState}</p>
            <p style={styles.info}>回合状态：{turnState}</p>
            <p style={styles.info}>当前玩家：{currentPlayer?.display_name || currentPlayerId}</p>
          </div>
        </div>

        <div style={styles.sidePanels}>
          <div style={styles.leftPanel}>
            <div style={styles.playerSection}>
              <h3>玩家状态</h3>
              {players.map((player) => (
                <div
                  key={player.player_id}
                  style={{
                    ...styles.playerItem,
                    backgroundColor:
                      player.player_id === myPlayerId ? 'rgba(227, 242, 253, 0.9)' : 'rgba(255, 255, 255, 0.82)',
                  }}
                >
                  <div style={styles.playerInfo}>
                    <span style={styles.playerName}>
                      {player.display_name}
                      {player.player_id === currentPlayerId && ' (当前)'}
                      {player.player_id === myPlayerId && ' (你)'}
                    </span>
                    <span style={styles.playerFaction}>{player.faction}</span>
                  </div>
                  <div style={styles.playerStats}>
                    <span>HP: {player.hp}</span>
                    <span>LP: {player.lp}</span>
                    <span>位置：{player.position}</span>
                  </div>
                </div>
              ))}
            </div>

            {myPlayer && (
              <div style={styles.myStatus}>
                <h3>我的状态</h3>
                <div style={styles.statusGrid}>
                  <div style={styles.statItem}>
                    <span>生命值</span>
                    <span style={styles.statValue}>{myPlayer.hp}</span>
                  </div>
                  <div style={styles.statItem}>
                    <span>幸运值</span>
                    <span style={styles.statValue}>{myPlayer.lp}</span>
                  </div>
                  <div style={styles.statItem}>
                    <span>充能</span>
                    <span style={styles.statValue}>{myPlayer.charge}</span>
                  </div>
                  <div style={styles.statItem}>
                    <span>位置</span>
                    <span style={styles.statValue}>{myPlayer.position}</span>
                  </div>
                </div>

                {myPlayer.buffs.length > 0 && (
                  <div style={styles.buffList}>
                    <h4>增益效果</h4>
                    {myPlayer.buffs.map((buff, index) => (
                      <span key={index} style={styles.buffTag}>
                        {buff.name} ({buff.duration})
                      </span>
                    ))}
                  </div>
                )}

                {myPlayer.items.length > 0 && (
                  <div style={styles.itemList}>
                    <h4>道具</h4>
                    {myPlayer.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleUseItem(item.id)}
                        style={styles.itemButton}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {turnSync && turnSync.entries.length > 0 && (
            <div style={styles.rightPanel}>
              <div style={styles.turnSyncSection}>
                <h3>回合日志 (R{turnSync.round}T{turnSync.turn})</h3>
                <div style={styles.logList}>
                  {turnSync.entries.map((entry, index) => (
                    <div key={index} style={styles.logEntry}>
                      <span style={styles.logType}>{entry.action_type}</span>
                      <span style={styles.logTarget}>目标: {entry.target || '-'}</span>
                      <span style={styles.logSource}>来源: {entry.source || '-'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {(turnState === 'main_action' || turnState === 'MainAction') && (
          <div style={styles.bottomActionWrap}>
            <div style={styles.actionSection}>
              {isMyTurn ? (
                <>
                  <h3>你的回合！</h3>
                  {availableActions && (
                    <div style={styles.availableActions}>
                      <button
                        onClick={handleRollDice}
                        style={styles.actionButton}
                      >
                        掷骰子 ({availableActions.dice_type})
                      </button>

                      {availableActions.can_use_skill && (
                        <button
                          onClick={handleUseSkill}
                          style={styles.actionButton}
                        >
                          使用技能
                        </button>
                      )}

                      {availableActions.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleUseItem(item.id)}
                          style={styles.actionButton}
                        >
                          使用 {item.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p style={styles.waiting}>等待其他玩家行动...</p>
              )}
            </div>
          </div>
        )}

        {decisionRequest && (
          <div style={styles.decisionBackdrop}>
            <div style={styles.decisionSection}>
              <h3>{decisionRequest.prompt}</h3>
              <p>{decisionRequest.context}</p>
              <div style={styles.decisionOptions}>
                {decisionRequest.options.map((option, index) => (
                  <button
                    key={option.id}
                    onClick={() => handleChoice(index)}
                    style={styles.decisionButton}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 简单样式
const styles: Record<string, React.CSSProperties> = {
  sceneRoot: {
    position: 'fixed',
    inset: 0,
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: '#0d1117',
  },
  boardLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
  },
  uiLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 2,
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '12px',
    gap: '10px',
  },
  topHud: {
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
  },
  sidePanels: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    gap: '12px',
    flex: 1,
    minHeight: 0,
  },
  leftPanel: {
    pointerEvents: 'auto',
    width: 'min(360px, 42vw)',
    maxHeight: '100%',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  rightPanel: {
    pointerEvents: 'auto',
    width: 'min(360px, 42vw)',
    marginLeft: 'auto',
    maxHeight: '100%',
    overflowY: 'auto',
  },
  bottomActionWrap: {
    pointerEvents: 'none',
    display: 'flex',
    justifyContent: 'center',
  },
  mapMissing: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ef9a9a',
    fontWeight: 700,
    background: 'rgba(0,0,0,0.5)',
  },
  title: {
    pointerEvents: 'auto',
    margin: 0,
    padding: '8px 12px',
    borderRadius: '10px',
    backgroundColor: 'rgba(19, 26, 36, 0.75)',
    color: '#f2f6fb',
    fontSize: '20px',
  },
  statusSection: {
    pointerEvents: 'auto',
    padding: '12px',
    backgroundColor: 'rgba(245, 245, 245, 0.9)',
    borderRadius: '8px',
  },
  info: {
    fontSize: '14px',
    marginBottom: '4px',
  },
  playerSection: {
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
  },
  playerItem: {
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  playerInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  playerName: {
    fontSize: '16px',
    fontWeight: 'bold',
  },
  playerFaction: {
    fontSize: '14px',
    color: '#666',
  },
  playerStats: {
    display: 'flex',
    gap: '16px',
    fontSize: '14px',
  },
  myStatus: {
    pointerEvents: 'auto',
    padding: '12px',
    backgroundColor: 'rgba(255, 243, 224, 0.9)',
    borderRadius: '8px',
  },
  statusGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
    marginTop: '8px',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '8px',
    backgroundColor: 'white',
    borderRadius: '4px',
  },
  statValue: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginTop: '4px',
  },
  buffList: {
    marginTop: '12px',
  },
  buffTag: {
    display: 'inline-block',
    padding: '4px 8px',
    backgroundColor: '#e0e0e0',
    borderRadius: '4px',
    marginRight: '8px',
    fontSize: '12px',
  },
  itemList: {
    marginTop: '12px',
  },
  itemButton: {
    padding: '8px 12px',
    marginRight: '8px',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  actionSection: {
    pointerEvents: 'auto',
    padding: '16px',
    backgroundColor: 'rgba(232, 245, 233, 0.96)',
    borderRadius: '8px',
    textAlign: 'center',
    width: 'min(900px, calc(100vw - 24px))',
  },
  availableActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    justifyContent: 'center',
    marginTop: '12px',
  },
  actionButton: {
    padding: '12px 16px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  waiting: {
    fontSize: '16px',
    color: '#666',
  },
  decisionSection: {
    padding: '16px',
    backgroundColor: '#fff9c4',
    borderRadius: '8px',
    width: 'min(700px, calc(100vw - 40px))',
    pointerEvents: 'auto',
  },
  decisionBackdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'auto',
  },
  decisionOptions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '12px',
  },
  decisionButton: {
    padding: '10px 16px',
    backgroundColor: '#ff9800',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  turnSyncSection: {
    padding: '12px',
    backgroundColor: 'rgba(232, 234, 246, 0.9)',
    borderRadius: '8px',
  },
  logList: {
    maxHeight: '35vh',
    overflowY: 'auto',
  },
  logEntry: {
    display: 'flex',
    gap: '12px',
    padding: '8px',
    borderBottom: '1px solid #c5cae9',
    fontSize: '13px',
  },
  logType: {
    fontWeight: 'bold',
    color: '#3f51b5',
    minWidth: '100px',
  },
  logTarget: {
    color: '#666',
  },
  logSource: {
    color: '#999',
  },
};

export default BoardScene;
