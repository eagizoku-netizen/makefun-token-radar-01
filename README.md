[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/eagizoku-netizen/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/eagizoku-netizen/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Launch Radar

A token launch radar for the make.fun `token-radar-01` bounty. The program reads a sealed
DefiLlama snapshot of the protocol universe (758 protocols at $5M TVL or more) and answers
two questions for every protocol that records no token yet: what would a launch be worth if
the protocol's record stayed as it is, and what should a reader do to farm it before one
arrives?

## What it produces

Running the program writes, into the output directory:

- `board.json` — the ranked board: 198 pre-token protocols, each with a rank, an implied
  value, and a six-step farm plan with a dollar cost and a time for every step. Every one of
  the snapshot's 40 watchlist protocols is covered; the rest are earlier finds below the
  watchlist's $50M floor.
- `data.js` and `dashboard/` — a self-contained page (no network, no framework) that renders
  the board from the same data: sortable, filterable by category, chain, TVL band and
  seven-day growth, with a detail view per protocol that shows the model's arithmetic and
  the launched comparables its multiple came from.
- `screenshots/` — the board, a detail view, and a filtered view of that page.
- `dossier.json` — the judge's summary, written by the vendored library in
  `vendor/makefun-board.ts` from the dashboard and screenshots above.

## The value model

No protocol name is an input; every figure is derived from the snapshot at run time.

1. For each protocol whose token already trades, the market's own multiple is
   market cap / TVL, winsorized into [0.005, 5] so one wild print cannot bend a category.
2. A category's multiple is the median of its launched multiples, shrunk toward the
   market-wide median (0.17x here) with a prior weight of 4, then clamped into [0.02, 3].
   A category with no launched comparable is priced at the market median.
3. A pre-token protocol's implied value is its TVL times its category multiple, adjusted by
   four factors from its own record: seven-day TVL growth, age (how long it has run with no
   token; a missing listing date is priced at the snapshot's median age), chain count, and
   TVL band.

Protocols that record a token are never ranked — with a market cap they are the comparables,
without one they sit in neither set. Bridged, staked and exchange house products are set
aside by the same category reading the house's watchlist uses: they are claims on another
protocol's asset, not launches of their own.

## Farm plans

Each plan is generated from the protocol's category, chains, TVL band and age: a fresh
wallet, the category's core position sized by TVL band ($50–$500), a second qualifying
action, a weekly routine for 6–10 weeks, a second-chain or deeper position from week 3,
and a farm log with claim-safety rules. Every step states what it costs and how long it
takes.

## Running it

Node 22.18 or later, standard library only, nothing to install:

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

In the grader's container the defaults apply: the snapshot is read from
`/input/snapshot.json` and everything is written to `/output`. The run is deterministic —
the same snapshot in, the same bytes out.

The screenshots are rendered by `tools/make_screenshots.py` (Python 3 with Pillow and
NumPy), which draws the dashboard's own layout and figures from the program's outputs.

## License

MIT — see `LICENSE`.
