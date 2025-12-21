export type {
  Mode,
  CursorPosition,
  BufferAdapter,
  EditorState,
  Command,
  ResolvedCommand,
  MotionRange,
  MotionDefinition,
  SelectionSegment,
  NormalizedSelectionRange,
} from "./types";

export { EditorBuffer } from "./editor-buffer";
export { CursorState } from "./cursor-state";
export type { EditorDom } from "./editor-dom";
export { initializeEditorDom } from "./editor-dom";
export {
  VisualModeCommandResolver,
  NormalModeCommandResolver,
} from "./command-resolvers";
export type { ModeCommandResolver } from "./command-resolvers";
export { KeyMapper } from "./key-mapper";
export { UndoManager } from "./undo-manager";
export { createMotions } from "./motions";
export { createNormalKeymap } from "./normal-keymap";
export { createInsertKeymap, insertTextCommand } from "./insert-keymap";
export { createDefaultKeyMapper } from "./default-key-mapper";
export { ViModeController, createFullEditor } from "./controller";
