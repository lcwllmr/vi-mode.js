import type {
  Command,
  EditorState,
  MotionDefinition,
  ResolvedCommand,
} from "./types";
import type { UndoManager } from "./undo-manager";
import { clampNumber, makeKey } from "./utils";

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

export interface ModeCommandResolver<TState extends EditorState> {
  resolve(event: KeyboardEvent): ResolvedCommand<TState> | null;
}
