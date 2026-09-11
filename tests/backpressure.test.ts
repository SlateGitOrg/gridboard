import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BackpressureBuffer } from '../src/backpressure.ts';
import { renderSample, gapSince, type Sample } from '../src/protocol.ts';

function sample(seq: number, ts = seq * 100): Sample {
  return { feederId: 'F0001', seq, ts, voltage: 230 };
}

describe('BackpressureBuffer', () => {
  test('THE INVARIANT: newest() is always the most recent push, at any overload', () => {
    // A naive unbounded queue also passes a gentle test. Push 500x capacity.
    const buf = new BackpressureBuffer(16);
    for (let i = 0; i < 8_000; i++) {
      buf.push(sample(i));
      assert.equal(
        buf.newest()!.seq,
        i,
        `after pushing ${i}, newest must be ${i} - the live edge was lost`,
      );
    }
  });

  test('stays bounded under sustained overload', () => {
    const buf = new BackpressureBuffer(32);
    for (let i = 0; i < 100_000; i++) buf.push(sample(i));
    assert.ok(
      buf.length <= 32,
      `occupancy ${buf.length} exceeded capacity - this is the unbounded-queue bug`,
    );
    assert.ok(buf.decimationPasses > 0, 'expected decimation to have engaged');
  });

  test('preserves monotonic ordering after decimation', () => {
    const buf = new BackpressureBuffer(8);
    for (let i = 0; i < 5_000; i++) buf.push(sample(i));
    const seqs = buf.snapshot().map((s) => s.seq);
    for (let i = 1; i < seqs.length; i++) {
      assert.ok(seqs[i]! > seqs[i - 1]!, 'decimation must not reorder samples');
    }
  });

  test('keeps the oldest sample as a continuity anchor', () => {
    const buf = new BackpressureBuffer(8);
    for (let i = 0; i < 100; i++) buf.push(sample(i));
    assert.equal(buf.oldest()!.seq, 0);
  });

  test('a slow consumer converges on the live edge instead of drifting', () => {
    // Producer runs 10x faster than the consumer drains.
    const buf = new BackpressureBuffer(64);
    let lastDrained = -1;
    for (let i = 0; i < 10_000; i++) {
      buf.push(sample(i));
      if (i % 10 === 0) {
        const got = buf.drain(1);
        if (got.length) lastDrained = got[0]!.seq;
      }
    }
    // With an unbounded queue the consumer would be ~9,000 samples behind.
    const lag = 9_999 - lastDrained;
    assert.ok(lag < 9_000, `consumer lag ${lag} indicates unbounded drift`);
  });

  test('rejects a capacity that cannot honour both endpoints', () => {
    assert.throws(() => new BackpressureBuffer(1), /capacity must be >= 2/);
  });
});

describe('staleness is a rendered state, never an absent one', () => {
  test('a value older than the threshold renders STALE', () => {
    const r = renderSample(sample(1, 1_000), 1_000 + 5_000, 2_000);
    assert.equal(r.state, 'STALE');
    assert.equal(r.ageMs, 5_000);
  });

  test('a fresh value renders LIVE with its age attached', () => {
    const r = renderSample(sample(1, 1_000), 1_300, 2_000);
    assert.equal(r.state, 'LIVE');
    assert.equal(r.ageMs, 300);
  });

  test('every rendered value carries an age - there is no path without one', () => {
    for (let age = 0; age < 10_000; age += 137) {
      const r = renderSample(sample(1, 0), age, 2_000);
      assert.equal(typeof r.ageMs, 'number');
      assert.equal(r.ageMs, age);
      assert.equal(r.state, age > 2_000 ? 'STALE' : 'LIVE');
    }
  });

  test('gapSince reports how many samples the consumer was skipped', () => {
    assert.equal(gapSince(null, sample(5)), 0, 'first sample cannot be a gap');
    assert.equal(gapSince(4, sample(5)), 0);
    assert.equal(gapSince(4, sample(9)), 4);
  });
});
