// The radar's model: one sealed snapshot of the protocol universe in, one ranked board of
// pre-token protocols out. Every figure on the board is derived from the snapshot's own numbers
// at run time. No protocol name is special-cased anywhere in this file; the same code scores
// every row, and the launched protocols are kept apart from the pre-token ones throughout.
//
// How an implied value is made:
//   1. The launched set: protocols that record a token with a market cap. For each of them the
//      market's own multiple is mcap / TVL. One wild print cannot bend a category: every
//      multiple is winsorized into [0.005, 5] before any statistic is taken from it.
//   2. A category's multiple is the median of its launched multiples, shrunk toward the global
//      median with a prior weight of 4 (a category with a single comparable leans mostly on
//      the whole market), then clamped into [0.02, 3]. A category with no launched comparable
//      takes the global median itself.
//   3. A pre-token protocol's base value is its TVL times its category's multiple, adjusted by
//      four factors, each computed from the protocol's own record:
//        growth  1 + clamp(change_7d, -50, 100) * 0.006    (no reported change: 1, neutral)
//        age     0.75 + 0.45 * min(age_days, 1095) / 1095  (no listing date: the snapshot's
//                median age, so a missing date is priced like a typical protocol)
//        chains  1 + 0.02 * min(chains - 1, 10)
//        size    clamp(0.9 + 0.05 * log10(TVL / 5,000,000), 0.9, 1.15)
//   4. implied_value_usd = round(TVL * multiple * growth * age * chains * size), at least 1.
//
// The board is the watchlist (every slug, always) plus every other protocol that records no
// token and is a candidate for a launch of its own: not an exchange house product, not a
// versioned pool of another protocol, not a wrapped, staked or staking product of one whose
// token already trades, and not named for an exchange. The house's watchlist rule reads the
// bridged and staked product families off by category — Bridge, Canonical Bridge, Liquid
// Staking, Liquid Restaking and Restaked BTC are claims on another protocol's asset, not
// launches of their own — and the board beyond the watchlist follows the same reading, so a
// wrapped asset like the snapshot's largest bridge entry never ranks as a launch candidate.
// Protocols that record a token but no market cap are neither ranked nor used as comparables;
// the data file counts them apart.

/** One protocol of the snapshot: exactly the ten fields the sealed input carries. */
export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** Why a snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

// ---------------------------------------------------------------- statistics

const DAY_MS = 86_400_000;

