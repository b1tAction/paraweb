import React, { useEffect, useMemo, useState } from 'react';
import { parseRoomLabel } from '../api/nakama';
import { Scene, useGameStore } from '../store/gameStore';
import { gameService } from '../service/NakamaService';

type RoomListItem = {
  match_id?: string;
  label?: string;
  size?: number;
};

async function getErrorMessage(err: unknown): Promise<string> {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  try {
    return JSON.stringify(err);
  } catch {
    return '未知错误';
  }
}

function isWaitingRoom(room: RoomListItem): boolean {
  const label = parseRoomLabel(room.label);
  if (!label) return true;
  if (!label.status) return true;
  return label.status === 'waiting';
}

function getLobbyName(room: RoomListItem): string {
  const label = parseRoomLabel(room.label);
  return label?.lobby_name || label?.host_display_name || 'OPEN LOBBY';
}

export const JoinRoomScene: React.FC = () => {
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const visibleRooms = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rooms;
    return rooms.filter((room) => {
      const label = parseRoomLabel(room.label);
      return (
        room.match_id?.toLowerCase().includes(normalized) ||
        label?.lobby_name?.toLowerCase().includes(normalized) ||
        label?.host_display_name?.toLowerCase().includes(normalized)
      );
    });
  }, [query, rooms]);

  const selectedRoom = rooms.find((room) => room.match_id === selectedMatchId);

  const refreshRooms = async () => {
    try {
      setError('');
      setIsLoading(true);
      const list = await gameService.listRooms();
      const waitingRooms = list.filter(isWaitingRoom);
      setRooms(waitingRooms);
      if (selectedMatchId && !waitingRooms.some((room) => room.match_id === selectedMatchId)) {
        setSelectedMatchId('');
      }
    } catch (err: unknown) {
      const message = await getErrorMessage(err);
      setError(`刷新房间失败：${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshRooms();
  }, []);

  const handleSearch = () => {
    const exact = rooms.find((room) => room.match_id === query.trim());
    if (exact?.match_id) {
      setSelectedMatchId(exact.match_id);
      setError('');
      return;
    }
    if (query.trim()) {
      setSelectedMatchId(query.trim());
      setError('');
      return;
    }
    setError('请输入房间 ID 或房间名');
  };

  const handleJoin = async () => {
    if (!selectedMatchId) {
      setError('请选择一个房间');
      return;
    }

    try {
      setError('');
      setIsJoining(true);
      await gameService.joinRoom(selectedMatchId);
      useGameStore.getState().setScene(Scene.Lobby);
    } catch (err: unknown) {
      const message = await getErrorMessage(err);
      setError(`加入房间失败：${message}`);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <main style={styles.page}>
      <div style={styles.cornerTitle}>CONNECT</div>

      <section style={styles.panel}>
        <div style={styles.actionRow}>
          <button type="button" onClick={refreshRooms} disabled={isLoading} style={styles.smallButton}>
            {isLoading ? 'LOADING' : 'REFRESH'}
          </button>
          <button type="button" onClick={handleSearch} style={styles.smallButton}>
            SEARCH
          </button>
          <button
            type="button"
            onClick={() => useGameStore.getState().setScene(Scene.CreateRoom)}
            style={styles.smallButton}
          >
            CREATE
          </button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearch();
          }}
          placeholder="Search lobby name or room id"
          style={styles.searchInput}
        />

        <div style={styles.roomList}>
          {visibleRooms.length === 0 && (
            <div style={styles.emptyState}>{isLoading ? 'Searching...' : 'No lobby found'}</div>
          )}

          {visibleRooms.map((room) => {
            const label = parseRoomLabel(room.label);
            const isSelected = selectedMatchId === room.match_id;
            const playerCount = room.size ?? 0;
            const maxPlayers = label?.max_players || 4;
            return (
              <button
                key={room.match_id}
                type="button"
                onClick={() => room.match_id && setSelectedMatchId(room.match_id)}
                style={{ ...styles.roomItem, ...(isSelected ? styles.roomItemSelected : undefined) }}
              >
                <span style={styles.roomName}>{getLobbyName(room)}</span>
                <span style={styles.roomMeta}>{playerCount} / {maxPlayers}</span>
              </button>
            );
          })}
        </div>

        {selectedMatchId && !selectedRoom && (
          <div style={styles.directRoom}>
            ROOM ID: <span style={styles.directRoomId}>{selectedMatchId}</span>
          </div>
        )}

        <button type="button" onClick={handleJoin} disabled={isJoining || !selectedMatchId} style={styles.joinButton}>
          {isJoining ? 'JOINING...' : 'JOIN'}
        </button>

        {error && <p style={styles.error}>{error}</p>}
      </section>
    </main>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '28px',
    backgroundImage: 'url("/assets/cover.png")',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    fontFamily: 'Zpix, sans-serif',
    color: '#fff7d6',
  },
  cornerTitle: {
    position: 'fixed',
    left: '28px',
    top: '24px',
    color: '#fff0b8',
    fontSize: '24px',
    textShadow: '0 3px 0 rgba(0,0,0,0.42)',
  },
  panel: {
    width: 'min(620px, calc(100vw - 56px))',
    maxHeight: 'calc(100vh - 96px)',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '22px',
    background: 'rgba(18, 30, 31, 0.74)',
    border: '1px solid rgba(255, 233, 172, 0.38)',
    borderRadius: '8px',
    boxShadow: '0 18px 44px rgba(0,0,0,0.34)',
    backdropFilter: 'blur(3px)',
  },
  actionRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
  },
  smallButton: {
    minHeight: '38px',
    color: '#fff7d6',
    background: 'rgba(255, 247, 214, 0.1)',
    border: '1px solid rgba(255, 247, 214, 0.35)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '12px',
  },
  searchInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 13px',
    color: '#20322a',
    background: '#fff8df',
    border: '1px solid rgba(58, 47, 32, 0.38)',
    borderRadius: '8px',
    fontFamily: 'inherit',
    fontSize: '14px',
    outline: 'none',
  },
  roomList: {
    minHeight: '220px',
    maxHeight: '46vh',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    overflow: 'auto',
  },
  emptyState: {
    minHeight: '160px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#d7c48b',
    border: '1px dashed rgba(255, 247, 214, 0.24)',
    borderRadius: '8px',
  },
  roomItem: {
    minHeight: '54px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 14px',
    color: '#fff7d6',
    background: 'rgba(255, 247, 214, 0.08)',
    border: '1px solid rgba(255, 247, 214, 0.22)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  roomItemSelected: {
    background: 'rgba(77, 135, 91, 0.46)',
    borderColor: 'rgba(169, 230, 160, 0.7)',
  },
  roomName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  roomMeta: {
    flex: '0 0 auto',
    color: '#ead8a3',
    fontSize: '12px',
  },
  directRoom: {
    padding: '8px 10px',
    color: '#ead8a3',
    background: 'rgba(255, 247, 214, 0.08)',
    borderRadius: '8px',
    fontSize: '12px',
  },
  directRoomId: {
    color: '#fff7d6',
  },
  joinButton: {
    minHeight: '48px',
    color: '#352c20',
    backgroundImage: 'url("/assets/button/button_up.png")',
    backgroundSize: '100% 100%',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '17px',
    imageRendering: 'pixelated',
  },
  error: {
    margin: 0,
    padding: '10px 12px',
    color: '#ffe0d9',
    background: 'rgba(97, 30, 22, 0.66)',
    border: '1px solid rgba(255, 184, 172, 0.35)',
    borderRadius: '8px',
    fontSize: '13px',
  },
};

export default JoinRoomScene;
