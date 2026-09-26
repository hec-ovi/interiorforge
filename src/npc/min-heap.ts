/** Binary min-heap of integer keys by priority. */
export class MinHeap {
  private readonly keys: number[] = [];
  private readonly priorities: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, priority: number): void {
    let i = this.keys.length;
    this.keys.push(key);
    this.priorities.push(priority);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (this.priorities[up]! <= priority) break;
      this.keys[i] = this.keys[up]!;
      this.priorities[i] = this.priorities[up]!;
      i = up;
    }
    this.keys[i] = key;
    this.priorities[i] = priority;
  }

  /** Callers check `size` first. */
  pop(): number {
    const top = this.keys[0]!;
    const key = this.keys.pop()!, priority = this.priorities.pop()!;
    const n = this.keys.length;
    if (n === 0) return top;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1, right = left + 1;
      let child = left;
      if (left >= n) break;
      if (right < n && this.priorities[right]! < this.priorities[left]!) child = right;
      if (this.priorities[child]! >= priority) break;
      this.keys[i] = this.keys[child]!;
      this.priorities[i] = this.priorities[child]!;
      i = child;
    }
    this.keys[i] = key;
    this.priorities[i] = priority;
    return top;
  }
}
