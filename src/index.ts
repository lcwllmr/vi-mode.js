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

interface VisualSelection {
  type: "character" | "line";
  anchor: CursorPosition;
}

interface EditorSnapshot {
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

interface CharacterSelectionRange {
  type: "character";
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export type NormalizedSelectionRange =
  | { type: "line"; startRow: number; endRow: number }
  | CharacterSelectionRange;

const clampNumber = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

const makeKey = (event: KeyboardEvent): string => {
  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push("Ctrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.metaKey) modifiers.push("Meta");
  modifiers.push(event.key);
  return modifiers.join("+");
};

export class EditorBuffer implements BufferAdapter {
  private document: Document;
  private container: HTMLDivElement;
  private contentDiv: HTMLDivElement;

  constructor(document: Document, container: HTMLDivElement, content: string) {
    this.document = document;
    this.container = container;
    this.contentDiv = this.container.appendChild(
      this.document.createElement("div"),
    );
    this.contentDiv.style.position = "relative";
    this.contentDiv.style.zIndex = "1";
    for (const line of content.split("\n")) {
      this.contentDiv.appendChild(this.makeLineDiv(line));
    }
  }

  public getContentDiv(): HTMLDivElement {
    return this.contentDiv;
  }

  public extractContent(): string {
    const lines: string[] = [];
    for (const lineDiv of this.contentDiv.children) {
      lines.push((lineDiv as HTMLDivElement).textContent || "");
    }
    return lines.join("\n");
  }

  public replaceContent(content: string): void {
    while (this.contentDiv.firstChild) {
      this.contentDiv.removeChild(this.contentDiv.firstChild);
    }
    for (const line of content.split("\n")) {
      this.contentDiv.appendChild(this.makeLineDiv(line));
    }
  }

  public lineCount(): number {
    return this.contentDiv.children.length;
  }

  public getLineDiv(row: number): HTMLDivElement {
    return this.contentDiv.children[row] as HTMLDivElement;
  }

  public getLineText(row: number): string {
    return this.getLineDiv(row).textContent || "";
  }

  public getLineLength(row: number): number {
    return this.getLineText(row).length;
  }

  public setLineText(row: number, text: string): void {
    this.getLineDiv(row).textContent = text;
  }

  public insertLineAfter(row: number, text: string): void {
    const baseLine = this.getLineDiv(row);
    const newLine = this.makeLineDiv(text);
    this.contentDiv.insertBefore(newLine, baseLine.nextSibling);
  }

  public insertLineBefore(row: number, text: string): void {
    const baseLine = this.getLineDiv(row);
    const newLine = this.makeLineDiv(text);
    this.contentDiv.insertBefore(newLine, baseLine);
  }

  public removeLine(row: number): void {
    this.contentDiv.removeChild(this.getLineDiv(row));
  }

  private makeLineDiv(content: string): HTMLDivElement {
    const lineDiv = this.document.createElement("div");
    lineDiv.style.height = "1em";
    lineDiv.style.whiteSpace = "pre";
    lineDiv.textContent = content;
    return lineDiv;
  }
}

export class CursorState {
  private position: CursorPosition;

  constructor(row: number, col: number) {
    this.position = { row, col };
  }

  public getPosition(): CursorPosition {
    return { ...this.position };
  }

  public clampToBuffer(buffer: BufferAdapter): void {
    const maxRow = Math.max(0, buffer.lineCount() - 1);
    const clampedRow = Math.min(Math.max(this.position.row, 0), maxRow);
    const lineLength = buffer.getLineLength(clampedRow);
    const clampedCol = Math.min(Math.max(this.position.col, 0), lineLength);
    this.position = { row: clampedRow, col: clampedCol };
  }

  public setPosition(row: number, col: number, buffer: BufferAdapter): void {
    this.position = { row, col };
    this.clampToBuffer(buffer);
  }

  public setFromSnapshot(
    position: CursorPosition,
    buffer: BufferAdapter,
  ): void {
    this.position = { ...position };
    this.clampToBuffer(buffer);
  }

  public moveLeft(): void {
    this.position.col = Math.max(0, this.position.col - 1);
  }

  public moveRight(buffer: BufferAdapter): void {
    const lineLength = buffer.getLineLength(this.position.row);
    this.position.col = Math.min(lineLength, this.position.col + 1);
  }

  public moveUp(buffer: BufferAdapter): void {
    this.position.row = Math.max(0, this.position.row - 1);
    const lineLength = buffer.getLineLength(this.position.row);
    this.position.col = Math.min(lineLength, this.position.col);
  }

  public moveDown(buffer: BufferAdapter): void {
    this.position.row = Math.min(buffer.lineCount() - 1, this.position.row + 1);
    const lineLength = buffer.getLineLength(this.position.row);
    this.position.col = Math.min(lineLength, this.position.col);
  }

  public moveToLineStart(): void {
    this.position.col = 0;
  }

  public moveToLineEnd(buffer: BufferAdapter): void {
    this.position.col = buffer.getLineLength(this.position.row);
  }
}

export interface EditorDom {
  root: HTMLDivElement;
  buffer: EditorBuffer;
  selectionOverlay: HTMLDivElement;
  cursorSpan: HTMLSpanElement;
}

class CommandExecutor<TState extends EditorState = EditorState> {
  constructor(
    private state: TState,
    private undoManager: UndoManager<TState>,
  ) {}

  public run(
    command: Command<TState>,
    event: KeyboardEvent,
    { recordUndo }: { recordUndo: boolean },
  ): void {
    if (recordUndo) {
      const snapshot = this.undoManager.createSnapshot(this.state);
      command(this.state, event);
      this.undoManager.recordChange(snapshot, this.state);
      return;
    }

    command(this.state, event);
  }
}

export class VisualModeCommandResolver<
  TState extends EditorState = EditorState,
> {
  private countBuffer = "";

  constructor(
    private motions: Map<string, MotionDefinition<TState>>,
    private exitCommand: Command<TState>,
    private yankCommand: Command<TState>,
    private deleteCommand: Command<TState>,
  ) {}

  public resolve(event: KeyboardEvent): ResolvedCommand<TState> | null {
    if (this.isPureModifier(event.key)) return null;

    if (this.isDigit(event.key)) {
      if (this.shouldTreatZeroAsMotion(event.key)) {
        return this.resolveMotionKey("0");
      }
      this.countBuffer += event.key;
      return null;
    }

    const key = makeKey(event);
    if (key === "Escape") {
      this.countBuffer = "";
      return { command: this.exitCommand };
    }

    if (key === "y") {
      this.countBuffer = "";
      return { command: this.yankCommand };
    }

    if (key === "d") {
      this.countBuffer = "";
      return { command: this.deleteCommand };
    }

    const motion = this.resolveMotionKey(key);
    if (motion) return motion;

    this.countBuffer = "";
    return null;
  }

  private resolveMotionKey(key: string): ResolvedCommand<TState> | null {
    const motion = this.motions.get(key);
    if (!motion) return null;
    const count = this.consumeCountOrOne();
    return { command: this.buildMotionCommand(motion, count) };
  }

  private buildMotionCommand(
    motion: MotionDefinition<TState>,
    count: number,
  ): Command<TState> {
    const normalizedCount = Math.max(1, count);
    return (state) => {
      motion.move(state, normalizedCount);
    };
  }

  private consumeCountOrOne(): number {
    const parsed = this.countBuffer === "" ? NaN : Number(this.countBuffer);
    this.countBuffer = "";
    return Number.isNaN(parsed) ? 1 : parsed;
  }

  private shouldTreatZeroAsMotion(key: string): boolean {
    if (key !== "0") return false;
    return this.countBuffer === "";
  }

  private isDigit(key: string | undefined): key is string {
    return !!key && /^[0-9]$/.test(key);
  }

  private isPureModifier(key: string | undefined): boolean {
    return (
      key === "Shift" || key === "Control" || key === "Alt" || key === "Meta"
    );
  }
}

export class NormalModeCommandResolver<
  TState extends EditorState = EditorState,
> {
  private countBuffer = "";
  private pendingOperator: "delete" | "yank" | null = null;

  constructor(
    private motions: Map<string, MotionDefinition<TState>>,
    private normalCommands: Map<string, Command<TState>>,
    private undoManager: UndoManager<TState>,
    private setRegister: (text: string) => void,
  ) {}

  public resolve(event: KeyboardEvent): ResolvedCommand<TState> | null {
    if (this.isPureModifier(event.key)) {
      return null;
    }

    if (this.isDigit(event.key)) {
      if (this.shouldTreatZeroAsMotion(event.key)) {
        return this.resolveMotionKey("0");
      }
      this.countBuffer += event.key;
      return null;
    }

    const key = makeKey(event);

    if (key === "d") {
      if (this.pendingOperator === "delete") {
        const count = this.consumeCountOrOne();
        this.pendingOperator = null;
        return { command: this.buildDeleteLinesCommand(count) };
      }
      this.pendingOperator = "delete";
      return null;
    }

    if (key === "y") {
      if (this.pendingOperator === "yank") {
        const count = this.consumeCountOrOne();
        this.pendingOperator = null;
        return { command: this.buildYankLinesCommand(count) };
      }
      this.pendingOperator = "yank";
      return null;
    }

    if (key === "u") {
      const count = this.consumeCountOrOne();
      this.pendingOperator = null;
      return { command: this.buildUndoCommand(count), isUndo: true };
    }

    if (key === "Ctrl+r") {
      const count = this.consumeCountOrOne();
      this.pendingOperator = null;
      return { command: this.buildRedoCommand(count), isRedo: true };
    }

    const motionResult = this.resolveMotionKey(key);
    if (motionResult) return motionResult;

    const command = this.normalCommands.get(key);
    if (command) {
      this.resetPending();
      return { command };
    }

    this.resetPending();
    return null;
  }

  private resolveMotionKey(key: string): ResolvedCommand<TState> | null {
    const motion = this.motions.get(key);
    if (!motion) return null;
    const count = this.consumeCountOrOne();
    const operator = this.pendingOperator;
    this.pendingOperator = null;
    if (operator === "delete") {
      return { command: this.buildDeleteWithMotionCommand(motion, count) };
    }
    if (operator === "yank") {
      return { command: this.buildYankWithMotionCommand(motion, count) };
    }
    return { command: this.buildMotionCommand(motion, count) };
  }

  private buildMotionCommand(
    motion: MotionDefinition<TState>,
    count: number,
  ): Command<TState> {
    const normalizedCount = Math.max(1, count);
    return (state) => {
      motion.move(state, normalizedCount);
    };
  }

  private buildDeleteWithMotionCommand(
    motion: MotionDefinition<TState>,
    count: number,
  ): Command<TState> {
    const normalizedCount = Math.max(1, count);
    return (state) => {
      const range = motion.toRange(state, normalizedCount);
      if (range.type === "line") {
        this.deleteLineRange(state, range.startRow, range.endRow);
      } else {
        this.deleteCharacterRange(
          state,
          range.row,
          range.startCol,
          range.endCol,
        );
      }
    };
  }

  private buildYankWithMotionCommand(
    motion: MotionDefinition<TState>,
    count: number,
  ): Command<TState> {
    const normalizedCount = Math.max(1, count);
    return (state) => {
      const range = motion.toRange(state, normalizedCount);
      if (range.type === "line") {
        this.yankLineRange(state, range.startRow, range.endRow);
      } else {
        this.yankCharacterRange(state, range.row, range.startCol, range.endCol);
      }
    };
  }

  private buildDeleteLinesCommand(count: number): Command<TState> {
    const normalizedCount = Math.max(1, count);
    return (state) => {
      const { row } = state.cursor.getPosition();
      const endRow = clampNumber(
        row + normalizedCount - 1,
        0,
        state.buffer.lineCount() - 1,
      );
      this.deleteLineRange(state, row, endRow);
    };
  }

  private buildYankLinesCommand(count: number): Command<TState> {
    const normalizedCount = Math.max(1, count);
    return (state) => {
      const { row } = state.cursor.getPosition();
      const endRow = clampNumber(
        row + normalizedCount - 1,
        0,
        state.buffer.lineCount() - 1,
      );
      this.yankLineRange(state, row, endRow);
    };
  }

  private buildUndoCommand(count: number): Command<TState> {
    const normalizedCount = Math.max(1, count);
    return (state, event) => {
      event.preventDefault();
      for (let i = 0; i < normalizedCount; i += 1) {
        if (!this.undoManager.undo(state)) break;
      }
      state.mode = "normal";
    };
  }

  private buildRedoCommand(count: number): Command<TState> {
    const normalizedCount = Math.max(1, count);
    return (state, event) => {
      event.preventDefault();
      for (let i = 0; i < normalizedCount; i += 1) {
        if (!this.undoManager.redo(state)) break;
      }
      state.mode = "normal";
    };
  }

  private deleteLineRange(
    state: EditorState,
    startRow: number,
    endRow: number,
  ): void {
    const normalizedStart = Math.max(0, Math.min(startRow, endRow));
    const normalizedEnd = clampNumber(
      Math.max(startRow, endRow),
      normalizedStart,
      state.buffer.lineCount() - 1,
    );
    const lines: string[] = [];
    for (let i = normalizedStart; i <= normalizedEnd; i += 1) {
      lines.push(state.buffer.getLineText(i));
    }
    this.setRegister(`${lines.join("\n")}\n`);
    for (let i = normalizedStart; i <= normalizedEnd; i += 1) {
      state.buffer.removeLine(normalizedStart);
    }
    if (state.buffer.lineCount() === 0) {
      state.buffer.replaceContent("");
    }
    const targetRow = clampNumber(
      normalizedStart,
      0,
      state.buffer.lineCount() - 1,
    );
    const currentCol = state.cursor.getPosition().col;
    const targetCol = Math.min(
      currentCol,
      state.buffer.getLineLength(targetRow),
    );
    state.cursor.setPosition(targetRow, targetCol, state.buffer);
  }

  private yankLineRange(
    state: EditorState,
    startRow: number,
    endRow: number,
  ): void {
    const normalizedStart = Math.max(0, Math.min(startRow, endRow));
    const normalizedEnd = clampNumber(
      Math.max(startRow, endRow),
      normalizedStart,
      state.buffer.lineCount() - 1,
    );
    const lines: string[] = [];
    for (let i = normalizedStart; i <= normalizedEnd; i += 1) {
      lines.push(state.buffer.getLineText(i));
    }
    this.setRegister(`${lines.join("\n")}\n`);
  }

  private deleteCharacterRange(
    state: EditorState,
    row: number,
    startCol: number,
    endCol: number,
  ): void {
    const lineText = state.buffer.getLineText(row);
    const clampedStart = clampNumber(startCol, 0, lineText.length);
    const clampedEnd = clampNumber(endCol, clampedStart, lineText.length);
    if (clampedStart === clampedEnd) return;
    this.setRegister(lineText.slice(clampedStart, clampedEnd));
    const updated =
      lineText.slice(0, clampedStart) + lineText.slice(clampedEnd);
    state.buffer.setLineText(row, updated);
    state.cursor.setPosition(row, clampedStart, state.buffer);
  }

  private yankCharacterRange(
    state: EditorState,
    row: number,
    startCol: number,
    endCol: number,
  ): void {
    const lineText = state.buffer.getLineText(row);
    const clampedStart = clampNumber(startCol, 0, lineText.length);
    const clampedEnd = clampNumber(endCol, clampedStart, lineText.length);
    if (clampedStart === clampedEnd) return;
    this.setRegister(lineText.slice(clampedStart, clampedEnd));
  }

  private shouldTreatZeroAsMotion(key: string): boolean {
    if (key !== "0") return false;
    return this.countBuffer === "";
  }

  private isDigit(key: string | undefined): key is string {
    return !!key && /^[0-9]$/.test(key);
  }

  private consumeCountOrOne(): number {
    const parsed = this.countBuffer === "" ? NaN : Number(this.countBuffer);
    this.countBuffer = "";
    return Number.isNaN(parsed) ? 1 : parsed;
  }

  private isPureModifier(key: string | undefined): boolean {
    return (
      key === "Shift" || key === "Control" || key === "Alt" || key === "Meta"
    );
  }

  private resetPending(): void {
    this.countBuffer = "";
    this.pendingOperator = null;
  }
}

export interface ModeCommandResolver<
  TState extends EditorState<BufferAdapter>,
> {
  resolve(event: KeyboardEvent): ResolvedCommand<TState> | null;
}

export class KeyMapper<TState extends EditorState<BufferAdapter>> {
  constructor(
    private normalResolver: ModeCommandResolver<TState>,
    private visualResolver: ModeCommandResolver<TState>,
    private insertKeymap: Map<string, Command<TState>>,
    private insertTextCommand: Command<TState>,
  ) {}

  public resolve(
    state: TState,
    event: KeyboardEvent,
  ): ResolvedCommand<TState> | null {
    if (state.mode === "normal") {
      return this.normalResolver.resolve(event);
    }

    if (state.mode === "visual-character" || state.mode === "visual-line") {
      return this.visualResolver.resolve(event);
    }

    const key = makeKey(event);
    const command = this.insertKeymap.get(key);
    if (command) return { command };

    if (state.mode === "insert" && event.key.length === 1) {
      return { command: this.insertTextCommand };
    }

    return null;
  }
}

export class UndoManager<TState extends EditorState = EditorState> {
  private undoStack: EditorSnapshot[] = [];
  private redoStack: EditorSnapshot[] = [];
  private pendingSnapshot: EditorSnapshot | null = null;

  public createSnapshot(state: TState): EditorSnapshot {
    return {
      content: state.buffer.extractContent(),
      cursor: state.cursor.getPosition(),
      mode: state.mode,
      selection: state.selection ? { ...state.selection } : null,
    };
  }

  public recordChange(previousSnapshot: EditorSnapshot, state: TState): void {
    const currentContent = state.buffer.extractContent();
    if (previousSnapshot.content !== currentContent) {
      this.undoStack.push(previousSnapshot);
      this.redoStack = [];
    }
  }

  public beginCompound(state: TState): void {
    if (!this.pendingSnapshot) {
      this.pendingSnapshot = this.createSnapshot(state);
    }
  }

  public commitCompoundIfChanged(state: TState): void {
    if (!this.pendingSnapshot) return;
    this.recordChange(this.pendingSnapshot, state);
    this.pendingSnapshot = null;
  }

  public hasPendingCompound(): boolean {
    return this.pendingSnapshot !== null;
  }

  public undo(state: TState): boolean {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return false;
    const currentSnapshot = this.createSnapshot(state);
    this.redoStack.push(currentSnapshot);
    this.applySnapshot(state, snapshot);
    return true;
  }

  public redo(state: TState): boolean {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return false;
    const currentSnapshot = this.createSnapshot(state);
    this.undoStack.push(currentSnapshot);
    this.applySnapshot(state, snapshot);
    return true;
  }

  private applySnapshot(state: TState, snapshot: EditorSnapshot): void {
    state.buffer.replaceContent(snapshot.content);
    state.mode = snapshot.mode;
    state.selection = snapshot.selection ? { ...snapshot.selection } : null;
    state.cursor.setFromSnapshot(snapshot.cursor, state.buffer);
  }
}

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

export const createInsertKeymap = <
  TState extends EditorState = EditorState,
>(): Map<string, Command<TState>> => {
  const keymap = new Map<string, Command<TState>>();

  keymap.set("Escape", (state, event) => {
    event.preventDefault();
    state.cursor.clampToBuffer(state.buffer);
    state.selection = null;
    state.mode = "normal";
  });

  keymap.set("Backspace", (state, event) => {
    event.preventDefault();
    const { row, col } = state.cursor.getPosition();
    const lineText = state.buffer.getLineText(row);
    if (col > 0) {
      const updated = lineText.slice(0, col - 1) + lineText.slice(col);
      state.buffer.setLineText(row, updated);
      state.cursor.setPosition(row, col - 1, state.buffer);
    } else if (col === 0 && row > 0) {
      const prevLineText = state.buffer.getLineText(row - 1);
      const mergedText = prevLineText + lineText;
      state.buffer.setLineText(row - 1, mergedText);
      state.buffer.removeLine(row);
      state.cursor.setPosition(row - 1, prevLineText.length, state.buffer);
    }
  });

  keymap.set("Delete", (state) => {
    const { row, col } = state.cursor.getPosition();
    const text = state.buffer.getLineText(row);
    const updated = text.slice(0, col) + text.slice(col + 1);
    state.buffer.setLineText(row, updated);
  });

  keymap.set("Enter", (state) => {
    const { row, col } = state.cursor.getPosition();
    const text = state.buffer.getLineText(row);
    const before = text.slice(0, col);
    const after = text.slice(col);
    state.buffer.setLineText(row, before);
    state.buffer.insertLineAfter(row, after);
    state.cursor.setPosition(row + 1, 0, state.buffer);
  });

  keymap.set("Tab", (state, event) => {
    event.preventDefault();
    const { row, col } = state.cursor.getPosition();
    const text = state.buffer.getLineText(row);
    const updated = text.slice(0, col) + "    " + text.slice(col);
    state.buffer.setLineText(row, updated);
    state.cursor.setPosition(row, col + 4, state.buffer);
  });

  return keymap;
};

export const insertTextCommand: Command = (state, event) => {
  const { row, col } = state.cursor.getPosition();
  const text = state.buffer.getLineText(row);
  const updated = text.slice(0, col) + event.key + text.slice(col);
  state.buffer.setLineText(row, updated);
  state.cursor.setPosition(row, col + 1, state.buffer);
};

export const initializeEditorDom = (
  container: HTMLDivElement,
  initialContent = "",
): EditorDom => {
  const document = container.ownerDocument;
  const root = container.appendChild(document.createElement("div"));
  root.style.position = "relative";

  const buffer = new EditorBuffer(document, root, initialContent);

  const selectionOverlay = root.appendChild(document.createElement("div"));
  selectionOverlay.style.position = "absolute";
  selectionOverlay.style.top = "0";
  selectionOverlay.style.left = "0";
  selectionOverlay.style.right = "0";
  selectionOverlay.style.bottom = "0";
  selectionOverlay.style.pointerEvents = "none";
  selectionOverlay.style.zIndex = "0";

  const cursorSpan = root.appendChild(document.createElement("span"));
  cursorSpan.style.position = "absolute";
  cursorSpan.style.width = "1ch";
  cursorSpan.style.height = "1em";
  cursorSpan.style.zIndex = "2";

  return { root, buffer, selectionOverlay, cursorSpan };
};

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

export class ViModeController {
  private document: Document;
  private textareaDiv: HTMLDivElement;
  private selectionOverlay: HTMLDivElement;
  private cursorSpan: HTMLSpanElement;
  private register = "";
  private state: EditorState<EditorBuffer>;
  private keyMapper: KeyMapper<EditorState<EditorBuffer>>;
  private executor: CommandExecutor<EditorState<EditorBuffer>>;
  private undoManager: UndoManager<EditorState<EditorBuffer>>;
  private undoCommand: Command<EditorState<EditorBuffer>> | null;
  private redoCommand: Command<EditorState<EditorBuffer>> | null;

  constructor(options: {
    dom: EditorDom;
    initialMode?: Mode;
    initialCursorRow?: number;
    initialCursorCol?: number;
    keyMapper?: KeyMapper<EditorState<EditorBuffer>>;
    undoManager?: UndoManager<EditorState<EditorBuffer>>;
    extendNormalCommands?: (
      commands: Map<string, Command<EditorState<EditorBuffer>>>,
    ) => void;
  }) {
    const {
      dom,
      initialMode = "normal",
      initialCursorRow = 0,
      initialCursorCol = 0,
      keyMapper,
      undoManager,
    } = options;

    this.document = dom.root.ownerDocument;
    this.textareaDiv = dom.root;
    this.selectionOverlay = dom.selectionOverlay;
    this.cursorSpan = dom.cursorSpan;

    const cursor = new CursorState(initialCursorRow, initialCursorCol);
    cursor.clampToBuffer(dom.buffer);

    this.state = {
      mode: initialMode,
      cursor,
      buffer: dom.buffer,
      selection: null,
    };

    this.undoManager =
      undoManager ?? new UndoManager<EditorState<EditorBuffer>>();
    if (keyMapper) {
      this.undoCommand = null;
      this.redoCommand = null;
      this.keyMapper = keyMapper;
    } else {
      const defaults = createDefaultKeyMapper<EditorState<EditorBuffer>>(
        this.undoManager,
        (text) => this.setRegister(text),
        () => this.copySelectionToRegister(),
        () => this.getSelectionRange(),
        (range) => this.deleteSelectionInBuffer(range),
        (before) => this.pasteFromRegister(before),
        {
          extendNormalCommands: options.extendNormalCommands,
        },
      );
      this.keyMapper = defaults.keyMapper;
      this.undoCommand = defaults.undoCommand;
      this.redoCommand = defaults.redoCommand;
    }
    this.executor = new CommandExecutor<EditorState<EditorBuffer>>(
      this.state,
      this.undoManager,
    );

    this.updateSelectionOverlay();
    this.updateCursorSpan();
  }

  public getMode(): Mode {
    return this.state.mode;
  }

  public getCursorPosition(): CursorPosition {
    return this.state.cursor.getPosition();
  }

  public getSelection(): {
    type: "character" | "line";
    anchor: CursorPosition;
    head: CursorPosition;
  } | null {
    if (!this.state.selection) return null;
    return {
      type: this.state.selection.type,
      anchor: { ...this.state.selection.anchor },
      head: this.state.cursor.getPosition(),
    };
  }

  public extractContent(): string {
    return this.state.buffer.extractContent();
  }

  private setRegister(text: string): void {
    this.register = text;
  }

  /** test-only helper */
  public __getSelectionSegmentsForTest(): SelectionSegment[] {
    return this.calculateSelectionSegments();
  }

  public processKeyboardEvent(event: KeyboardEvent) {
    const resolved = this.keyMapper.resolve(this.state, event);
    const command = resolved?.command;
    if (command) {
      const wasInsertMode = this.state.mode === "insert";

      if (this.shouldStartInsertSession(event)) {
        this.undoManager.beginCompound(this.state);
      }

      const isUndo =
        resolved?.isUndo ??
        (this.undoCommand !== null && command === this.undoCommand);
      const isRedo =
        resolved?.isRedo ??
        (this.redoCommand !== null && command === this.redoCommand);
      const recordUndo =
        !isUndo && !isRedo && !this.undoManager.hasPendingCompound();

      this.executor.run(command, event, { recordUndo });

      if (wasInsertMode && this.state.mode === "normal") {
        this.undoManager.commitCompoundIfChanged(this.state);
      }
    }
    this.state.cursor.clampToBuffer(this.state.buffer);
    this.updateSelectionOverlay();
    this.updateCursorSpan();
  }

  private shouldStartInsertSession(event: KeyboardEvent): boolean {
    if (this.state.mode !== "normal") return false;
    return ["i", "a", "A", "o", "O"].includes(event.key);
  }

  private isVisualMode(): boolean {
    return (
      this.state.mode === "visual-character" ||
      this.state.mode === "visual-line"
    );
  }

  private updateSelectionOverlay(): void {
    this.selectionOverlay.replaceChildren();
    if (!this.isVisualMode() || !this.state.selection) return;
    const segments = this.calculateSelectionSegments();
    for (const segment of segments) {
      const block = this.document.createElement("div");
      block.style.position = "absolute";
      block.style.top = `${segment.row}em`;
      block.style.left = `${segment.startCol}ch`;
      block.style.width = `${Math.max(1, segment.endCol - segment.startCol)}ch`;
      block.style.height = "1em";
      block.style.backgroundColor = "rgba(0, 0, 255, 0.2)";
      block.style.pointerEvents = "none";
      this.selectionOverlay.appendChild(block);
    }
  }

  private calculateSelectionSegments(): SelectionSegment[] {
    const selection = this.state.selection;
    if (!selection) return [];
    const anchor = selection.anchor;
    const head = this.state.cursor.getPosition();
    if (selection.type === "line") {
      const startRow = Math.min(anchor.row, head.row);
      const endRow = Math.max(anchor.row, head.row);
      const segments: SelectionSegment[] = [];
      for (let row = startRow; row <= endRow; row += 1) {
        segments.push({
          row,
          startCol: 0,
          endCol: this.safeLineLength(row),
        });
      }
      return segments;
    }

    if (anchor.row === head.row) {
      const startCol = Math.min(anchor.col, head.col);
      const endCol = Math.max(anchor.col, head.col) + 1;
      return [
        {
          row: anchor.row,
          startCol,
          endCol,
        },
      ];
    }

    const anchorIsTop = anchor.row < head.row;
    const top = anchorIsTop ? anchor : head;
    const bottom = anchorIsTop ? head : anchor;
    const segments: SelectionSegment[] = [];
    segments.push({
      row: top.row,
      startCol: top.col,
      endCol: Math.max(top.col + 1, this.safeLineLength(top.row)),
    });
    for (let row = top.row + 1; row < bottom.row; row += 1) {
      segments.push({
        row,
        startCol: 0,
        endCol: this.safeLineLength(row),
      });
    }
    segments.push({
      row: bottom.row,
      startCol: 0,
      endCol: bottom.col + 1,
    });

    return segments.map((segment) => ({
      ...segment,
      endCol: Math.max(segment.startCol + 1, segment.endCol),
    }));
  }

  private safeLineLength(row: number): number {
    const len = this.state.buffer.getLineLength(row);
    const hasTrailingNewline = row < this.state.buffer.lineCount() - 1;
    return Math.max(1, len + (hasTrailingNewline ? 1 : 0));
  }

  private getSelectionRange(): NormalizedSelectionRange | null {
    if (!this.state.selection) return null;
    const anchor = this.state.selection.anchor;
    const head = this.state.cursor.getPosition();
    if (this.state.selection.type === "line") {
      return {
        type: "line",
        startRow: Math.min(anchor.row, head.row),
        endRow: Math.max(anchor.row, head.row),
      };
    }

    const anchorIsTop =
      anchor.row < head.row ||
      (anchor.row === head.row && anchor.col <= head.col);
    const start = anchorIsTop ? anchor : head;
    const end = anchorIsTop ? head : anchor;
    return {
      type: "character",
      startRow: start.row,
      startCol: start.col,
      endRow: end.row,
      endCol: end.col + 1,
    };
  }

  private copySelectionToRegister(): void {
    const range = this.getSelectionRange();
    if (!range) return;
    if (range.type === "line") {
      const lines: string[] = [];
      for (let row = range.startRow; row <= range.endRow; row += 1) {
        lines.push(this.state.buffer.getLineText(row));
      }
      this.register = `${lines.join("\n")}\n`;
      return;
    }

    const parts: string[] = [];
    if (range.startRow === range.endRow) {
      const line = this.state.buffer.getLineText(range.startRow);
      const endCol = Math.min(line.length, range.endCol);
      this.register = line.slice(range.startCol, endCol);
      return;
    }

    const startLine = this.state.buffer.getLineText(range.startRow);
    parts.push(startLine.slice(range.startCol));
    for (let row = range.startRow + 1; row < range.endRow; row += 1) {
      parts.push(this.state.buffer.getLineText(row));
    }
    const endLine = this.state.buffer.getLineText(range.endRow);
    parts.push(endLine.slice(0, Math.min(endLine.length, range.endCol)));
    this.register = parts.join("\n");
  }

  private deleteSelectionInBuffer(range: NormalizedSelectionRange): void {
    if (range.type === "line") {
      const start = Math.max(0, range.startRow);
      const end = clampNumber(
        range.endRow,
        start,
        this.state.buffer.lineCount() - 1,
      );
      for (let i = start; i <= end; i += 1) {
        this.state.buffer.removeLine(start);
      }
      if (this.state.buffer.lineCount() === 0) {
        this.state.buffer.replaceContent("");
      }
      this.state.cursor.setPosition(
        Math.min(start, this.state.buffer.lineCount() - 1),
        0,
        this.state.buffer,
      );
      return;
    }

    if (range.startRow === range.endRow) {
      const line = this.state.buffer.getLineText(range.startRow);
      const newText =
        line.slice(0, range.startCol) +
        line.slice(Math.min(line.length, range.endCol));
      this.state.buffer.setLineText(range.startRow, newText);
      this.state.cursor.setPosition(
        range.startRow,
        range.startCol,
        this.state.buffer,
      );
      return;
    }

    const startLine = this.state.buffer.getLineText(range.startRow);
    const endLine = this.state.buffer.getLineText(range.endRow);
    const tail = endLine.slice(Math.min(endLine.length, range.endCol));
    this.state.buffer.setLineText(
      range.startRow,
      startLine.slice(0, range.startCol) + tail,
    );

    for (let row = range.startRow + 1; row <= range.endRow; row += 1) {
      this.state.buffer.removeLine(range.startRow + 1);
    }

    this.state.cursor.setPosition(
      range.startRow,
      range.startCol,
      this.state.buffer,
    );
  }

  private pasteFromRegister(before: boolean): void {
    if (this.register === "") return;
    const { row, col } = this.state.cursor.getPosition();
    const text = this.register;
    const isLineWise = text.endsWith("\n");

    if (isLineWise) {
      const lines = text.slice(0, -1).split("\n");
      const insertRow = before ? row : row + 1;
      const lineCount = this.state.buffer.lineCount();
      if (insertRow >= lineCount) {
        let current = lineCount - 1;
        for (const line of lines) {
          this.state.buffer.insertLineAfter(current, line);
          current += 1;
        }
        this.state.cursor.setPosition(current, 0, this.state.buffer);
      } else {
        for (let i = 0; i < lines.length; i += 1) {
          this.state.buffer.insertLineBefore(insertRow + i, lines[i]);
        }
        this.state.cursor.setPosition(
          insertRow + lines.length - 1,
          0,
          this.state.buffer,
        );
      }
      return;
    }

    const insertPos = before ? col : col + 1;
    this.insertTextAtPosition(row, insertPos, text);
  }

  private insertTextAtPosition(row: number, col: number, text: string): void {
    const lines = text.split("\n");
    const original = this.state.buffer.getLineText(row);
    const clampedCol = clampNumber(col, 0, original.length);
    if (lines.length === 1) {
      const newLine =
        original.slice(0, clampedCol) + text + original.slice(clampedCol);
      this.state.buffer.setLineText(row, newLine);
      this.state.cursor.setPosition(
        row,
        Math.max(0, clampedCol + text.length - 1),
        this.state.buffer,
      );
      return;
    }

    const firstLine = original.slice(0, clampedCol) + lines[0];
    const lastLine = lines[lines.length - 1] + original.slice(clampedCol);
    this.state.buffer.setLineText(row, firstLine);
    for (let i = 1; i < lines.length - 1; i += 1) {
      this.state.buffer.insertLineAfter(row + i - 1, lines[i]);
    }
    this.state.buffer.insertLineAfter(row + lines.length - 2, lastLine);
    this.state.cursor.setPosition(
      row + lines.length - 1,
      Math.max(0, lines[lines.length - 1].length - 1),
      this.state.buffer,
    );
  }

  private updateCursorSpan() {
    const { row, col } = this.state.cursor.getPosition();
    const lineDiv = this.state.buffer.getLineDiv(row);
    this.cursorSpan.style.top = `${lineDiv.offsetTop}px`;
    this.cursorSpan.style.left = `${col}ch`;
    if (this.state.mode === "normal") {
      this.cursorSpan.style.backgroundColor = "blue";
      this.cursorSpan.style.color = "white";
      this.cursorSpan.style.border = "none";
      this.cursorSpan.textContent = lineDiv.textContent?.charAt(col) || " ";
    } else if (this.isVisualMode()) {
      this.cursorSpan.style.backgroundColor = "rgba(0, 0, 255, 0.4)";
      this.cursorSpan.style.color = "white";
      this.cursorSpan.style.border = "none";
      this.cursorSpan.textContent = lineDiv.textContent?.charAt(col) || " ";
    } else {
      this.cursorSpan.style.backgroundColor = "transparent";
      this.cursorSpan.style.color = "black";
      this.cursorSpan.style.borderLeft = "1px solid black";
      this.cursorSpan.textContent = "";
    }
  }
}

export const createFullEditor = (
  container: HTMLDivElement,
  options?: {
    initialContent?: string;
    initialMode?: Mode;
    initialCursorRow?: number;
    initialCursorCol?: number;
    keyMapper?: KeyMapper<EditorState>;
    undoManager?: UndoManager;
  },
): { controller: ViModeController; dom: EditorDom } => {
  const dom = initializeEditorDom(container, options?.initialContent ?? "");
  const controller = new ViModeController({
    dom,
    initialMode: options?.initialMode,
    initialCursorRow: options?.initialCursorRow,
    initialCursorCol: options?.initialCursorCol,
    keyMapper: options?.keyMapper,
    undoManager: options?.undoManager,
  });
  return { controller, dom };
};