/** Whole days from a listing date to the snapshot's date, clamped at zero; null when unknown. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** One launched comparable, as the dashboard's detail view shows it. */
export interface Comparable {
  name: string;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

/** What the launched set says about one category. */
export interface CategoryMultiple {
  category: string;
  comps: number;
  median: number;
  multiple: number;
}

/** The launched set, distilled: the global median multiple and every category's own. */
export interface MultipleTable {
  global_median: number;
  launched: number;
  categories: CategoryMultiple[];
  by_category: Map<string, CategoryMultiple>;
  comps_by_category: Map<string, Comparable[]>;
}

const RATIO_FLOOR = 0.005;
const RATIO_CAP = 5;
const PRIOR_WEIGHT = 4;
const MULTIPLE_FLOOR = 0.02;
const MULTIPLE_CAP = 3;

/** Derive every category multiple from the snapshot's launched protocols. */
export function deriveMultiples(snapshot: Snapshot): MultipleTable {
  const ratiosByCategory = new Map<string, number[]>();
  const compsByCategory = new Map<string, Comparable[]>();
  const allRatios: number[] = [];
  let launched = 0;
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    launched++;
    const ratio = clamp(p.mcap_usd / p.tvl_usd, RATIO_FLOOR, RATIO_CAP);
    allRatios.push(ratio);
    const category = p.category ?? 'Uncategorized';
    if (!ratiosByCategory.has(category)) ratiosByCategory.set(category, []);
    ratiosByCategory.get(category)!.push(ratio);
    if (!compsByCategory.has(category)) compsByCategory.set(category, []);
    compsByCategory.get(category)!.push({ name: p.name, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, ratio: round4(p.mcap_usd / p.tvl_usd) });
  }
  const globalMedian = allRatios.length > 0 ? median(allRatios) : 0.1;
  const categories: CategoryMultiple[] = [];
  const byCategory = new Map<string, CategoryMultiple>();
  for (const [category, ratios] of ratiosByCategory) {
    const med = median(ratios);
    const multiple = clamp((ratios.length * med + PRIOR_WEIGHT * globalMedian) / (ratios.length + PRIOR_WEIGHT), MULTIPLE_FLOOR, MULTIPLE_CAP);
    const row: CategoryMultiple = { category, comps: ratios.length, median: round4(med), multiple: round4(multiple) };
    categories.push(row);
    byCategory.set(category, row);
  }
  categories.sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  for (const list of compsByCategory.values()) {
    list.sort((a, b) => b.mcap_usd - a.mcap_usd || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    list.splice(5);
    list.sort((a, b) => b.ratio - a.ratio);
  }
  return { global_median: round4(globalMedian), launched, categories, by_category: byCategory, comps_by_category: compsByCategory };
}

/** The multiple one category gets: its own row, or the global median when it has no comparable. */
function multipleFor(table: MultipleTable, category: string | null): number {
  if (category === null) return table.global_median;
  return table.by_category.get(category)?.multiple ?? table.global_median;
}

// ---------------------------------------------------------------- the value model

/** The four adjustment factors and the implied value one protocol gets. */
export interface Score {
  multiple: number;
  growth_factor: number;
  age_factor: number;
  chain_factor: number;
  size_factor: number;
  age_days: number | null;
  implied: number;
}

/** Score one pre-token protocol from its own record and the snapshot's multiples. */
export function score(p: Protocol, asOf: string, table: MultipleTable, medianAge: number): Score {
  const age = ageDays(asOf, p.listed_at);
  const growth = p.change_7d === null ? 1 : 1 + clamp(p.change_7d, -50, 100) * 0.006;
  const ageForModel = age ?? medianAge;
  const ageFactor = 0.75 + 0.45 * (Math.min(Math.max(ageForModel, 0), 1095) / 1095);
  const chainFactor = 1 + 0.02 * Math.min(Math.max(p.chains.length - 1, 0), 10);
  const sizeFactor = clamp(0.9 + 0.05 * Math.log10(Math.max(p.tvl_usd, 1) / 5_000_000), 0.9, 1.15);
  const multiple = multipleFor(table, p.category);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growth * ageFactor * chainFactor * sizeFactor));
  return {
    multiple,
    growth_factor: round4(growth),
    age_factor: round4(ageFactor),
    chain_factor: round4(chainFactor),
    size_factor: round4(sizeFactor),
    age_days: age,
    implied,
  };
}

// ---------------------------------------------------------------- who is on the board

/** Whether a protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A wrapped, staked or staking product of a protocol whose token already trades. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;
/** Names that begin with an exchange's name are that exchange's own products. */
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Categories that are products of another protocol: claims on its asset, not launches. */
const PRODUCT_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/**
 * Whether a pre-token protocol is a candidate for a launch of its own, beyond the watchlist:
 * not an exchange house product, not a versioned pool, not a wrapped or staked product of a
 * token that already trades, not named for an exchange, and not in one of the product
 * categories the house's own watchlist rule sets aside.
 */
export function isCandidate(p: Protocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (PRODUCT_WORD.test(p.name)) return false;
  if (EXCHANGE_NAMES.some((x) => p.name.startsWith(x))) return false;
  return true;
}

// ---------------------------------------------------------------- farm plans

/** A rough mainnet-style gas figure for one transaction on a chain, in dollars. */
function gasFor(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 14;
  if (c === 'solana') return 1;
  if (c.includes('bnb') || c.includes('binance')) return 1;
  if (['base', 'arbitrum', 'optimism', 'polygon', 'zksync era', 'linea', 'scroll', 'mantle', 'avalanche', 'fantom', 'sonic', 'berachain', 'monad'].some((x) => c.includes(x))) return 2;
  return 3;
}

/** How much capital one farm position carries, from the protocol's own TVL band. */
function capitalFor(tvl: number): number {
  if (tvl >= 1_000_000_000) return 500;
  if (tvl >= 250_000_000) return 250;
  if (tvl >= 50_000_000) return 150;
  if (tvl >= 10_000_000) return 100;
  return 50;
}

/** How many weeks the weekly routine runs, from the protocol's age: younger, longer. */
function weeksFor(age: number | null, medianAge: number): number {
  const a = age ?? medianAge;
  if (a < 180) return 10;
  if (a < 730) return 8;
  return 6;
}

type Family = 'lending' | 'dex' | 'vault' | 'staking' | 'bridge' | 'curator' | 'rwa' | 'derivatives' | 'chain' | 'payments' | 'insurance' | 'stable' | 'prediction' | 'core';

