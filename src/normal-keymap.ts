import type { Command, EditorState, MotionDefinition } from "./types";
import type { UndoManager } from "./undo-manager";
import { createMotions } from "./motions";

export const createNormalKeymap = <TState extends EditorState = EditorState>(
  undoManager: UndoManager<TState>,
): {
  motions: Map<string, MotionDefinition<TState>>;
  normalCommands: Map<string, Command<TState>>;
  undoCommand: Command<TState>;
  redoCommand: Command<TState>;
} => {
  const normalCommands = new Map<string, Command<TState>>();

  normalCommands.set("i", (state) => {
    state.mode = "insert";
  });

  normalCommands.set("a", (state) => {
    state.cursor.moveRight(state.buffer);
    state.mode = "insert";
  });

  normalCommands.set("A", (state) => {
    state.cursor.moveToLineEnd(state.buffer);
    state.mode = "insert";
  });

  normalCommands.set("o", (state) => {
    const { row } = state.cursor.getPosition();
    state.buffer.insertLineAfter(row, "");
    state.cursor.setPosition(row + 1, 0, state.buffer);
    state.mode = "insert";
  });

  normalCommands.set("O", (state) => {
    const { row } = state.cursor.getPosition();
    state.buffer.insertLineBefore(row, "");
    state.cursor.setPosition(row, 0, state.buffer);
    state.mode = "insert";
  });

  normalCommands.set("x", (state) => {
    const { row, col } = state.cursor.getPosition();
    const text = state.buffer.getLineText(row);
    const lineCount = state.buffer.lineCount();
    if (col < text.length) {
      const updated = text.slice(0, col) + text.slice(col + 1);
      state.buffer.setLineText(row, updated);
    } else if (col === text.length && row < lineCount - 1) {
      const nextText = state.buffer.getLineText(row + 1);
      state.buffer.setLineText(row, text + nextText);
      state.buffer.removeLine(row + 1);
    }
  });

  normalCommands.set("D", (state) => {
    const { row, col } = state.cursor.getPosition();
    const text = state.buffer.getLineText(row);
    state.buffer.setLineText(row, text.slice(0, col));
  });

  normalCommands.set("v", (state) => {
    state.selection = {
      type: "character",
      anchor: state.cursor.getPosition(),
    };
    state.mode = "visual-character";
  });

  normalCommands.set("V", (state) => {
    state.selection = {
      type: "line",
      anchor: state.cursor.getPosition(),
    };
    state.mode = "visual-line";
  });

  const undoCommand: Command<TState> = (state, event) => {
    event.preventDefault();
    if (undoManager.undo(state)) {
      state.mode = "normal";
    }
  };

  const redoCommand: Command<TState> = (state, event) => {
    event.preventDefault();
    if (undoManager.redo(state)) {
      state.mode = "normal";
    }
  };

  return {
    motions: createMotions(),
    normalCommands,
    undoCommand,
    redoCommand,
  };
};
