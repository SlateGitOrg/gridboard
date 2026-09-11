import type { Sample } from './protocol.ts';

/**
 * Backpressure-aware buffer.
 *
 * THE DIFFERENTIATOR LIVES HERE.
 *
 * A naive fan-out queues every sample for a slow consumer. Occupancy grows
 * without bound, the consumer drifts further behind real time with every tick,
 * and the operator sees a smooth, plausible, increasingly historical picture
 * with nothing to indicate it. The console is lying and cannot know it.
 *
 * This buffer is bounded. When it is full it DECIMATES THE INTERIOR: it keeps
 * the oldest sample (the consumer's continuity anchor) and the newest sample
 * (the only one with operational value), and throws away every other sample in
 * between. Occupancy roughly halves, so the consumer catches up to the live
 * edge instead of falling further behind, and it loses resolution rather than
 * currency.
 *
 * The property the test suite pins down is the one that matters at 3am:
 * `newest()` is ALWAYS the most recently pushed sample, under any load.
 */
export class BackpressureBuffer {
  private items: Sample[] = [];
  private droppedCount = 0;
  private decimations = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    if (capacity < 2) {
      // With capacity 1 there is no interior to decimate, so the structure
      // could not honour both invariants at once. Fail loudly at construction.
      throw new Error('capacity must be >= 2 to preserve oldest and newest');
    }
  }

  push(sample: Sample): void {
    this.items.push(sample);
    if (this.items.length > this.capacity) this.decimate();
  }

  /**
   * Drop every second sample strictly between the first and the last.
   * Neither endpoint is ever a candidate for removal.
   */
  private decimate(): void {
    const kept: Sample[] = [];
    const last = this.items.length - 1;
    for (let i = 0; i < this.items.length; i++) {
      const isEndpoint = i === 0 || i === last;
      // keep endpoints, and keep even-indexed interior samples
      if (isEndpoint || i % 2 === 0) kept.push(this.items[i]!);
      else this.droppedCount++;
    }
    this.items = kept;
    this.decimations++;

    // Pathological case: a capacity so small that one decimation pass is not
    // enough. Drop from the middle outward, never the endpoints.
    while (this.items.length > this.capacity) {
      const mid = Math.floor(this.items.length / 2);
      this.items.splice(mid, 1);
      this.droppedCount++;
    }
  }

  /** The live edge. Never null once anything has been pushed. */
  newest(): Sample | null {
    return this.items.length ? this.items[this.items.length - 1]! : null;
  }

  oldest(): Sample | null {
    return this.items.length ? this.items[0]! : null;
  }

  /** Consumer drains up to `n` samples, oldest first. */
  drain(n: number): Sample[] {
    return this.items.splice(0, n);
  }

  get length(): number {
    return this.items.length;
  }
  get dropped(): number {
    return this.droppedCount;
  }
  get decimationPasses(): number {
    return this.decimations;
  }

  snapshot(): readonly Sample[] {
    return [...this.items];
  }
}