/** The farm family a category belongs to, by what the protocol's product does. */
function familyFor(category: string | null): Family {
  const c = (category ?? '').toLowerCase();
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('lending') || c === 'cdp' || c.includes('uncollateralized')) return 'lending';
  if (c.includes('dex') || c.includes('liquidity manager')) return 'dex';
  if (c.includes('staking') || c.includes('restak') || c.includes('anchor btc') || c.includes('decentralized btc')) return 'staking';
  if (c.includes('risk curators') || c.includes('allocator') || c.includes('collateral')) return 'curator';
  if (c.includes('yield') || c.includes('basis') || c.includes('leveraged farming') || c === 'farm' || c.includes('cedeFi'.toLowerCase())) return 'vault';
  if (c.includes('rwa')) return 'rwa';
  if (c.includes('derivative') || c.includes('options')) return 'derivatives';
  if (c === 'chain') return 'chain';
  if (c.includes('payment')) return 'payments';
  if (c.includes('insurance')) return 'insurance';
  if (c.includes('stable')) return 'stable';
  if (c.includes('prediction')) return 'prediction';
  return 'core';
}

/** The core position and the second action, in the words of the protocol's own product family. */
function familyActions(family: Family, name: string, chain: string, chain2: string | undefined, capital: number, gas: number, weeklyGas: number, weeks: number): { core: string; second: string } {
  const fifth = Math.max(10, Math.round(capital / 5));
  const quarter = Math.max(10, Math.round(capital / 4));
  const half = Math.max(10, Math.round(capital / 2));
  switch (family) {
    case 'lending':
      return {
        core: `Supply $${capital} of USDC to ${name} on ${chain} as collateral and leave it supplied. Cost: $${capital} of capital plus about $${gas} in gas. Time: 15 minutes to set up.`,
        second: `Borrow about $${fifth} of a stablecoin against the supply and redeposit it once — one careful loop, never more — so both sides of ${name}'s market see the wallet. Cost: about $${gas} in gas. Time: 10 minutes, once; unwind the loop before you exit.`,
      };
    case 'dex':
      return {
        core: `Provide $${capital} of liquidity to ${name}'s busiest pool on ${chain}, split evenly across the pair, and keep the position in range. Cost: $${capital} of capital plus about $${gas} in gas. Time: 15 minutes to set up.`,
        second: `Route your weekly swaps through ${name} itself rather than an aggregator, about $${fifth} a week, so the wallet's trading volume is native to the protocol. Cost: about $${weeklyGas} of gas a week. Time: 5 minutes a week.`,
      };
    case 'vault':
      return {
        core: `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and hold the vault shares in the same wallet. Cost: $${capital} of capital plus about $${gas} in gas. Time: 15 minutes to set up.`,
        second: `From week 2, hold a second, smaller position of about $${quarter} in another ${name} vault or market on ${chain}, so the wallet follows more than one strategy. Cost: about $${gas} in gas plus the added capital. Time: 10 minutes, once.`,
      };
    case 'staking':
      return {
        core: `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token in the wallet. Cost: $${capital} of capital plus about $${gas} in gas. Time: 15 minutes to set up.`,
        second: `Use the receipt token once in a paired product ${name} points to — a pool or a vault — with about $${quarter}, so the wallet shows the full staking path and not just the stake. Cost: about $${gas} in gas plus the added capital. Time: 15 minutes, once.`,
      };
    case 'bridge':
      return {
        core: `Bridge $${capital} of USDC from ${chain} to ${chain2 ?? 'a second chain'} through ${name}, then deposit or spend the bridged funds at the far end instead of bridging straight back. Cost: $${capital} of capital plus about $${gas} in gas. Time: 20 minutes for the round trip.`,
        second: `Two weeks later, make one bridge trip in the opposite direction with about $${half}, so the wallet holds history on both sides of the route. Cost: about $${gas} in gas. Time: 15 minutes, once.`,
      };
    case 'curator':
      return {
        core: `Deposit $${capital} of USDC into a ${name} curated vault on ${chain} and hold the shares; the curator's allocation is the position. Cost: $${capital} of capital plus about $${gas} in gas. Time: 15 minutes to set up.`,
        second: `From week 2, add a second vault from the same curator's shelf with about $${quarter}, so the wallet follows more than one allocation. Cost: about $${gas} in gas plus the added capital. Time: 10 minutes, once.`,
      };
    case 'rwa':
      return {
        core: `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} with USDC and hold it in the wallet. Cost: $${capital} of capital plus about $${gas} in gas. Time: 15 minutes to set up, after any onboarding the asset asks for.`,
        second: `Add about $${quarter} more once the first yield cycle has landed, so the wallet's balance history spans a full distribution. Cost: about $${gas} in gas plus the added capital. Time: 10 minutes, once.`,
      };
    case 'derivatives':
      return {
        core: `Deposit $${capital} of USDC as margin on ${name} and open one small position you can explain — a hedge against a spot holding is ideal — then close it inside the week. Cost: $${capital} of margin plus about $${gas} in fees. Time: 20 minutes to set up.`,
        second: `Keep a modest resting order or a small open position on ${name} across the ${weeks} weeks rather than trading in one burst, and never let the margin fall below half. Cost: about $${weeklyGas} in fees a week. Time: 10 minutes a week.`,
      };
    case 'chain':
      return {
        core: `Bridge $${capital} of USDC onto ${name} itself and hold it there: a chain's own token, if one comes, rewards the wallets that live on the chain. Cost: $${capital} of capital plus about $${gas} in gas. Time: 20 minutes to set up.`,
        second: `Use two or three native apps on ${name} — a swap, a lend, a mint — with about $${fifth} in total, and pay the gas in the chain's own fee asset. Cost: about $${weeklyGas} in gas a week. Time: 15 minutes a week.`,
      };
    case 'payments':
      return {
        core: `Route $${capital} of real payments or transfers through ${name} on ${chain} spread across the month, not in one lump on one day. Cost: $${capital} of throughput plus about $${gas} in fees. Time: 10 minutes to set up.`,
        second: `Keep one recurring weekly payment of about $${fifth} running through ${name} for ${weeks} weeks, so the wallet reads as a user, not a passer-by. Cost: about $${weeklyGas} in fees a week. Time: 5 minutes a week.`,
      };
    case 'insurance':
      return {
        core: `Buy $${capital} of cover from ${name} on ${chain} for an asset you actually hold elsewhere, and keep the policy to its expiry. Cost: about $${Math.max(5, Math.round(capital / 10))} in premium plus about $${gas} in gas. Time: 15 minutes to set up.`,
        second: `If ${name} opens an underwriting pool, place about $${quarter} in it for one cover period so the wallet appears on both sides of the market. Cost: about $${gas} in gas plus the staked capital. Time: 10 minutes, once.`,
      };
    case 'stable':
      return {
        core: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold the balance in the wallet. Cost: $${capital} of capital plus about $${gas} in gas. Time: 15 minutes to set up.`,
        second: `Provide about $${quarter} of the stable asset to its main pool on ${chain}, so the wallet both holds and supplies it. Cost: about $${gas} in gas plus the added capital. Time: 15 minutes, once.`,
      };
    case 'prediction':
      return {
        core: `Fund $${capital} on ${name} and take positions in three or four markets you genuinely have a view on, sized small. Cost: $${capital} of capital plus about $${gas} in fees. Time: 20 minutes to set up.`,
        second: `Stay active in one new market a week for ${weeks} weeks; a record spread across many markets is the pattern that matters here. Cost: about $${fifth} a week of position size. Time: 10 minutes a week.`,
      };
    default:
      return {
        core: `Deposit $${capital} of USDC into ${name}'s core product on ${chain} and keep the position open. Cost: $${capital} of capital plus about $${gas} in gas. Time: 15 minutes to set up.`,
        second: `Take the second action ${name} offers on ${chain} — a vote, a lock or a second pool — with about $${quarter} from week 2, so the wallet's history is more than one transaction. Cost: about $${gas} in gas plus the added capital. Time: 10 minutes, once.`,
      };
  }
}

