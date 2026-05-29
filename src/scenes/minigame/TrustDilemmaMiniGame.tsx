/**
 * TrustDilemmaMiniGame - Real-time online classic game theory mini-game component
 *
 * Renders Cooperate (C) / Compete (D) buttons, countdown timer, round reveal cards,
 * and masked ranking legends based on Colyseus state synchronization.
 */

import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColyseusService, colyseusService, type TrustDilemmaRoomState } from '../../service/ColyseusService';
import { useGameStore } from '../../store/gameStore';
import type { MiniGameConn, Player } from '../../types/protocol';
import { getDisambiguatedDisplayName } from '../../utils/displayName';
import { trustDilemmaStyles as styles } from './TrustDilemmaStyles';

// ========== Constants ==========

const EMPTY_PARTICIPANT_IDS: string[] = [];

// ========== Props ==========

export interface TrustDilemmaMiniGameProps {
  connection: MiniGameConn;
  isParticipant: boolean;
  onlineService?: ColyseusService;
  playerId?: string;
  participantIds?: string[];
  participantPlayers?: Player[];
}

type LocalPhase = 'connecting' | 'rules' | 'choosing' | 'resolving' | 'finished' | 'error';

export const TrustDilemmaMiniGame: React.FC<TrustDilemmaMiniGameProps> = ({
  connection,
  isParticipant,
  onlineService,
  playerId,
  participantIds,
  participantPlayers,
}) => {
  const { players, myPlayerId } = useGameStore();
  const service = onlineService ?? colyseusService;
  const effectivePlayerId = playerId ?? myPlayerId ?? '';

  // Local render states bridged from Colyseus service callbacks
  const [phase, setPhase] = useState<LocalPhase>('connecting');
  const [roomState, setRoomState] = useState<TrustDilemmaRoomState | null>(null);
  const [error, setError] = useState<string>('');
  const [myChoice, setMyChoice] = useState<number | null>(null);

  const effectiveParticipantIds = participantIds ?? roomState?.players.map((p) => p.id) ?? EMPTY_PARTICIPANT_IDS;

  const renderPlayers = useMemo<Player[]>(() => {
    if (participantPlayers && participantPlayers.length > 0) return participantPlayers;
    if (players.length > 0) return players;

    return effectiveParticipantIds.map(
      (id) =>
        ({
          player_id: id,
          display_name: id === effectivePlayerId ? 'You' : id.slice(0, 8),
          faction: '',
          position: 0,
          hp: 0,
          max_hp: 8,
          lp: 0,
          buffs: [],
          items: [],
          charge: 0,
          fire_counter: 0,
          is_dead: false,
          skip_turn: false,
        }) as Player,
    );
  }, [effectiveParticipantIds, effectivePlayerId, participantPlayers, players]);

  // ========== Colyseus connection lifecycle ==========

  useEffect(() => {
    if (!isParticipant) return;

    service.setCallbacks(
      (state: TrustDilemmaRoomState) => {
        setRoomState(state);

        // Derive state phase
        if (state.phase === 'rules') {
          setPhase('rules');
        } else if (state.phase === 'choosing') {
          setPhase('choosing');
          // Reset local selection when round increments
          const myState = state.players.find((p) => p.id === effectivePlayerId);
          if (myState && myState.choice === 0) {
            setMyChoice(null);
          } else if (myState) {
            setMyChoice(myState.choice);
          }
        } else if (state.phase === 'resolving') {
          setPhase('resolving');
          const myState = state.players.find((p) => p.id === effectivePlayerId);
          if (myState) {
            setMyChoice(myState.choice);
          }
        } else if (state.phase === 'finished') {
          setPhase('finished');
        }
      },
      (err: Error) => {
        setPhase('error');
        setError(err.message);
        useGameStore.getState().setColyseusError(err.message);
      },
      (code: number) => {
        console.log('[TrustDilemma] Room left with code', code);
      },
    );

    // Join/create Colyseus room
    service.joinRoom(connection, {
      playerId: effectivePlayerId,
      players: effectiveParticipantIds,
    }).catch((err) => {
      setPhase('error');
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      useGameStore.getState().setColyseusError(message);
    });

    return () => {
      void service.leaveRoom();
    };
  }, [connection, isParticipant, effectivePlayerId, service]);

  // ========== Choice handler ==========

  const handleChoice = useCallback(
    (choice: number) => {
      if (phase === 'choosing' && isParticipant) {
        service.sendChoice(choice);
        setMyChoice(choice);
      }
    },
    [phase, isParticipant, service],
  );

  // ========== Player display name mapping ==========

  const allPlayersData = useMemo(
    () =>
      renderPlayers.map((p) => ({
        displayName: p.display_name || p.player_id,
        userId: p.player_id,
      })),
    [renderPlayers],
  );

  const getPlayerDisplayName = useCallback(
    (idStr: string) => {
      const playerInfo = renderPlayers.find((p) => p.player_id === idStr);
      return getDisambiguatedDisplayName(playerInfo?.display_name || idStr, idStr, allPlayersData);
    },
    [renderPlayers, allPlayersData],
  );

  // ========== UI Render logic ==========

  if (!isParticipant) {
    return (
      <div style={styles.gameArea}>
        <p style={styles.spectatorMessage}>您正在旁观本场对局。请等待参与者完成选择...</p>
      </div>
    );
  }

  if (phase === 'connecting') {
    return (
      <div style={styles.gameArea}>
        <p style={styles.connectingText}>正在连接到信任考验联机服务器...</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={styles.gameArea}>
        <p style={styles.errorText}>连接失败: {error}</p>
        <p style={styles.waitingText}>正在等待服务器下发结算数据...</p>
      </div>
    );
  }

  const state = roomState;
  if (!state) return null;

  if (phase === 'rules') {
    const myPlayerState = state.players.find((p) => p.id === effectivePlayerId);
    const isConfirmed = myPlayerState?.isReady || false;

    return (
      <div style={styles.gameArea}>
        <div style={styles.rulesPanel}>
          {/* Header Row: Title */}
          <div style={styles.rulesHeader}>
            <span style={styles.rulesTitleText}>📜 信任考验 · 游戏规则说明</span>
          </div>

          <div style={styles.rulesContentLayout}>
            {/* Left Column: Clear Game Rules Explanation */}
            <div style={styles.rulesExplainCard}>
              <h4 style={styles.rulesSectionTitle}>🔍 游戏背景与机制</h4>
              <p style={styles.rulesDescText}>
                信任考验是一个经典的在线博弈论微型游戏。多名玩家将在面临自私自利与集体利益冲突时的经典困境中作出决定。
              </p>

              <h4 style={styles.rulesSectionTitle}>🎮 核心玩法规则</h4>
              <ul style={styles.rulesBulletList}>
                <li style={styles.rulesBulletItem}>游戏共进行 <strong>4 轮</strong>。每一轮结果实时公开。</li>
                <li style={styles.rulesBulletItem}>每轮可秘密选择 <strong>🤝 合作 (Cooperate)</strong> 或 <strong>⚔️ 竞争 (Compete)</strong>。</li>
                <li style={styles.rulesBulletItem}>决策限时 10 秒。若倒计时结束未选，将<strong>自动默认为“合作”</strong>。</li>
                <li style={styles.rulesBulletItem}>当所有人都确认规则或 15 秒规则倒计时结束，游戏将立刻正式开始。</li>
              </ul>

              <h4 style={styles.rulesSectionTitle}>📊 计分结算明细 ({effectiveParticipantIds.length === 3 ? '3人局' : '4人局'})</h4>
              {effectiveParticipantIds.length === 3 ? (
                <div style={styles.ruleList}>
                  <div style={styles.ruleItemHighlight}>
                    <p style={styles.ruleItemText}>🤝 全员合作：全员选择合作 (C, C, C)</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleC}>合作者：各得 +4 分</span>
                    </div>
                  </div>
                  <div style={styles.ruleItem}>
                    <p style={styles.ruleItemText}>⚔️ 全员竞争：全员选择竞争 (D, D, D)</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleD}>竞争者：各得 +1 分</span>
                    </div>
                  </div>
                  <div style={styles.ruleItem}>
                    <p style={styles.ruleItemText}>⚔️ 1人竞争，2人合作 (D, C, C)</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleD}>竞争者：拿高额红利 +6 分</span>
                      <span style={styles.badgeRuleC}>合作者：仅得被收割保底 +1 分</span>
                    </div>
                  </div>
                  <div style={styles.ruleItem}>
                    <p style={styles.ruleItemText}>⚔️ 2人竞争，1人合作 (D, D, C)</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleD}>竞争者：得 +0 分</span>
                      <span style={styles.badgeRuleC}>合作者：得收割红利 +6 分</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={styles.ruleList}>
                  <div style={styles.ruleItemHighlight}>
                    <p style={styles.ruleItemText}>🤝 全员合作：全员选择合作 (C, C, C, C)</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleC}>合作者：各得 +5 分</span>
                    </div>
                  </div>
                  <div style={styles.ruleItem}>
                    <p style={styles.ruleItemText}>⚔️ 全员竞争：全员选择竞争 (D, D, D, D)</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleD}>竞争者：各得 +1 分</span>
                    </div>
                  </div>
                  <div style={styles.ruleItem}>
                    <p style={styles.ruleItemText}>⚔️ 1人竞争，3人合作 (D, C, C, C)</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleD}>竞争者：拿最高红利 +7 分</span>
                      <span style={styles.badgeRuleC}>合作者：仅得 +2 分</span>
                    </div>
                  </div>
                  <div style={styles.ruleItem}>
                    <p style={styles.ruleItemText}>⚔️ 2人竞争，2人合作 (D, D, C, C)</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleD}>竞争者：各得 +0 分</span>
                      <span style={styles.badgeRuleC}>合作者：各得 +1 分</span>
                    </div>
                  </div>
                  <div style={styles.ruleItem}>
                    <p style={styles.ruleItemText}>⚔️ 3人竞争，1人合作 (D, D, D, C)</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleD}>竞争者：受人防范反倒扣 -1 分</span>
                      <span style={styles.badgeRuleC}>合作者：坚持到底反转获得 +3 分</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Player Ready List & Confirm Action */}
            <div style={styles.rulesSideCard}>
              <div>
                <h4 style={styles.rulesChecklistTitle}>👥 玩家就绪状态</h4>
                <div style={styles.rulesChecklistGrid}>
                  {state.players.map((p) => {
                    const isMe = p.id === effectivePlayerId;
                    return (
                      <div
                        key={p.id}
                        style={isMe ? styles.rulesChecklistItemMe : styles.rulesChecklistItem}
                      >
                        <span style={isMe ? styles.rulesPlayerNameMe : styles.rulesPlayerName}>
                          {getPlayerDisplayName(p.id)} {isMe && '(我)'}
                        </span>
                        <span style={p.isReady ? styles.badgeReady : styles.badgeThinking}>
                          {p.isReady ? '✅ 已确认' : '⏳ 准备中'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                {isConfirmed ? (
                  <button type="button" disabled style={styles.rulesConfirmBtnDisabled}>
                    <span>✅ 已确认，等待中 ({state.timeLeft}s)...</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    style={styles.rulesConfirmBtn}
                    onClick={() => service.sendConfirmRules()}
                  >
                    <span>🤝 确认规则并进入游戏 ({state.timeLeft}s 后自动确认)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sort players by rank
  const sortedPlayers = [...state.players].sort((a, b) => a.rank - b.rank);

  return (
    <div style={styles.gameArea}>
      {/* ===== Header Row: Round & Timer ===== */}
      <div style={styles.headerRow}>
        <span style={styles.roundLabel}>信任考验 · Round {state.currentRound} / 4</span>
        {phase === 'choosing' && <span style={styles.timerDisplay}>{state.timeLeft} 秒</span>}
        {phase === 'resolving' && <span style={styles.resolvingLabel}>结算亮牌中...</span>}
        {phase === 'finished' && <span style={styles.resolvingLabel}>对局结束</span>}
      </div>

      <div style={styles.containerLayout}>
        {/* ===== Left: Main Interactive Playboard ===== */}
        <div style={styles.leftPlayboard}>
          {/* ===== Player Ready Board (Scores Masked, Ranks Visible) ===== */}
          <div style={styles.readyBoard}>
            {sortedPlayers.map((p) => {
              const isMe = p.id === effectivePlayerId;
              const isFirst = p.rank === 1;

              // 动态选用 Row 样式
              const cardStyle = isFirst
                ? (isMe ? styles.readyCardFirstMe : styles.readyCardFirst)
                : (isMe ? styles.readyCardMe : styles.readyCard);

              // 动态选用 Rank 样式
              const rankStyle = isFirst ? styles.playerRankFirst : styles.playerRank;

              // 动态选用 Name 样式
              const nameStyle = isFirst
                ? styles.playerNameFirst
                : (isMe ? styles.playerNameMe : styles.playerName);

              return (
                <div key={p.id} style={cardStyle}>
                  {/* 左侧：名次徽章 + 姓名 + 个人身份高亮图标 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={rankStyle}>第 {p.rank} 名</span>
                    <span style={nameStyle}>{getPlayerDisplayName(p.id)}</span>
                    {isMe && (
                      <span style={isFirst ? styles.badgeMeIconFirst : styles.badgeMeIcon}>
                        {isFirst ? '✨ 王者(我)' : '👤 我'}
                      </span>
                    )}
                  </div>

                  {/* 右侧：在 choosing 阶段显示准备状态 */}
                  {phase === 'choosing' && (
                    <span style={p.isReady ? styles.badgeReady : styles.badgeThinking}>
                      {p.isReady ? '已就绪' : '思考中'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* ===== Phase 1: Choosing (Cooperate C / Compete D Buttons) ===== */}
          {phase === 'choosing' && (
            <div style={styles.choiceArea}>
              <p style={styles.choicePrompt}>
                {myChoice !== null
                  ? `已选定选项！`
                  : '请做出您的决定（若倒计时结束未选将自动默认为“合作”）：'}
              </p>
              <div style={styles.choiceButtons}>
                <button
                  type="button"
                  style={myChoice === 1 ? styles.buttonCSelected : styles.buttonC}
                  onClick={() => handleChoice(1)}
                >
                  <span>🤝 合作</span>
                  <span style={styles.buttonSubtitle}>(Cooperate - C)</span>
                </button>

                <button
                  type="button"
                  style={myChoice === 2 ? styles.buttonDSelected : styles.buttonD}
                  onClick={() => handleChoice(2)}
                >
                  <span>⚔️ 竞争</span>
                  <span style={styles.buttonSubtitle}>(Compete - D)</span>
                </button>
              </div>
            </div>
          )}

          {/* ===== Phase 2: Resolving (Round Reveal Table) ===== */}
          {phase === 'resolving' && (
            <div style={styles.revealContainer}>
              <h3 style={styles.revealTitle}>📢 本轮亮牌结算结果</h3>
              <div style={styles.revealGrid}>
                {state.players.map((p) => {
                  const isMe = p.id === effectivePlayerId;
                  const rowStyle = isMe ? styles.revealRowMe : styles.revealRow;
                  const scoreChange = p.roundScore >= 0 ? `+${p.roundScore}` : `${p.roundScore}`;
                  const scoreStyle =
                    p.roundScore > 0
                      ? styles.revealScorePositive
                      : p.roundScore < 0
                        ? styles.revealScoreNegative
                        : styles.revealScoreNeutral;

                  return (
                    <div key={p.id} style={rowStyle}>
                      <span style={styles.revealName}>{getPlayerDisplayName(p.id)}</span>
                      <span style={p.choice === 2 ? styles.revealChoiceD : styles.revealChoiceC}>
                        {p.choice === 2 ? '⚔️ 竞争' : '🤝 合作'}
                      </span>
                      <span style={scoreStyle}>{scoreChange} 分</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===== Phase 3: Finished ===== */}
          {phase === 'finished' && (
            <div style={styles.revealContainer}>
              <h3 style={styles.revealTitle}>🏆 经典博弈结束</h3>
              <p style={styles.choicePrompt}>小游戏分数已累积入您的主大富翁总积分，奖励骰子已分配！</p>
            </div>
          )}
        </div>

        {/* ===== Right: Permanent Payoff Matrix Rule Card ===== */}
        <div style={styles.rightRuleboard}>
          <h3 style={styles.ruleTitle}>📜 计分结算规则 ({effectiveParticipantIds.length === 3 ? '3人局' : '4人局'})</h3>
          <p style={styles.ruleSubtitle}>全员合作集体最优，少数竞争收割合作红利</p>
          <div style={styles.ruleList}>
            {effectiveParticipantIds.length === 3 ? (
              <>
                <div style={styles.ruleItemHighlight}>
                  <p style={styles.ruleItemText}>🤝 全员合作 (C, C, C)</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleC}>合作者：+4 分</span>
                  </div>
                </div>
                <div style={styles.ruleItem}>
                  <p style={styles.ruleItemText}>⚔️ 全员竞争 (D, D, D)</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleD}>竞争者：+1 分</span>
                  </div>
                </div>
                <div style={styles.ruleItem}>
                  <p style={styles.ruleItemText}>⚔️ 1人竞争，2人合作 (D, C, C)</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleD}>竞争者：+6 分</span>
                    <span style={styles.badgeRuleC}>合作者：+1 分</span>
                  </div>
                </div>
                <div style={styles.ruleItem}>
                  <p style={styles.ruleItemText}>⚔️ 2人竞争，1人合作 (D, D, C)</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleD}>竞争者：+0 分</span>
                    <span style={styles.badgeRuleC}>合作者：+6 分</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={styles.ruleItemHighlight}>
                  <p style={styles.ruleItemText}>🤝 全员合作 (C, C, C, C)</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleC}>合作者：+5 分</span>
                  </div>
                </div>
                <div style={styles.ruleItem}>
                  <p style={styles.ruleItemText}>⚔️ 全员竞争 (D, D, D, D)</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleD}>竞争者：+1 分</span>
                  </div>
                </div>
                <div style={styles.ruleItem}>
                  <p style={styles.ruleItemText}>⚔️ 1人竞争，3人合作 (D, C, C, C)</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleD}>竞争者：+7 分</span>
                    <span style={styles.badgeRuleC}>合作者：+2 分</span>
                  </div>
                </div>
                <div style={styles.ruleItem}>
                  <p style={styles.ruleItemText}>⚔️ 2人竞争，2人合作 (D, D, C, C)</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleD}>竞争者：+0 分</span>
                    <span style={styles.badgeRuleC}>合作者：+1 分</span>
                  </div>
                </div>
                <div style={styles.ruleItem}>
                  <p style={styles.ruleItemText}>⚔️ 3人竞争，1人合作 (D, D, D, C)</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleD}>竞争者：-1 分</span>
                    <span style={styles.badgeRuleC}>合作者：+3 分</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
