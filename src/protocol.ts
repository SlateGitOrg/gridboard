/**
 * Wire protocol for the grid telemetry stream.
 *
 * The two invariants this module exists to make representable:
 *   1. every sample carries a monotonic per-feeder sequence number, so a
 *      consumer can tell "I was skipped" from "nothing happened";
 *   2. a value can never be handed to the UI without its age, so a panel
 *      cannot paint a stale reading as though it were live.
 */

export interface Sample {
  readonly feederId: string;
  /** Monotonic per feeder. Gaps are legal (we downsample) and detectable. */
  readonly seq: number;
  /** Milliseconds since epoch, assigned at the sensor. */
  readonly ts: number;
  readonly voltage: number;
}

export type PanelState = 'LIVE' | 'STALE';

/**
 * A value that has been made safe to display. There is deliberately no way to
 * construct one of these without an age: `renderSample` is the only producer,
 * and it always computes the age from a supplied clock.
 */
export interface Rendered {
  readonly feederId: string;
  readonly seq: number;
  readonly value: number;
  readonly ageMs: number;
  readonly state: PanelState;
}

export const DEFAULT_STALE_AFTER_MS = 2_000;

/**
 * The single entry point from transport into presentation.
 *
 * A generic dashboard passes `sample.voltage` straight to a chart component and
 * has no representation of "this number is nine seconds old". Routing every
 * value through here means staleness is a rendered state rather than an absent
 * one, and the test suite can assert that property globally.
 */
export function renderSample(
  sample: Sample,
  nowMs: number,
  staleAfterMs: number = DEFAULT_STALE_AFTER_MS,
): Rendered {
  const ageMs = Math.max(0, nowMs - sample.ts);
  return {
    feederId: sample.feederId,
    seq: sample.seq,
    value: sample.voltage,
    ageMs,
    state: ageMs > staleAfterMs ? 'STALE' : 'LIVE',
  };
}

/** Detects whether the consumer was skipped, and by how much. */
export function gapSince(lastSeenSeq: number | null, sample: Sample): number {
  if (lastSeenSeq === null) return 0;
  return Math.max(0, sample.seq - lastSeenSeq - 1);
}