/**
 * One protocol's farm plan: six steps, each an action with a dollar cost and a time. Every
 * figure in it comes from the protocol's own record — its category, its chains, its TVL band
 * and its age — never from a hand-written list of protocols.
 */
export function farmSteps(p: Protocol, age: number | null, medianAge: number): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const chain2 = p.chains.length > 1 ? p.chains[1]! : undefined;
  const capital = capitalFor(p.tvl_usd);
  const gas = gasFor(chain);
  const weeklyGas = Math.max(1, Math.round(gas / 2));
  const weeks = weeksFor(age, medianAge);
  const { core, second } = familyActions(familyFor(p.category), p.name, chain, chain2, capital, gas, weeklyGas, weeks);
  const steps: string[] = [
    `Set up a fresh wallet for ${p.name} and fund it on ${chain} with the position capital plus gas money, keeping the seed phrase offline. Cost: about $${gas} in gas for the wallet's first transactions. Time: 10 minutes, once.`,
    core,
    second,
    `Repeat one small qualifying action on ${p.name} every week — a deposit, a swap, a vote or a claim — for ${weeks} weeks, so the wallet shows a pattern of use rather than a single visit. Cost: about $${weeklyGas} of gas a week. Time: 10 minutes a week for ${weeks} weeks.`,
  ];
  if (chain2 !== undefined) {
    steps.push(
      `From week 3, repeat the core position on ${chain2} with about $${Math.max(10, Math.round(capital / 2))}, so the wallet is active on two of ${p.name}'s ${p.chains.length} chains and not just the cheapest one. Cost: about $${gasFor(chain2)} in gas plus the extra capital. Time: 20 minutes, once.`,
    );
  } else {
    steps.push(
      `In week 3, deepen the position by about $${Math.max(10, Math.round(capital / 4))} or take a second product ${p.name} offers on ${chain}, so the wallet's history is more than a single action. Cost: about $${gas} in gas plus the added capital. Time: 15 minutes, once.`,
    );
  }
  steps.push(
    `Keep a farm log — wallet, dates, amounts, transaction hashes — and check ${p.name}'s own page once a week for a points or snapshot announcement; claim only from a link the protocol itself publishes, and never pay anyone to claim for you. Cost: $0. Time: 5 minutes a week.`,
  );
  return steps;
}

