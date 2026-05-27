import { useGameStore } from '../../store/gameStore';
import type { MiniGameResult, MiniGameStart, Player } from '../../types/protocol';

export interface MiniGameViewContext {
  matchId: string;
  round: number;
  miniGameStart: MiniGameStart | null;
  miniGameResult: MiniGameResult | null;
  myPlayerId: string;
  players: Player[];
}

export function useMiniGameViewContext(override?: MiniGameViewContext): MiniGameViewContext {
  const storeContext = useGameStore((state) => ({
    matchId: state.matchId,
    round: state.round,
    miniGameStart: state.miniGameStart,
    miniGameResult: state.miniGameResult,
    myPlayerId: state.myPlayerId,
    players: state.players,
  }));

  return override ?? storeContext;
}

