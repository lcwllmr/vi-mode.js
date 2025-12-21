import type { EditorState, MotionDefinition } from "./types";
import { clampNumber } from "./utils";

export const createMotions = <TState extends EditorState = EditorState>(): Map<
  string,
  MotionDefinition<TState>
> => {
  const motions = new Map<string, MotionDefinition<TState>>();

  motions.set("h", {
    key: "h",
    move: (state, count) => {
      const { row, col } = state.cursor.getPosition();
      const targetCol = Math.max(0, col - Math.max(1, count));
      state.cursor.setPosition(row, targetCol, state.buffer);
    },
    toRange: (state, count) => {
      const { row, col } = state.cursor.getPosition();
      const delta = Math.max(1, count);
      const targetCol = Math.max(0, col - delta);
      return { type: "character", row, startCol: targetCol, endCol: col };
    },
  });

  motions.set("l", {
    key: "l",
    move: (state, count) => {
      const { row, col } = state.cursor.getPosition();
      const lineLength = state.buffer.getLineLength(row);
      const targetCol = Math.min(lineLength, col + Math.max(1, count));
      state.cursor.setPosition(row, targetCol, state.buffer);
    },
    toRange: (state, count) => {
      const { row, col } = state.cursor.getPosition();
      const step = Math.max(1, count);
      const lineLength = state.buffer.getLineLength(row);
      const targetCol = Math.min(lineLength, col + step);
      return { type: "character", row, startCol: col, endCol: targetCol };
    },
  });

  motions.set("j", {
    key: "j",
    move: (state, count) => {
      const { row, col } = state.cursor.getPosition();
      const targetRow = clampNumber(
        row + Math.max(1, count),
        0,
        state.buffer.lineCount() - 1,
      );
      state.cursor.setPosition(targetRow, col, state.buffer);
    },
    toRange: (state, count) => {
      const { row } = state.cursor.getPosition();
      const lastRow = state.buffer.lineCount() - 1;
      const endRow = clampNumber(row + Math.max(1, count) - 1, 0, lastRow);
      return { type: "line", startRow: row, endRow };
    },
  });

  motions.set("k", {
    key: "k",
    move: (state, count) => {
      const { row, col } = state.cursor.getPosition();
      const targetRow = clampNumber(
        row - Math.max(1, count),
        0,
        state.buffer.lineCount() - 1,
      );
      state.cursor.setPosition(targetRow, col, state.buffer);
    },
    toRange: (state, count) => {
      const { row } = state.cursor.getPosition();
      const startRow = clampNumber(row - (Math.max(1, count) - 1), 0, row);
      return { type: "line", startRow, endRow: row };
    },
  });

  motions.set("0", {
    key: "0",
    move: (state) => {
      const { row } = state.cursor.getPosition();
      state.cursor.setPosition(row, 0, state.buffer);
    },
    toRange: (state) => {
      const { row, col } = state.cursor.getPosition();
      return { type: "character", row, startCol: 0, endCol: col };
    },
  });

  motions.set("$", {
    key: "$",
    move: (state) => {
      const { row } = state.cursor.getPosition();
      const lineLength = state.buffer.getLineLength(row);
      state.cursor.setPosition(
        row,
        lineLength === 0 ? 0 : lineLength - 1,
        state.buffer,
      );
    },
    toRange: (state) => {
      const { row, col } = state.cursor.getPosition();
      const lineLength = state.buffer.getLineLength(row);
      const safeCol =
        lineLength === 0 ? 0 : Math.min(col, Math.max(0, lineLength - 1));
      return { type: "character", row, startCol: safeCol, endCol: lineLength };
    },
  });

  return motions;
};
