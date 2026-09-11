/**
 * The 60-second artefact.
 *
 * Runs the identical fault stream through a bounded, backpressure-aware buffer
 * and through the unbounded queue most dashboards ship with, and prints the
 * difference. Run: `npm run demo`
 */
import { BackpressureBuffer } from './backpressure.ts';
import { measureDetection, NaiveQueue } from './measure.ts';
import { simulate, isSagging, feederId, type InjectedFault } from './sim.ts';
import { renderSample } from './protocol.ts';

const FAULTS: InjectedFault[] = [
  { feederId: feederId(3), kind: 'VOLTAGE_SAG', startTick: 200, durationTicks: 40 },
  { feederId: feederId(7), kind: 'VOLTAGE_SAG', startTick: 600, durationTicks: 40 },
  { feederId: feederId(1), kind: 'VOLTAGE_SAG', startTick: 1100, durationTicks: 40 },
  { feederId: feederId(5), kind: 'VOLTAGE_SAG', startTick: 1600, durationTicks: 40 },
];
const CFG = { feeders: 10, ticks: 2000, tickMs: 100, faults: FAULTS, seed: 42 };
const OVERLOAD = 10;

const bounded = measureDetection(
  simulate(CFG), FAULTS, CFG.tickMs, OVERLOAD,
  () => new BackpressureBuffer(64), isSagging,
);
const naive = measureDetection(
  simulate(CFG), FAULTS, CFG.tickMs, OVERLOAD,
  () => new NaiveQueue(), isSagging,
);

const budget = FAULTS[0]!.durationTicks * CFG.tickMs;

console.log('\n  GRIDBOARD - fault-to-detection under 10x consumer overload');
console.log('  ' + '-'.repeat(62));
console.log(`  ${CFG.feeders} feeders, ${CFG.ticks} ticks @ ${CFG.tickMs}ms, ` +
            `${FAULTS.length} injected faults with known onset`);
console.log(`  Operator budget: ${budget}ms (detect while the fault is live)\n`);

const row = (label: string, r: typeof bounded) =>
  `  ${label.padEnd(26)} ${String(r.detected + '/' + FAULTS.length).padEnd(9)}` +
  `${(r.medianMs + 'ms').padEnd(11)}${(r.p95Ms + 'ms').padEnd(11)}` +
  `${String(r.maxOccupancy).padEnd(11)}${r.p95Ms < budget ? 'PASS' : 'MISSED'}`;

console.log('  strategy                   detected  median     p95        peak queue  verdict');
console.log('  ' + '-'.repeat(78));
console.log(row('backpressure (bounded)', bounded));
console.log(row('unbounded queue', naive));

console.log(`\n  The unbounded queue never reached the faults at all: ` +
            `${naive.detected}/${FAULTS.length} detected,`);
console.log(`  ${naive.maxOccupancy.toLocaleString()} samples backed up by the end of ` +
            `the run. It was still`);
console.log('  faithfully rendering minutes-old readings, with nothing on screen');
console.log('  to say so. That is the failure mode a demo never shows you.\n');

// And the staleness contract, shown on one sample.
const stale = renderSample(
  { feederId: 'F0003', seq: 1, ts: 0, voltage: 188 }, 9_000, 2_000);
console.log(`  Staleness is rendered, not hidden: ` +
            `${stale.feederId} value=${stale.value} age=${stale.ageMs}ms ` +
            `state=${stale.state}\n`);
