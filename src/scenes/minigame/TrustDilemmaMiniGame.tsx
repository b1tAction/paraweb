/**
 * TrustDilemmaMiniGame - Real-time online classic game theory mini-game component
 *
 * Renders Cooperate / Compete buttons, countdown timer, round reveal rows,
 * and masked ranking legends based on Colyseus state synchronization.
 */

import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColyseusService, colyseusService, type TrustDilemmaRoomState } from '../../service/ColyseusService';
import { useGameStore } from '../../store/gameStore';
import type { MiniGameConn, Player } from '../../types/protocol';
import { getDisambiguatedDisplayName } from '../../utils/displayName';
import { trustDilemmaStyles as styles } from './TrustDilemmaStyles';

const EMPTY_PARTICIPANT_IDS: string[] = [];

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

  const [phase, setPhase] = useState<LocalPhase>('connecting');
  const [roomState, setRoomState] = useState<TrustDilemmaRoomState | null>(null);
  const [error, setError] = useState<string>('');
  const [myChoice, setMyChoice] = useState<number | null>(null);

  const roomParticipantIds = useMemo(
    () => roomState?.players.map((player) => player.id) ?? EMPTY_PARTICIPANT_IDS,
    [roomState?.players],
  );
  const effectiveParticipantIds = participantIds ?? roomParticipantIds;

  const renderPlayers = useMemo<Player[]>(() => {
    if (participantPlayers && participantPlayers.length > 0) return participantPlayers;
    if (players.length > 0) return players;

    return effectiveParticipantIds.map(
      (id) =>
        ({
          player_id: id,
          display_name: id === effectivePlayerId ? '我' : id.slice(0, 8),
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

  useEffect(() => {
    if (!isParticipant) return;

    service.setCallbacks(
      (state: TrustDilemmaRoomState) => {
        setRoomState(state);

        if (state.phase === 'rules') {
          setPhase('rules');
        } else if (state.phase === 'choosing') {
          setPhase('choosing');
          const myState = state.players.find((p) => p.id === effectivePlayerId);
          setMyChoice(myState && myState.choice !== 0 ? myState.choice : null);
        } else if (state.phase === 'resolving') {
          setPhase('resolving');
          const myState = state.players.find((p) => p.id === effectivePlayerId);
          if (myState) setMyChoice(myState.choice);
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

    service
      .joinRoom(connection, {
        playerId: effectivePlayerId,
        players: participantIds,
      })
      .catch((err) => {
        setPhase('error');
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        useGameStore.getState().setColyseusError(message);
      });

    return () => {
      void service.leaveRoom();
    };
  }, [connection, effectivePlayerId, isParticipant, participantIds, service]);

  const handleChoice = useCallback(
    (choice: number) => {
      if (phase === 'choosing' && isParticipant) {
        service.sendChoice(choice);
        setMyChoice(choice);
      }
    },
    [phase, isParticipant, service],
  );

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

  if (!isParticipant) {
    return (
      <div style={styles.gameArea}>
        <p style={styles.spectatorMessage}>旁观中, 等待参与者完成选择</p>
      </div>
    );
  }

  if (phase === 'connecting') {
    return (
      <div style={styles.gameArea}>
        <p style={styles.connectingText}>正在连接信任考验服务器</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={styles.gameArea}>
        <p style={styles.errorText}>连接失败: {error}</p>
        <p style={styles.waitingText}>等待服务器结算</p>
      </div>
    );
  }

  const state = roomState;
  if (!state) return null;

  const playerCountLabel = effectiveParticipantIds.length === 3 ? '3人局' : '4人局';

  if (phase === 'rules') {
    const myPlayerState = state.players.find((p) => p.id === effectivePlayerId);
    const isConfirmed = myPlayerState?.isReady || false;

    return (
      <div style={styles.gameArea}>
        <div style={styles.rulesPanel}>
          <div style={styles.rulesHeader}>
            <span style={styles.rulesTitleText}>信任考验 / 规则</span>
          </div>

          <div style={styles.rulesContentLayout}>
            <div style={styles.rulesExplainCard}>
              <p style={styles.rulesDescText}>共 4 轮, 在合作与竞争之间选择, 总分最高获胜</p>

              <ul style={styles.rulesBulletList}>
                <li style={styles.rulesBulletItem}>
                  每轮 10 秒, 选择 <strong>合作</strong> 或 <strong>竞争</strong>, 超时默认合作
                </li>
              </ul>

              <h4 style={styles.rulesSectionTitle}>计分结算 / {playerCountLabel}</h4>
              {effectiveParticipantIds.length === 3 ? (
                <div style={styles.ruleList}>
                  <div style={styles.ruleItemHighlight}>
                    <p style={styles.ruleItemText}>全员合作</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleC}>每人 +4</span>
                    </div>
                  </div>
                  <div style={styles.ruleItem}>
                    <p style={styles.ruleItemText}>全员竞争</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleD}>每人 +1</span>
                    </div>
                  </div>
                  <div style={styles.ruleItem}>
                    <p style={styles.ruleItemText}>1人竞争, 2人合作</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleD}>竞争者 +6</span>
                      <span style={styles.badgeRuleC}>合作者 +1</span>
                    </div>
                  </div>
                  <div style={styles.ruleItem}>
                    <p style={styles.ruleItemText}>2人竞争, 1人合作</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleD}>竞争者 +0</span>
                      <span style={styles.badgeRuleC}>合作者 +6</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={styles.ruleList}>
                  <div style={styles.ruleItemHighlight}>
                    <p style={styles.ruleItemText}>全员合作</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleC}>每人 +5</span>
                    </div>
                  </div>
                  <div style={styles.ruleItem}>
                    <p style={styles.ruleItemText}>全员竞争</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleD}>每人 +1</span>
                    </div>
                  </div>
                  <div style={styles.ruleItem}>
                    <p style={styles.ruleItemText}>1人竞争, 3人合作</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleD}>竞争者 +7</span>
                      <span style={styles.badgeRuleC}>合作者 +2</span>
                    </div>
                  </div>
                  <div style={styles.ruleItem}>
                    <p style={styles.ruleItemText}>2人竞争, 2人合作</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleD}>竞争者 +0</span>
                      <span style={styles.badgeRuleC}>合作者 +1</span>
                    </div>
                  </div>
                  <div style={styles.ruleItem}>
                    <p style={styles.ruleItemText}>3人竞争, 1人合作</p>
                    <div style={styles.ruleScoreRow}>
                      <span style={styles.badgeRuleD}>竞争者 -1</span>
                      <span style={styles.badgeRuleC}>合作者 +3</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={styles.rulesSideCard}>
              <div>
                <h4 style={styles.rulesChecklistTitle}>玩家状态</h4>
                <div style={styles.rulesChecklistGrid}>
                  {state.players.map((p) => {
                    const isMe = p.id === effectivePlayerId;
                    return (
                      <div key={p.id} style={isMe ? styles.rulesChecklistItemMe : styles.rulesChecklistItem}>
                        <span style={isMe ? styles.rulesPlayerNameMe : styles.rulesPlayerName}>
                          {getPlayerDisplayName(p.id)}
                          {isMe ? ' / 我' : ''}
                        </span>
                        <span style={p.isReady ? styles.badgeReady : styles.badgeThinking}>
                          {p.isReady ? '已确认' : '准备中'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                {isConfirmed ? (
                  <button type="button" disabled style={styles.rulesConfirmBtnDisabled}>
                    <span>已确认, 等待 {state.timeLeft}s</span>
                  </button>
                ) : (
                  <button type="button" style={styles.rulesConfirmBtn} onClick={() => service.sendConfirmRules()}>
                    <span>确认规则, {state.timeLeft}s 后自动确认</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const sortedPlayers = [...state.players].sort((a, b) => a.rank - b.rank);

  return (
    <div style={styles.gameArea}>
      <div style={styles.headerRow}>
        <span style={styles.roundLabel}>信任考验 · Round {state.currentRound} / 4</span>
        {phase === 'choosing' && <span style={styles.timerDisplay}>{state.timeLeft}s</span>}
        {phase === 'resolving' && <span style={styles.resolvingLabel}>结算中</span>}
        {phase === 'finished' && <span style={styles.resolvingLabel}>结束</span>}
      </div>

      <div style={styles.containerLayout}>
        <div style={styles.leftPlayboard}>
          <div style={styles.readyBoard}>
            {sortedPlayers.map((p) => {
              const isMe = p.id === effectivePlayerId;
              const isFirst = p.rank === 1;
              const cardStyle = isFirst
                ? isMe
                  ? styles.readyCardFirstMe
                  : styles.readyCardFirst
                : isMe
                  ? styles.readyCardMe
                  : styles.readyCard;
              const rankStyle = isFirst ? styles.playerRankFirst : styles.playerRank;
              const nameStyle = isFirst ? styles.playerNameFirst : isMe ? styles.playerNameMe : styles.playerName;

              return (
                <div key={p.id} style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={rankStyle}>第 {p.rank} 名</span>
                    <span style={nameStyle}>{getPlayerDisplayName(p.id)}</span>
                    {isMe && (
                      <span style={isFirst ? styles.badgeMeIconFirst : styles.badgeMeIcon}>
                        {isFirst ? '我 / 领先' : '我'}
                      </span>
                    )}
                  </div>

                  {phase === 'choosing' && (
                    <span style={p.isReady ? styles.badgeReady : styles.badgeThinking}>
                      {p.isReady ? '已就绪' : '思考中'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {phase === 'choosing' && (
            <div style={styles.choiceArea}>
              <p style={styles.choicePrompt}>
                {myChoice !== null ? '已记录选择, 倒计时结束前可更改' : '选择本轮策略, 未选默认合作'}
              </p>
              <div style={styles.choiceButtons}>
                <button
                  type="button"
                  style={myChoice === 1 ? styles.buttonCSelected : styles.buttonC}
                  onClick={() => handleChoice(1)}
                >
                  <span>合作</span>
                  <span style={styles.buttonSubtitle}>C</span>
                </button>

                <button
                  type="button"
                  style={myChoice === 2 ? styles.buttonDSelected : styles.buttonD}
                  onClick={() => handleChoice(2)}
                >
                  <span>竞争</span>
                  <span style={styles.buttonSubtitle}>D</span>
                </button>
              </div>
            </div>
          )}

          {phase === 'resolving' && (
            <div style={styles.revealContainer}>
              <h3 style={styles.revealTitle}>本轮结算</h3>
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
                        {p.choice === 2 ? '竞争' : '合作'}
                      </span>
                      <span style={scoreStyle}>{scoreChange}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {phase === 'finished' && (
            <div style={styles.revealContainer}>
              <h3 style={styles.revealTitle}>信任考验结束</h3>
              <p style={styles.choicePrompt}>分数已计入总积分, 奖励骰子已分配</p>
            </div>
          )}
        </div>

        <div style={styles.rightRuleboard}>
          <h3 style={styles.ruleTitle}>计分规则 / {playerCountLabel}</h3>
          <p style={styles.ruleSubtitle}>合作提升集体收益, 竞争改变个人收益</p>
          <div style={styles.ruleList}>
            {effectiveParticipantIds.length === 3 ? (
              <>
                <div style={styles.ruleItemHighlight}>
                  <p style={styles.ruleItemText}>全员合作</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleC}>合作者 +4</span>
                  </div>
                </div>
                <div style={styles.ruleItem}>
                  <p style={styles.ruleItemText}>全员竞争</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleD}>竞争者 +1</span>
                  </div>
                </div>
                <div style={styles.ruleItem}>
                  <p style={styles.ruleItemText}>1人竞争, 2人合作</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleD}>竞争者 +6</span>
                    <span style={styles.badgeRuleC}>合作者 +1</span>
                  </div>
                </div>
                <div style={styles.ruleItem}>
                  <p style={styles.ruleItemText}>2人竞争, 1人合作</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleD}>竞争者 +0</span>
                    <span style={styles.badgeRuleC}>合作者 +6</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={styles.ruleItemHighlight}>
                  <p style={styles.ruleItemText}>全员合作</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleC}>合作者 +5</span>
                  </div>
                </div>
                <div style={styles.ruleItem}>
                  <p style={styles.ruleItemText}>全员竞争</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleD}>竞争者 +1</span>
                  </div>
                </div>
                <div style={styles.ruleItem}>
                  <p style={styles.ruleItemText}>1人竞争, 3人合作</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleD}>竞争者 +7</span>
                    <span style={styles.badgeRuleC}>合作者 +2</span>
                  </div>
                </div>
                <div style={styles.ruleItem}>
                  <p style={styles.ruleItemText}>2人竞争, 2人合作</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleD}>竞争者 +0</span>
                    <span style={styles.badgeRuleC}>合作者 +1</span>
                  </div>
                </div>
                <div style={styles.ruleItem}>
                  <p style={styles.ruleItemText}>3人竞争, 1人合作</p>
                  <div style={styles.ruleScoreRow}>
                    <span style={styles.badgeRuleD}>竞争者 -1</span>
                    <span style={styles.badgeRuleC}>合作者 +3</span>
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
