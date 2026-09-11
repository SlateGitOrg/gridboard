import type { Sample } from './protocol.ts';
import type { InjectedFault } from './sim.ts';

/**
 * The measurement harness. Both buffer strategies are driven through exactly
 * the same consumer so the comparison is like for like.
 */

export interface Buffer {
  push(s: Sample): void;
  drain(n: number): Sample[];
  newest(): Sample | null;
  readonly length: number;
}

/** The thing most projects ship without realising: an unbounded queue. */
export class NaiveQueue implements Buffer {
  private items: Sample[] = [];
  push(s: Sample): void {
    this.items.push(s);
  }
  drain(n: number): Sample[] {
    return this.items.splice(0, n);
  }
  newest(): Sample | null {
    return this.items.length ? this.items[this.items.length - 1]! : null;
  }
  get length(): number {
    return this.items.length;
  }
}

export interface DetectionResult {
  readonly detected: number;
  readonly latenciesMs: readonly number[];
  readonly p95Ms: number;
  readonly medianMs: number;
  readonly liveEdgeViolations: number;
  readonly maxOccupancy: number;
}

function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return Number.POSITIVE_INFINITY;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

/**
 * Drives `samples` into a buffer while a consumer drains 1 per `overload`
 * pushes, and records how long after each fault's true onset the consumer
 * first observes it.
 */
export function measureDetection(
  samples: Iterable<Sample>,
  faults: readonly InjectedFault[],
  tickMs: number,
  overload: number,
  makeBuffer: () => Buffer,
  isFaulty: (voltage: number) => boolean,
): DetectionResult {
  const buf = makeBuffer();
  const firstSeen = new Map<string, number>();
  const baseTs = 1_700_000_000_000;
  let pushes = 0;
  let liveEdgeViolations = 0;
  let maxOccupancy = 0;

  for (const s of samples) {
    buf.push(s);
    pushes++;
    if (buf.newest()?.seq !== s.seq) liveEdgeViolations++;
    if (buf.length > maxOccupancy) maxOccupancy = buf.length;

    if (pushes % overload === 0) {
      for (const got of buf.drain(1)) {
        if (!isFaulty(got.voltage)) continue;
        if (firstSeen.has(got.feederId)) continue;
        // Simulated "now" is the timestamp of the live edge, not of the sample
        // being read. That difference IS the consumer's lag, and it is exactly
        // what an unbounded queue hides from you.
        const nowTs = buf.newest()?.ts ?? got.ts;
        firstSeen.set(got.feederId, nowTs);
      }
    }
  }

  const latencies: number[] = [];
  for (const f of faults) {
    const seenTs = firstSeen.get(f.feederId);
    if (seenTs === undefined) continue;
    const trueOnsetTs = baseTs + f.startTick * tickMs;
    latencies.push(Math.max(0, seenTs - trueOnsetTs));
  }
  const sorted = [...latencies].sort((a, b) => a - b);

  return {
    detected: latencies.length,
    latenciesMs: latencies,
    p95Ms: percentile(sorted, 95),
    medianMs: percentile(sorted, 50),
    liveEdgeViolations,
    maxOccupancy,
  };
}
