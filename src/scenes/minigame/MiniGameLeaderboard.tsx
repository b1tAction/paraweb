import type React from 'react';
import { useGameStore } from '../../store/gameStore';
import type { MiniGameResult } from '../../types/protocol';
import { getDisambiguatedDisplayName } from '../../utils/displayName';
import { styles } from './MiniGameStyles';

interface MiniGameLeaderboardProps {
  gameType: string;
  result: MiniGameResult;
}

const DICE_PROBABILITY_DETAIL_PATTERN = /\s*[（(][^()（）]*[%％][^()（）]*[）)]/g;

function formatDiceDescription(description?: string) {
  return (description || '').replace(DICE_PROBABILITY_DETAIL_PATTERN, '').trim();
}

export const MiniGameLeaderboard: React.FC<MiniGameLeaderboardProps> = ({ gameType, result }) => {
  const { players, myPlayerId, definitions } = useGameStore();

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
      case 'dilemma_race': {
        const finishPosition = getGameDataNumber(gameData, 'finish_position');
        const roundsPlayed = getGameDataNumber(gameData, 'rounds_played');
        const blockedCount = getGameDataNumber(gameData, 'blocked_count');
        return `Position: ${finishPosition === 15 ? 'Finished' : (finishPosition ?? '?')} | Rounds: ${roundsPlayed ?? '?'} | Blocked: ${blockedCount ?? 0}x`;
      }
      default:
        return null;
    }
  };

  const getDiceInfo = (rank: number) => {
    // Map rank to dice type key (matches backend RankToDiceType)
    const RANK_TO_DICE_KEY: Record<number, string> = { 1: 'gold', 2: 'silver', 3: 'copper' };
    const diceKey = RANK_TO_DICE_KEY[rank] || 'wood';
    const diceDef = definitions?.dice[diceKey];

    const BADGE_STYLES: Record<string, React.CSSProperties> = {
      gold: styles.badgeGold,
      silver: styles.badgeSilver,
      copper: styles.badgeCopper,
      wood: styles.badgeWood,
    };

    return {
      label: diceDef?.name || (rank === 1 ? '金骰子' : rank === 2 ? '银骰子' : rank === 3 ? '铜骰子' : '木骰子'),
      badgeStyle: BADGE_STYLES[diceKey] || styles.badgeWood,
      desc: formatDiceDescription(diceDef?.desc),
    };
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
