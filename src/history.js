// Undo/redo over serialised kit states.

export class History {
  constructor(limit = 100) {
    this.limit = limit;
    this.states = [];
    this.i = -1;
  }

  /** Record a new state; identical consecutive states are ignored. */
  push(state) {
    if (this.states[this.i] === state) return;
    this.states = this.states.slice(0, this.i + 1);
    this.states.push(state);
    if (this.states.length > this.limit) this.states.shift();
    this.i = this.states.length - 1;
  }

  undo() {
    if (this.i <= 0) return null;
    this.i -= 1;
    return this.states[this.i];
  }

  redo() {
    if (this.i >= this.states.length - 1) return null;
    this.i += 1;
    return this.states[this.i];
  }

  get canUndo() { return this.i > 0; }
  get canRedo() { return this.i < this.states.length - 1; }
}
