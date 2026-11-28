import type { Riva } from '../client';
import {
	RivaAbortError,
	RivaError,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
} from '../errors';
import { nodeOf } from '../graph';
import {
	type Ctx,
	type Entry,
	type Lay,
	peek,
	putData,
	type SeedEntry,
} from '../query-entry';
import { decode, ssrError } from './codec';
import type { Snapshot, SnapshotEntry, SnapshotError } from './dehydrate';

/** Rebuilds the error by its code, so `instanceof` still holds. The message is empty: it never travels. */
const errorOf = ({ code, status, retryable }: SnapshotError): unknown => {
	if (code === 'RIVA_NETWORK') return new RivaNetworkError('');
	if (code === 'RIVA_ABORT') return new RivaAbortError('');
	if (code.startsWith('HTTP_') && status !== undefined)
		return new RivaHttpError(status, '');
	return retryable === undefined
		? new RivaError(code, '')
		: new RivaRequestError(code, '', {
				retryable,
				...(status !== undefined && { status }),
			});
};

/** Writes a snapshot entry over an entry, through its definition's cache policy. */
function apply(c: Ctx, e: Entry, p: SeedEntry): void {
	e.invalidated = !!p.i || (!!e.def.options.live && !e.observers);
	putData(c, e, {
		status: p.s,
		error: p.e && errorOf(p.e),
		...(p.d !== undefined && { data: decode(p.d), updatedAt: p.at }),
	});
	if (p.d !== undefined) e.seeded = { u: p.at, t: p.at + p.u };
}

/**
 * Called on each new entry: applies what a snapshot held for it. An entry
 * whose definition has a cache policy, hydrated for a render, is left for
 * the deferred pass: its write would reach entities other entries observe.
 */
function seed(c: Ctx, e: Entry): void {
	const p = c.pending?.get(e.key);
	if (p && !(p.defer && e.def.options.cache)) {
		c.pending?.delete(e.key);
		apply(c, e, p);
		// Applied now: the deferred pass must not write it a second time.
		const i = p.defer?.findIndex((x) => x.k === p.k) ?? -1;
		if (i >= 0) p.defer?.splice(i, 1);
	}
}

/**
 * Loads a snapshot into a riva. Entries and signals the riva does not have
 * yet are seeded the moment their definition is first used; an entry it has
 * is overwritten only by a newer snapshot, and never while it fetches or
 * carries optimistic layers. With `deferObserved` (a render), nothing
 * that could reach an observed entry is written: the entries something
 * observes, those with a cache policy and those not created yet are returned
 * as a snapshot to hand to `hydrate` later, outside the render.
 */
export function hydrate(
	riva: Riva,
	snapshot: Snapshot,
	opts?: { deferObserved?: boolean },
): Snapshot | undefined {
	const v = (snapshot as { v?: unknown } | undefined)?.v;
	if (v !== 1)
		throw ssrError(
			`Cannot hydrate: this is not a snapshot dehydrate() made (version ${v}).`,
		);
	const c = riva.queries.ctx;
	const { graph: g } = riva;
	c.pending ??= new Map();
	const { pending } = c;
	c.seed = seed;
	const now = c.sched.now();
	const defer = opts?.deferObserved;
	const deferred: SnapshotEntry[] = [];
	riva.batch(() => {
		for (const se of snapshot.q) {
			// A deferred snapshot is applied later, so its ages are understated by the delay.
			const p: SeedEntry = {
				...se,
				at: now - se.u,
				...(defer && { defer: deferred }),
			};
			const e = c.entries.get(se.k);
			if (!e) {
				const old = pending.get(p.k);
				if (!old || old.at <= p.at) pending.set(p.k, p);
				if (defer) deferred.push(se);
				continue;
			}
			const cur = peek(c, e);
			if (
				e.run ||
				(nodeOf(g, e.lay).value as Lay[]).length ||
				cur.updatedAt > p.at
			)
				continue;
			if (defer && (e.observers || e.def.options.cache)) deferred.push(se);
			else apply(c, e, p);
		}
		g.seeds ??= new Map();
		for (const name in snapshot.a)
			if (!g.named.has(name)) g.seeds.set(name, decode(snapshot.a[name]));
	});
	return deferred.length
		? ({ v: 1, t: snapshot.t, q: deferred, a: {} } as unknown as Snapshot)
		: undefined;
}
