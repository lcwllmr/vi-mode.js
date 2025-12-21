import type { CursorState } from "./cursor-state";

export type Mode = "insert" | "normal" | "visual-character" | "visual-line";

export interface CursorPosition {
  row: number;
  col: number;
}

export interface BufferAdapter {
  extractContent(): string;
  replaceContent(content: string): void;
  lineCount(): number;
  getLineText(row: number): string;
  getLineLength(row: number): number;
  setLineText(row: number, text: string): void;
  insertLineAfter(row: number, text: string): void;
  insertLineBefore(row: number, text: string): void;
  removeLine(row: number): void;
}

export interface VisualSelection {
  type: "character" | "line";
  anchor: CursorPosition;
}

export interface EditorSnapshot {
  content: string;
  cursor: CursorPosition;
  mode: Mode;
  selection: VisualSelection | null;
}

export interface EditorState<TBuffer extends BufferAdapter = BufferAdapter> {
  mode: Mode;
  cursor: CursorState;
  buffer: TBuffer;
  selection: VisualSelection | null;
}

export type Command<TState extends EditorState = EditorState> = (
  state: TState,
  event: KeyboardEvent,
) => void;

export interface ResolvedCommand<TState extends EditorState = EditorState> {
  command: Command<TState>;
  isUndo?: boolean;
  isRedo?: boolean;
}

export type MotionRange =
  | { type: "line"; startRow: number; endRow: number }
  | { type: "character"; row: number; startCol: number; endCol: number };

export interface MotionDefinition<TState extends EditorState = EditorState> {
  key: string;
  move: (state: TState, count: number) => void;
  toRange: (state: TState, count: number) => MotionRange;
}

export interface SelectionSegment {
  row: number;
  startCol: number;
  endCol: number;
}

export interface CharacterSelectionRange {
  type: "character";
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export type NormalizedSelectionRange =
  | { type: "line"; startRow: number; endRow: number }
  | CharacterSelectionRange;
