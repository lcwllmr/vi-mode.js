import type { Command, EditorState, ResolvedCommand } from "./types";
import type { ModeCommandResolver } from "./command-resolvers";
import { makeKey } from "./utils";

export class KeyMapper<TState extends EditorState> {
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
