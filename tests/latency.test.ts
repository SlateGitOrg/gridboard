import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BackpressureBuffer } from '../src/backpressure.ts';
import { simulate, isSagging, feederId, type InjectedFault } from '../src/sim.ts';
import { measureDetection, NaiveQueue } from '../src/measure.ts';

const FAULTS: InjectedFault[] = [
  { feederId: feederId(3), kind: 'VOLTAGE_SAG', startTick: 200, durationTicks: 40 },
  { feederId: feederId(7), kind: 'VOLTAGE_SAG', startTick: 600, durationTicks: 40 },
  { feederId: feederId(1), kind: 'VOLTAGE_SAG', startTick: 1100, durationTicks: 40 },
  { feederId: feederId(5), kind: 'VOLTAGE_SAG', startTick: 1600, durationTicks: 40 },
];

const CFG = { feeders: 10, ticks: 2000, tickMs: 100, faults: FAULTS, seed: 42 };
/** Consumer drains 1 sample for every 10 produced: a 10x overload. */
const OVERLOAD = 10;

describe('fault-to-detection latency under 10x overload', () => {
  test('bounded buffer detects every injected fault', () => {
    const r = measureDetection(
      simulate(CFG), FAULTS, CFG.tickMs, OVERLOAD,
      () => new BackpressureBuffer(64), isSagging,
    );
    assert.equal(
      r.detected, FAULTS.length,
      'a fault that is never detected is the failure this project exists to prevent',
    );
  });

  test('p95 latency stays inside the operational budget', () => {
    // The budget is derived from the domain, not invented: an operator must
    // see the fault WHILE IT IS STILL HAPPENING, or the alert is archaeology.
    // Fault duration is 40 ticks x 100ms = 4000ms.
    const budgetMs = FAULTS[0]!.durationTicks * CFG.tickMs;
    const r = measureDetection(
      simulate(CFG), FAULTS, CFG.tickMs, OVERLOAD,
      () => new BackpressureBuffer(64), isSagging,
    );
    assert.ok(
      r.p95Ms < budgetMs,
      `p95 detection latency was ${r.p95Ms}ms, budget is ${budgetMs}ms ` +
        `(the fault window) - detecting it later means reporting history`,
    );
  });

  test('THE COMPARISON: an unbounded queue drifts far behind on the same stream', () => {
    const bounded = measureDetection(
      simulate(CFG), FAULTS, CFG.tickMs, OVERLOAD,
      () => new BackpressureBuffer(64), isSagging,
    );
    const naive = measureDetection(
      simulate(CFG), FAULTS, CFG.tickMs, OVERLOAD,
      () => new NaiveQueue(), isSagging,
    );

    // Measured outcome: the unbounded queue does not merely lag, it never
    // reaches the faulty samples inside the run - while continuing to render
    // plausible, minutes-old readings with nothing to indicate drift.
    assert.ok(
      naive.p95Ms > bounded.p95Ms,
      `expected the unbounded queue to lag; bounded=${bounded.p95Ms}ms ` +
        `naive=${naive.p95Ms}ms`,
    );
    assert.ok(
      naive.detected < bounded.detected,
      `bounded detected ${bounded.detected}, unbounded ${naive.detected}`,
    );
    assert.ok(
      naive.maxOccupancy > 1000,
      `expected unbounded growth, peak occupancy was ${naive.maxOccupancy}`,
    );
  });

  test('the live edge is never lost, even while the consumer is behind', () => {
    const r = measureDetection(
      simulate(CFG), FAULTS, CFG.tickMs, OVERLOAD,
      () => new BackpressureBuffer(64), isSagging,
    );
    assert.equal(r.liveEdgeViolations, 0, 'newest sample was dropped');
  });
});
