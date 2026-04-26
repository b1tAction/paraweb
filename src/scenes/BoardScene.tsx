/**
 * BoardScene - 主棋盘场景
 *
 * 显示游戏主界面，玩家可以进行回合操作
 */

import React, { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { gameService } from '../service/NakamaService';
import { PhaserBoard } from '../components/PhaserBoard';
import type { Player } from '../types/protocol';

const FACTION_META: Record<string, { label: string; color: string; bgColor: string }> = {
  qing_long: { label: '青龙', color: '#6ab86e', bgColor: 'rgba(224, 240, 225, 0.96)' },
  zhu_que: { label: '朱雀', color: '#c62828', bgColor: 'rgba(255, 220, 220, 0.96)' },
  bai_hu: { label: '白虎', color: '#f9c74f', bgColor: 'rgba(255, 243, 198, 0.96)' },
  xuan_wu: { label: '玄武', color: '#82aee0', bgColor: 'rgba(218, 235, 255, 0.96)' },
};

const BUFF_EFFECTS: Record<string, string> = {
  divine: '每回合 LP 加 1',
  rain: '每两回合 HP 加 1',
  exorcism: '免疫毒瘴事件',
  fire: '每回合 LP 加 1',
  curse: '每回合 LP 减 1',
  lost: '移动方向反转',
  corrupt: '每两回合 HP 减 1',
  poison: '触发坏事件',
  hidden: '免疫伤害和事件',
};

const BLUE_BUFFS = new Set(['divine', 'rain', 'exorcism', 'fire']);
const RED_BUFFS = new Set(['curse', 'lost', 'corrupt', 'poison']);

function getFactionMeta(faction: string) {
  return FACTION_META[faction] ?? { label: faction || '未知', color: '#607d8b', bgColor: 'rgba(230, 236, 240, 0.96)' };
}

function getBuffColor(type: string) {
  if (BLUE_BUFFS.has(type)) return '#1976d2';
  if (RED_BUFFS.has(type)) return '#d32f2f';
  if (type === 'hidden') return '#757575';
  return '#9e9e9e';
}

function formatBuffDuration(duration: number) {
  return duration < 0 ? '永久' : `${duration}`;
}

function isBossPlayer(player: Player) {
  return Boolean((player as Player & { is_boss?: boolean }).is_boss) || player.display_name === 'Boss';
}

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
  const boardPlayers = players.filter((player) => !isBossPlayer(player));
  const bossPlayer = players.find(isBossPlayer);

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
          <div style={styles.playerBar} aria-label="玩家状态">
            {boardPlayers.map((player) => {
              const faction = getFactionMeta(player.faction);
              const isCurrentMainActionPlayer =
                player.player_id === currentPlayerId &&
                (turnState === 'main_action' || turnState === 'MainAction');

              return (
                <div
                  key={player.player_id}
                  style={{
                    ...styles.playerCard,
                    borderColor: faction.color,
                    backgroundColor: faction.bgColor,
                  }}
                >
                  <div style={styles.avatarWrap}>
                    <div
                      style={{
                        ...styles.avatar,
                        backgroundColor: faction.color,
                        boxShadow: isCurrentMainActionPlayer
                          ? `0 0 0 3px rgba(255, 255, 255, 0.95), 0 0 22px ${faction.color}`
                          : styles.avatar.boxShadow,
                      }}
                    />
                    {player.player_id === myPlayerId && <span style={styles.myAvatarBadge}>我</span>}
                  </div>
                  <div style={styles.playerCardBody}>
                    <div style={styles.playerCardHeader}>
                      <span title={player.player_id} style={styles.playerName}>
                        {player.player_id}
                      </span>
                    </div>
                    <div style={styles.playerStats}>
                      <span>HP {player.hp}</span>
                      <span>LP {player.lp}</span>
                    </div>
                    <div style={styles.buffDots} aria-label="Buffs">
                      {player.buffs.length > 0 ? (
                        player.buffs.map((buff, index) => (
                          <span
                            key={`${buff.type}-${index}`}
                            title={`${buff.name}\n${BUFF_EFFECTS[buff.type] || '暂无效果说明'}\n剩余回合: ${formatBuffDuration(buff.duration)}\n`}
                            style={{
                              ...styles.buffDot,
                              backgroundColor: getBuffColor(buff.type),
                            }}
                          />
                        ))
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={styles.statusSection}>
            <p style={styles.info}>全局状态：{globalState}</p>
            <p style={styles.info}>回合状态：{turnState}</p>
            <p style={styles.info}>当前玩家：{currentPlayer?.display_name || currentPlayerId}</p>
          </div>
        </div>

        <div style={styles.sidePanels}>
          {((turnSync && turnSync.entries.length > 0) || bossPlayer) && (
            <div style={styles.rightPanel}>
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

              {bossPlayer && (
                <div style={styles.bossSection}>
                  <div style={styles.bossHeader}>
                    <div style={styles.bossAvatar} />
                    <div style={styles.bossTitleGroup}>
                      <strong style={styles.bossTitle}>Boss</strong>
                      <span style={styles.bossId} title={bossPlayer.player_id}>
                        {bossPlayer.player_id}
                      </span>
                    </div>
                  </div>
                  <div style={styles.bossStats}>
                    <span>HP {bossPlayer.hp}</span>
                    <span>LP {bossPlayer.lp}</span>
                    <span>位置 {bossPlayer.position}</span>
                  </div>
                  <div style={styles.buffDots} aria-label="Boss Buffs">
                    {bossPlayer.buffs.length > 0
                      ? bossPlayer.buffs.map((buff, index) => (
                          <span
                            key={`${buff.type}-${index}`}
                            title={`${buff.name}\n${BUFF_EFFECTS[buff.type] || '暂无效果说明'}\n剩余回合: ${formatBuffDuration(buff.duration)}\n`}
                            style={{
                              ...styles.buffDot,
                              backgroundColor: getBuffColor(buff.type),
                            }}
                          />
                        ))
                      : null}
                  </div>
                </div>
              )}
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
    width: '100%',
    minWidth: 0,
  },
  playerBar: {
    pointerEvents: 'auto',
    flex: 1,
    minWidth: 0,
    display: 'flex',
    gap: '10px',
    overflowX: 'auto',
    paddingBottom: '4px',
  },
  playerCard: {
    flex: '0 0 clamp(220px, 22vw, 300px)',
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 10px',
    border: '2px solid transparent',
    borderRadius: '8px',
    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.18)',
    backdropFilter: 'blur(8px)',
  },
  avatar: {
    flex: '0 0 38px',
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    border: '2px solid rgba(255, 255, 255, 0.85)',
  },
  avatarWrap: {
    position: 'relative',
    flex: '0 0 48px',
    width: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  myAvatarBadge: {
    position: 'absolute',
    right: '-2px',
    bottom: '-4px',
    padding: '1px 5px',
    borderRadius: '999px',
    backgroundColor: '#17202a',
    color: '#ffffff',
    border: '1px solid rgba(255, 255, 255, 0.9)',
    fontSize: '11px',
    fontWeight: 800,
    lineHeight: 1.35,
  },
  playerCardBody: {
    minWidth: 0,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  playerCardHeader: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  sidePanels: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    gap: '12px',
    flex: 1,
    minHeight: 0,
  },
  rightPanel: {
    pointerEvents: 'auto',
    width: 'min(360px, 42vw)',
    marginLeft: 'auto',
    maxHeight: '100%',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
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
    flex: '0 0 auto',
    padding: '12px',
    backgroundColor: 'rgba(245, 245, 245, 0.9)',
    borderRadius: '8px',
  },
  info: {
    fontSize: '14px',
    marginBottom: '4px',
  },
  playerName: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'block',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#17202a',
  },
  playerStats: {
    display: 'flex',
    gap: '10px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#263238',
  },
  buffDots: {
    minHeight: '24px',
    minWidth: '104px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 6px',
    borderRadius: '5px',
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
  },
  buffDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    border: '1px solid rgba(255, 255, 255, 0.85)',
    cursor: 'help',
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
  bossSection: {
    padding: '12px',
    backgroundColor: 'rgba(33, 37, 43, 0.9)',
    border: '1px solid rgba(239, 83, 80, 0.75)',
    borderRadius: '8px',
    color: '#f5f7fa',
  },
  bossHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
  },
  bossAvatar: {
    flex: '0 0 38px',
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    backgroundColor: '#ef5350',
    border: '2px solid rgba(255, 255, 255, 0.85)',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.28)',
  },
  bossTitleGroup: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  bossTitle: {
    fontSize: '16px',
    lineHeight: 1.2,
  },
  bossId: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: '#cfd8dc',
    fontSize: '12px',
  },
  bossStats: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '8px',
    color: '#fff3e0',
    fontSize: '13px',
    fontWeight: 700,
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
