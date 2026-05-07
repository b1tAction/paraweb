import type React from 'react';
import { useGameStore } from '../../store/gameStore';
import type { MiniGameResult } from '../../types/protocol';
import { getDisambiguatedDisplayName } from '../../utils/displayName';
import { styles } from './MiniGameStyles';

interface MiniGameLeaderboardProps {
  gameType: string;
  result: MiniGameResult;
}

export const MiniGameLeaderboard: React.FC<MiniGameLeaderboardProps> = ({ gameType, result }) => {
  const { players, myPlayerId } = useGameStore();

  const allPlayersData = players.map((p) => ({
    displayName: p.display_name || p.player_id,
    userId: p.player_id,
  }));

  const getGameDataNumber = (gameData: Record<string, unknown>, key: string): number | null => {
    const value = gameData[key];
    return typeof value === 'number' ? value : null;
  };

  const formatFixed = (value: number | null, digits: number): string => (value === null ? '?' : value.toFixed(digits));

  const renderGameDataDetail = (gameData?: Record<string, unknown>) => {
    if (!gameData) return null;

    switch (gameType) {
      case 'dice_race':
        return `${formatFixed(getGameDataNumber(gameData, 'dice1'), 0)} + ${formatFixed(getGameDataNumber(gameData, 'dice2'), 0)} = ${formatFixed(getGameDataNumber(gameData, 'score'), 0)}`;
      case 'count_seconds':
        return `${formatFixed(getGameDataNumber(gameData, 'elapsed'), 2)}s (偏差: ${formatFixed(getGameDataNumber(gameData, 'deviation'), 2)}s)`;
      case 'math_calc': {
        const accuracy = getGameDataNumber(gameData, 'accuracy');
        const timeMs = getGameDataNumber(gameData, 'time_ms');
        return `正确率: ${accuracy === null ? '?' : `${(accuracy * 100).toFixed(0)}%`} | 用时: ${timeMs === null ? '?' : `${(timeMs / 1000).toFixed(1)}s`}`;
      }
      case 'rainbow_memory': {
        const accuracy = getGameDataNumber(gameData, 'accuracy');
        const timeMs = getGameDataNumber(gameData, 'time_ms');
        return `${accuracy === 1 ? '正确' : '错误'} | 用时: ${timeMs === null ? '?' : `${(timeMs / 1000).toFixed(1)}s`}`;
      }
      case 'vernier':
        return `偏差: ${formatFixed(getGameDataNumber(gameData, 'deviation'), 1)}%`;
      default:
        return null;
    }
  };

  const getDiceInfo = (rank: number) => {
    switch (rank) {
      case 1:
        return { label: '金骰子', badgeStyle: styles.badgeGold, desc: '大幅提升大数概率' };
      case 2:
        return { label: '银骰子', badgeStyle: styles.badgeSilver, desc: '提升大数概率' };
      case 3:
        return { label: '铜骰子', badgeStyle: styles.badgeCopper, desc: '略微提升概率' };
      default:
        return { label: '普通骰子', badgeStyle: styles.badgeWood, desc: '均衡概率' };
    }
  };

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1:
        return styles.rank1;
      case 2:
        return styles.rank2;
      case 3:
        return styles.rank3;
      default:
        return styles.rank4;
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return '🥇';
      case 2:
        return '🥈';
      case 3:
        return '🥉';
      default:
        return '🪵';
    }
  };

  return (
    <div style={styles.leaderboardContainer}>
      <h2 style={styles.leaderboardHeader}>本轮排名</h2>
      {result.rankings.map((entry, index) => {
        const diceInfo = getDiceInfo(entry.rank);
        const rankStyle = getRankStyle(entry.rank);

        return (
          <div
            key={entry.player_id}
            style={{
              ...styles.leaderboardRow,
              ...rankStyle,
              animation: `leaderboard-slide-in 0.4s ease-out ${index * 0.1}s both`,
            }}
          >
            <div style={styles.leaderboardRank}>{getRankIcon(entry.rank)}</div>

            <div style={styles.leaderboardInfo}>
              <div style={styles.leaderboardName}>
                {getDisambiguatedDisplayName(entry.display_name || entry.player_id, entry.player_id, allPlayersData)}
                {entry.player_id === myPlayerId ? ' (我)' : ''}
              </div>
              <div style={styles.leaderboardDetail}>{renderGameDataDetail(entry.game_data)}</div>
            </div>

            <div style={styles.leaderboardDiceArea}>
              <div style={{ ...styles.diceBadge, ...diceInfo.badgeStyle }}>{diceInfo.label}</div>
              <div style={styles.diceDesc}>{diceInfo.desc}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
