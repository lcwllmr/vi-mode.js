import type { EditorSnapshot, EditorState } from "./types";

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
