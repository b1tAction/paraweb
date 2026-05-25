export const DEV_BOARD_FOCUS_CELL_EVENT = 'dev-board-focus-cell';

export type DevBoardFocusCellDetail = {
  index: number;
};

let latestDevBoardFocusCellIndex: number | null = null;

export function dispatchDevBoardFocusCell(index: number) {
  latestDevBoardFocusCellIndex = index;

  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<DevBoardFocusCellDetail>(DEV_BOARD_FOCUS_CELL_EVENT, {
      detail: { index },
    }),
  );
}

export function getLatestDevBoardFocusCellIndex() {
  return latestDevBoardFocusCellIndex;
}
