/**
 * BoardScene - 主棋盘场景
 *
 * 显示游戏主界面，玩家可以进行回合操作
 */

import React from 'react';
import { useGameStore } from '../store/gameStore';
import { gameService } from '../service/NakamaService';

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
  } = useGameStore();

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
    <div style={styles.container}>
      <h2 style={styles.title}>主棋盘</h2>

      {/* 状态信息 */}
      <div style={styles.statusSection}>
        <p style={styles.info}>全局状态：{globalState}</p>
        <p style={styles.info}>回合状态：{turnState}</p>
        <p style={styles.info}>
          当前玩家：{currentPlayer?.display_name || currentPlayerId}
        </p>
      </div>

      {/* 玩家列表 */}
      <div style={styles.playerSection}>
        <h3>玩家状态</h3>
        {players.map((player) => (
          <div
            key={player.player_id}
            style={{
              ...styles.playerItem,
              backgroundColor:
                player.player_id === myPlayerId ? '#e3f2fd' : 'transparent',
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

      {/* 我的状态 */}
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

          {/* Buff 列表 */}
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

          {/* 道具列表 */}
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

      {/* 操作区域 - 支持多种状态格式 (main_action/MainAction) */}
      {(turnState === 'main_action' || turnState === 'MainAction') && (
        <div style={styles.actionSection}>
          {isMyTurn ? (
            <>
              <h3>你的回合！</h3>

              {/* 可用动作 */}
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
      )}

      {/* 回合日志 (TurnSync) */}
      {turnSync && turnSync.entries.length > 0 && (
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
      )}

      {/* 决策请求 */}
      {decisionRequest && (
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
      )}
    </div>
  );
};

// 简单样式
const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    maxWidth: '800px',
    margin: '0 auto',
  },
  title: {
    textAlign: 'center',
    fontSize: '20px',
    marginBottom: '16px',
  },
  statusSection: {
    padding: '12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  info: {
    fontSize: '14px',
    marginBottom: '4px',
  },
  playerSection: {
    marginBottom: '16px',
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
    padding: '12px',
    backgroundColor: '#fff3e0',
    borderRadius: '8px',
    marginBottom: '16px',
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
    padding: '16px',
    backgroundColor: '#e8f5e9',
    borderRadius: '8px',
    textAlign: 'center',
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
    marginTop: '16px',
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
    backgroundColor: '#e8eaf6',
    borderRadius: '8px',
    marginTop: '16px',
  },
  logList: {
    maxHeight: '200px',
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
