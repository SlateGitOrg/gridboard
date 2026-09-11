# gridboard

> A dispatch console for a regional grid operator that degrades visibly under load instead of silently showing stale data.

`FLAGSHIP` · **Full Stack Engineering** · Expert · ~5-6 weeks · Energy / utilities

**Primary language:** TypeScript
**Tags:** `streaming`, `websockets`, `timeseries`, `backpressure`, `react`, `observability`

---

## The problem

Grid controllers watch thousands of telemetry points and must act within seconds. If the console lags, freezes, or renders a stale value as though it were live, an operator makes a dispatch decision on fiction - and on a grid that means load shedding in the wrong place. Most real-time dashboard projects work beautifully in a demo and fall apart the moment the data rate exceeds what a browser can paint.

## ⭐ The differentiator

Server-authoritative state with a monotonic sequence number per feeder, plus **backpressure-aware server-side downsampling**: when a client falls behind its acknowledgement watermark, the server drops *interior* points and always delivers the newest sample, rather than queueing an ever-growing backlog. A generic version pushes every tick down a socket and silently accumulates seconds of lag with no indication the view is stale. Here, every panel renders its own data age and flips to an explicit `STALE` state rather than lying by omission.

This is the sentence to lead with when someone asks you to walk through the
project. Everything else in this repo exists to make it true and to prove it.

## Data

A documented synthetic generator simulating 2,000 feeder sensors at 10 Hz, with injected faults: voltage sag, sensor flatline, clock skew, and network partition. **Ground truth:** every injected fault carries a known start timestamp and feeder ID, so detection latency is a measured number rather than an impression. Topology is modelled on the openly published IEEE distribution test feeders.

> No paid API key is required to run or demo this project. Where a paid
> service would add value it is wired as an optional enhancement behind an
> interface with an offline mock as the default implementation.

## Stack

- TypeScript everywhere (strict mode, no `any` in the protocol package)
- Next.js (App Router) for the operator surface
- Fastify + `ws` for the gateway
- TimescaleDB (hypertables + continuous aggregates)
- Redis Streams as the ingest buffer
- Docker Compose for the full estate; Playwright for end-to-end latency assertions

## Core capabilities

- Live topology map where every panel renders its own data-freshness age and an explicit stale state
- Backpressure protocol: the server tracks a per-client acknowledgement watermark and adaptively downsamples rather than buffering
- Hypertable with continuous aggregates at 1s / 1m / 1h, selected by the client's current zoom level
- Operator action log as an append-only audit trail capturing the exact state snapshot visible at click time
- Replay mode that scrubs any past hour at full fidelity through the same read path as live

## Repository layout

```
apps/web/            # Next.js operator console
apps/gateway/        # Fastify + WebSocket fan-out, backpressure control
packages/protocol/   # shared wire types, sequence + ack semantics
db/migrations/       # Timescale hypertables, continuous aggregates
sim/                 # synthetic feeder generator + fault injection
test/latency/        # end-to-end fault-to-pixel latency assertions
```

## Build plan

1. Build `sim/` first. Until faults are injected at known timestamps, no latency claim you make is checkable.
2. Land the protocol package: sequence numbers, ack watermark, stale thresholds. Types before transport.
3. Gateway with naive fan-out. Measure it. Watch it fall over at 10x. Keep the number.
4. Add backpressure downsampling. Measure again. The delta between these two numbers is your interview story.
5. Console with per-panel data age, then the topology map, then replay mode.

## Testing strategy

Assert end-to-end **fault-to-pixel latency p95 < 500 ms under a 10x burst** - driven by Playwright against the real stack, reading the rendered DOM, not a unit-test stub. Assert the safety invariant directly: no client ever renders a value older than the data age it displays. Property tests over the protocol assert sequence monotonicity and that downsampling never drops the newest sample.

Tests assert **correctness**, not merely that the code runs. A green suite on
this repo is a claim about behaviour under adversarial conditions; treat any
test that would pass against a deliberately broken implementation as a bug in
the test.

## Quality & safety layer

Staleness is a first-class rendered state, not an absent one. A panel that cannot prove its freshness must show `STALE`; the end-to-end suite fails if any code path can paint a value without an accompanying age.

## Measurable outcome

> Operators see a genuine fault a median of 1.2 s after it occurs, and the console never silently shows stale data - under 10x load it degrades visibly instead of lying.

State it in these terms — business units, not technical ones — in your CV
bullet and in the first thirty seconds of describing the project.

## Interview questions this project answers

- **How do you handle a slow consumer on a fan-out socket?**
- **What does your system do when it cannot keep up - and how does the user find out?**
- **Why continuous aggregates rather than querying raw points?**

## What this deliberately is *not*

- Not a charting-library showcase. The chart is the easy part; the flow control is the project.
- Not an attempt at SCADA-grade control. This is read-and-decide, not actuate.


## Run it now

```bash
npm test        # runs the suite; no install step needed
npm run demo    # the 60-second artefact
```

Requires Node 22.6+ (24 recommended). TypeScript runs natively via
type stripping - there is no build step and no `node_modules`.

## Getting started

```bash
git clone <your-fork-url> gridboard
cd gridboard
docker compose up -d          # Timescale + Redis
npm install
npm run sim                   # start the synthetic feeder stream
npm run dev                   # console on http://localhost:3000
npm run test:latency          # the number that matters
```

Docker is supported but optional — every path above works on a plain
Windows/macOS/Linux laptop without a cloud account.

## Definition of done

- [ ] The differentiator above is implemented, and a test proves it
- [ ] The measurable outcome is produced by a command anyone can run
- [ ] `README` explains the one decision a generic version gets wrong
- [ ] CI runs the full suite on every push and is green on `main`
- [ ] A recruiter can see the headline artefact in under 60 seconds

## Licence

MIT — see [LICENSE](LICENSE).
