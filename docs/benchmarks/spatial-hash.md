# Spatial-hash broad phase — benchmark record

`scripts/benchmark-drag.mjs`, 120 moves per scenario, median of three runs per
variant on the same machine, taken immediately before and after the hash landed
(branch `feat/spatial-hash-broad-phase`, baseline `818d5a0` vs `48a062f`).
Narrow-phase counters (`contactsPerMove`/`castsPerMove`) are identical before
and after in every scenario — the hash never changes which shapes reach the
exact filter, only how candidates are found.

## Default scene (10 forms — the benchmark's fixture set)

| Scenario                    | Baseline mean | Baseline p95 | After mean | After p95 |
| --------------------------- | ------------- | ------------ | ---------- | --------- |
| birdbath over clear ground  | 0.237 ms      | 0.770 ms     | 0.267 ms   | 0.821 ms  |
| birdbath toward an obstacle | 5.345 ms      | 6.903 ms     | 5.360 ms   | 6.763 ms  |
| same snapped cell           | 0.002 ms      | 0.002 ms     | 0.002 ms   | 0.002 ms  |

Parity within the run-to-run spread (clear-ground runs span 0.237–0.288 ms
across both variants). The obstacle scenario is dominated by terrain
narrow-phase work (52 casts per move), which the hash does not index.

## Clear-corridor move at the 40-form cap (same methodology, scratch harness)

| Variant  | mean     | p95      |
| -------- | -------- | -------- |
| baseline | 0.382 ms | 1.365 ms |
| hash     | 0.275 ms | 0.571 ms |

−28% mean, −58% p95. The whole-scene bounds scan the hash replaces scales with
object count; the cell lookup does not, which is why parity at 10 forms turns
into a clear win approaching the 40-form scene cap.