// ---------------------------------------------------------------- the board

/** One row of board.json: the required five fields, then the record they were derived from. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  model: {
    multiple: number;
    growth_factor: number;
    age_factor: number;
    chain_factor: number;
    size_factor: number;
  };
}

/** The board: every watchlist protocol plus every other launch candidate, ranked by value. */
export function buildBoard(snapshot: Snapshot, table: MultipleTable, medianAge: number): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter((p) => watch.has(p.slug) || isCandidate(p));
  const scored = chosen.map((p) => ({ p, s: score(p, snapshot.as_of, table, medianAge) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map(({ p, s }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    implied_value_usd: s.implied,
    farm_steps: farmSteps(p, s.age_days, medianAge),
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    listed_at: p.listed_at,
    age_days: s.age_days,
    on_watchlist: watch.has(p.slug),
    model: {
      multiple: s.multiple,
      growth_factor: s.growth_factor,
      age_factor: s.age_factor,
      chain_factor: s.chain_factor,
      size_factor: s.size_factor,
    },
  }));
}

/** Why a board is not one the gate will take, or null when it is. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100 to 4000`;
  const slugs = new Set<string>();
  for (const r of board) {
    if (slugs.has(r.slug)) return `slug ${r.slug} appears twice`;
    slugs.add(r.slug);
  }
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `slug ${r.slug} is not in the snapshot`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `rank ${byRank[i]!.rank} outvalues rank ${byRank[i - 1]!.rank}`;
  }
  if (board.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) return 'every row shares one implied value';
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.name.trim() === '') return `${r.slug} has an empty name`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const len = s.trim().length;
      if (len < 20 || len > 600) return `${r.slug} has a farm step of ${len} characters`;
    }
  }
  return null;
}

// ---------------------------------------------------------------- the dashboard's data

/** Everything the dashboard renders, computed from the snapshot in one pass. */
export interface RadarData {
  as_of: string;
  floor_usd: number;
  scanned: number;
  pre_token: number;
  launched_comps: number;
  token_no_mcap: number;
  board_size: number;
  watchlist_size: number;
  total_implied_usd: number;
  global_median: number;
  median_age_days: number;
  multiples: CategoryMultiple[];
  comps: Record<string, Comparable[]>;
  rows: BoardRow[];
}

/** Build the board and the dashboard's data together, so the page and the board never disagree. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const table = deriveMultiples(snapshot);
  const ages = snapshot.protocols.map((p) => ageDays(snapshot.as_of, p.listed_at)).filter((a): a is number => a !== null);
  const medianAge = ages.length > 0 ? Math.round(median(ages)) : 365;
  const board = buildBoard(snapshot, table, medianAge);
  const comps: Record<string, Comparable[]> = {};
  for (const [category, list] of table.comps_by_category) comps[category] = list;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    scanned: snapshot.protocols.length,
    pre_token: snapshot.protocols.filter(isPreToken).length,
    launched_comps: table.launched,
    token_no_mcap: snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd === null).length,
    board_size: board.length,
    watchlist_size: snapshot.watchlist.length,
    total_implied_usd: board.reduce((n, r) => n + r.implied_value_usd, 0),
    global_median: table.global_median,
    median_age_days: medianAge,
    multiples: table.categories,
    comps,
    rows: board,
  };
  return { board, radar };
}

/** The dashboard's data as one script: window.RADAR, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
