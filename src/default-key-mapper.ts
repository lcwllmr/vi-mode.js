import type { Command, EditorState, NormalizedSelectionRange } from "./types";
import {
  NormalModeCommandResolver,
  VisualModeCommandResolver,
} from "./command-resolvers";
import { createInsertKeymap, insertTextCommand } from "./insert-keymap";
import { createNormalKeymap } from "./normal-keymap";
import { KeyMapper } from "./key-mapper";
import type { UndoManager } from "./undo-manager";

export const createDefaultKeyMapper = <
  TState extends EditorState = EditorState,
>(
  undoManager: UndoManager<TState>,
  setRegister: (text: string) => void,
  copySelectionToRegister: () => void,
  getSelectionRange: () => NormalizedSelectionRange | null,
  deleteSelectionInBuffer: (range: NormalizedSelectionRange) => void,
  pasteFromRegister: (before: boolean) => void,
  options?: {
    extendNormalCommands?: (commands: Map<string, Command<TState>>) => void;
  },
): {
  keyMapper: KeyMapper<TState>;
  undoCommand: Command<TState>;
  redoCommand: Command<TState>;
} => {
  const { motions, normalCommands, undoCommand, redoCommand } =
    createNormalKeymap(undoManager);
  options?.extendNormalCommands?.(normalCommands);
  const normalResolver = new NormalModeCommandResolver<TState>(
    motions,
    normalCommands,
    undoManager,
    (text) => setRegister(text),
  );
  const exitVisualCommand: Command = (state, event) => {
    event.preventDefault();
    state.selection = null;
    state.mode = "normal";
  };
  const yankVisualCommand: Command = (state, event) => {
    event.preventDefault();
    copySelectionToRegister();
    state.selection = null;
    state.mode = "normal";
  };
  const deleteVisualCommand: Command = (state, event) => {
    event.preventDefault();
    const range = getSelectionRange();
    if (range) {
      copySelectionToRegister();
      deleteSelectionInBuffer(range);
    }
    state.selection = null;
    state.mode = "normal";
  };
  const visualResolver = new VisualModeCommandResolver<TState>(
    motions,
    exitVisualCommand,
    yankVisualCommand,
    deleteVisualCommand,
  );
  normalCommands.set("p", (state) => {
    pasteFromRegister(false);
    state.mode = "normal";
  });
  normalCommands.set("P", (state) => {
    pasteFromRegister(true);
    state.mode = "normal";
  });

  return {
    keyMapper: new KeyMapper<TState>(
      normalResolver,
      visualResolver,
      createInsertKeymap<TState>(),
      insertTextCommand as Command<TState>,
    ),
    undoCommand,
    redoCommand,
  };
};
