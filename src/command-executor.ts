import type { Command, EditorState } from "./types";
import type { UndoManager } from "./undo-manager";

export class CommandExecutor<TState extends EditorState = EditorState> {
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
