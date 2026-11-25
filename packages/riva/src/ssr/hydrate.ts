import type { RivaClient } from '../client';
import { RivaError, RivaRequestError } from '../errors';
import { nodeOf } from '../graph';
import { type Ctx, type Entry, type Lay, peek, putData } from '../query-entry';
import { decode, ssrError } from './codec';
import type { Snapshot, SnapshotEntry, SnapshotError } from './dehydrate';

type Pending = SnapshotEntry & { at: number };

const errorOf = ({ code, message = '', ...o }: SnapshotError): unknown =>
	o.retryable === undefined
		? new RivaError(code, message)
		: new RivaRequestError(code, message, o as { retryable: boolean });

/** Writes a snapshot entry over an entry, through its definition's cache policy. */
function apply(c: Ctx, e: Entry, p: Pending): void {
	e.invalidated = !!p.i;
	putData(c, e, {
		status: p.s,
		error: p.e && errorOf(p.e),
		...(p.d !== undefined && { data: decode(p.d), updatedAt: p.at }),
	});
}

/** Called on each new entry: applies what a snapshot held for it. */
function seed(c: Ctx, e: Entry): void {
	const pending = c.pending as Map<string, Pending>;
	const p = pending.get(e.key);
	if (p) {
		pending.delete(e.key);
		apply(c, e, p);
	}
}

/**
 * Loads a snapshot into a client. Entries and atoms the client does not have
 * yet are seeded the moment their definition is first used; an entry it has
 * is overwritten only by a newer snapshot, and never while it fetches or
 * carries optimistic layers. With `deferObserved`, the entries something
 * observes are returned as a snapshot to apply later, outside a render.
 */
export function hydrate(
	client: RivaClient,
	snapshot: Snapshot,
	opts?: { deferObserved?: boolean },
): Snapshot | undefined {
	const v = (snapshot as { v?: unknown } | undefined)?.v;
	if (v !== 1)
		throw ssrError(
			`Cannot hydrate: this is not a snapshot dehydrate() made (version ${v}).`,
		);
	const c = client.queries.ctx;
	const { graph: g } = client;
	c.pending ??= new Map();
	const { pending } = c;
	c.seed = seed;
	const now = c.sched.now();
	const deferred: SnapshotEntry[] = [];
	client.batch(() => {
		for (const se of snapshot.q) {
			const p = { ...se, at: now - se.u };
			const e = c.entries.get(se.k);
			if (!e) {
				pending.set(p.k, p);
				continue;
			}
			const cur = peek(c, e);
			if (
				e.run ||
				(nodeOf(g, e.lay).value as Lay[]).length ||
				cur.updatedAt > p.at
			)
				continue;
			if (opts?.deferObserved && e.observers) deferred.push(se);
			else apply(c, e, p);
		}
		g.seeds ??= new Map();
		for (const name in snapshot.a)
			if (!g.named.has(name)) g.seeds.set(name, decode(snapshot.a[name]));
	});
	return deferred.length
		? { v: 1, t: snapshot.t, q: deferred, a: {} }
		: undefined;
}
