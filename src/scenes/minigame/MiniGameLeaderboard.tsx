import React from 'react';
import { useGameStore } from '../../store/gameStore';
import { styles } from './MiniGameStyles';
import { getDisambiguatedDisplayName } from '../../utils/displayName';
import type { MiniGameResult } from '../../types/protocol';

interface MiniGameLeaderboardProps {
  gameType: string;
  result: MiniGameResult;
}

export const MiniGameLeaderboard: React.FC<MiniGameLeaderboardProps> = ({
  gameType,
  result,
}) => {
  const { players, myPlayerId } = useGameStore();

  const allPlayersData = players.map(p => ({
    displayName: p.display_name || p.player_id,
    userId: p.player_id,
  }));

  const renderGameDataDetail = (gameData?: Record<string, any>) => {
    if (!gameData) return null;

    switch (gameType) {
      case 'dice_race':
        return `${gameData.dice1} + ${gameData.dice2} = ${gameData.score}`;
      case 'count_seconds':
        return `${gameData.elapsed?.toFixed(2)}s (偏差: ${gameData.deviation?.toFixed(2)}s)`;
      case 'math_calc':
        return `正确率: ${(gameData.accuracy * 100).toFixed(0)}% | 用时: ${(gameData.time_ms / 1000).toFixed(1)}s`;
      case 'rainbow_memory':
        return `${gameData.accuracy === 1 ? '正确' : '错误'} | 用时: ${(gameData.time_ms / 1000).toFixed(1)}s`;
      case 'vernier':
        return `偏差: ${gameData.deviation?.toFixed(1)}%`;
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
      case 1: return styles.rank1;
      case 2: return styles.rank2;
      case 3: return styles.rank3;
      default: return styles.rank4;
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return '🪵';
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
              animation: `leaderboard-slide-in 0.4s ease-out ${index * 0.1}s both`
            }}
          >
            <div style={styles.leaderboardRank}>
              {getRankIcon(entry.rank)}
            </div>
            
            <div style={styles.leaderboardInfo}>
              <div style={styles.leaderboardName}>{getDisambiguatedDisplayName(entry.display_name || entry.player_id, entry.player_id, allPlayersData)}{entry.player_id === myPlayerId ? ' (我)' : ''}</div>
              <div style={styles.leaderboardDetail}>{renderGameDataDetail(entry.game_data)}</div>
            </div>

            <div style={styles.leaderboardDiceArea}>
              <div style={{ ...styles.diceBadge, ...diceInfo.badgeStyle }}>
                {diceInfo.label}
              </div>
              <div style={styles.diceDesc}>{diceInfo.desc}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
