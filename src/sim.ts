import type { Sample } from './protocol.ts';

/**
 * Synthetic feeder generator with fault injection.
 *
 * Built first, on purpose. Every latency claim this repository makes is scored
 * against faults whose start timestamp and feeder are known here, so
 * "we detect faults in 1.2s" is a measurement rather than an impression.
 */

export type FaultKind = 'VOLTAGE_SAG' | 'FLATLINE' | 'CLOCK_SKEW';

export interface InjectedFault {
  readonly feederId: string;
  readonly kind: FaultKind;
  /** Ground truth: the tick at which the fault becomes physically true. */
  readonly startTick: number;
  readonly durationTicks: number;
}

export interface SimConfig {
  readonly feeders: number;
  readonly ticks: number;
  /** Milliseconds of simulated time per tick (10 Hz => 100). */
  readonly tickMs: number;
  readonly faults: readonly InjectedFault[];
  readonly seed?: number;
}

/** Deterministic PRNG - a seeded simulation is a reproducible bug report. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOMINAL_V = 230;

export function feederId(i: number): string {
  return `F${String(i).padStart(4, '0')}`;
}

/**
 * Yields samples in tick order, interleaved across feeders, exactly as a real
 * ingest would deliver them.
 */
export function* simulate(cfg: SimConfig): Generator<Sample> {
  const rnd = mulberry32(cfg.seed ?? 1);
  const seqs = new Map<string, number>();
  const baseTs = 1_700_000_000_000;

  for (let tick = 0; tick < cfg.ticks; tick++) {
    for (let f = 0; f < cfg.feeders; f++) {
      const id = feederId(f);
      const seq = (seqs.get(id) ?? -1) + 1;
      seqs.set(id, seq);

      let voltage = NOMINAL_V + (rnd() - 0.5) * 2;
      let ts = baseTs + tick * cfg.tickMs;

      for (const fault of cfg.faults) {
        if (fault.feederId !== id) continue;
        const active =
          tick >= fault.startTick && tick < fault.startTick + fault.durationTicks;
        if (!active) continue;
        if (fault.kind === 'VOLTAGE_SAG') voltage = NOMINAL_V * 0.82;
        if (fault.kind === 'FLATLINE') voltage = NOMINAL_V;
        if (fault.kind === 'CLOCK_SKEW') ts -= 5_000;
      }

      yield { feederId: id, seq, ts, voltage };
    }
  }
}

/** A sag is detectable by threshold; this is the detector under measurement. */
export function isSagging(voltage: number): boolean {
  return voltage < NOMINAL_V * 0.9;
}
