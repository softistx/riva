import type { Riva } from './client';
import { computed, type Readable } from './computed';
import type { RivaEvents, Scheduler } from './env';
import { RivaError } from './errors';
import { nodeOf } from './graph';
import { stableKey } from './key';
import type { Query, QueryState } from './query';
import { isBrowser } from './scope';
import { type Signal, signal } from './signal';
import type { SnapshotEntry } from './ssr/dehydrate';

// biome-ignore lint/suspicious/noExplicitAny: entries of every definition share one map
export type AnyQuery = Query<any, any>;
export type State = QueryState<unknown>;

export interface Inflight {
	promise: Promise<unknown>;
	/** Replaced on a restart (invalidate while in flight); aborted and kept on a cancel. */
	ctl: AbortController;
	waiters: number;
	/** Started by a prefetch, a poll or a refetch: a caller abort never cancels it. */
	pinned?: boolean;
	/** Set by `setData`: the waiters resolve with it instead of rejecting. */
	set?: { v: unknown } | undefined;
	/** The state to restore on cancel. */
	prev: State;
}

/** An optimistic write: maps the value below it to the value readers see. */
export type Lay = (prev: unknown) => unknown;

export interface Entry {
	key: string;
	def: AnyQuery;
	/** The definition a hot reload replaced: seen again, the id is shared. */
	was?: AnyQuery['options'];
	vars: unknown;
	/** The graph signal holding the state: the one notification mechanism. */
	signal: Signal<State>;
	/** The optimistic layers over the signal's data, oldest first. */
	lay: Signal<Lay[]>;
	/** What readers see: the signal's data through the cache policy, under the layers. */
	out: Readable<State>;
	observers: number;
	invalidated?: boolean;
	run?: Inflight | undefined;
	gc?: unknown;
	/** Closes what the fetch kept open (`ctx.keep`). */
	stop?: (() => void) | undefined;
	poll?: unknown;
}

/**
 * A snapshot entry waiting for its query entry. `defer` is the deferred
 * snapshot's entry list when hydrated for a render: it holds the entry back
 * from definitions with a cache policy, and `seed` takes the entry out of the
 * list once it has applied it. @internal
 */
export type SeedEntry = SnapshotEntry & {
	at: number;
	defer?: SnapshotEntry[];
};

/** What one riva's query cache shares between its files. */
export interface Ctx {
	riva: Riva;
	sched: Scheduler;
	events: RivaEvents;
	entries: Map<string, Entry>;
	/** Observers over every entry, to attach the window events once. */
	observed: number;
	detach?: (() => void) | undefined;
	/** Called on a new entry: `@softistx/riva/ssr` seeds it from a snapshot. @internal */
	seed?: (c: Ctx, e: Entry) => void;
	/** Snapshot entries waiting for their entry, by key. @internal */
	pending?: Map<string, SeedEntry>;
}

const IDLE: State = Object.freeze({
	status: 'idle',
	data: undefined,
	error: undefined,
	isFetching: false,
	updatedAt: 0,
});

/** The current state, untracked. */
export const peek = (c: Ctx, e: Entry): State =>
	nodeOf(c.riva.graph, e.signal).value as State;

/** The state as readers see it (data read through the cache policy), untracked. */
export const view = (c: Ctx, e: Entry): State =>
	c.riva.untracked(() => c.riva.get(e.out));

/** The data without the entry's own layers, untracked. */
export const committed = (c: Ctx, e: Entry): unknown =>
	c.riva.untracked(() => {
		const d = peek(c, e).data;
		const cache = e.def.options.cache;
		return cache && d !== undefined ? cache.read(c.riva, d, true) : d;
	});

/** Data is stored that the cache policy cannot read: an evicted entity, a field the server left out. */
export const unreadable = (c: Ctx, e: Entry): boolean =>
	peek(c, e).data !== undefined && committed(c, e) === undefined;

/** The message of the error of a fetch whose data the cache cannot read back. */
export const INCOMPLETE =
	"The cache cannot read the query's data after a fetch.";

/** The data as the entry stores it: through the cache policy, which may refuse it by throwing. */
export const toStored = (c: Ctx, e: Entry, data: unknown): unknown => {
	const cache = e.def.options.cache;
	return cache && data !== undefined
		? cache.write(c.riva, data, peek(c, e).data, e.vars)
		: data;
};

/** Writes a patch whose `data` is already stored, then releases the data it replaced. */
export function putStored(c: Ctx, e: Entry, patch: Partial<State>): void {
	const cache = e.def.options.cache;
	const prev = peek(c, e).data;
	put(c, e, patch);
	if (cache && 'data' in patch && prev !== undefined && prev !== patch.data)
		cache.release(c.riva, prev);
}

/**
 * Writes a patch that may carry new data, through the cache policy. A policy
 * that refuses the data leaves the old data and sets the error state; the
 * error is returned.
 */
export function putData(c: Ctx, e: Entry, patch: Partial<State>): unknown {
	if (!e.def.options.cache || !('data' in patch)) return void put(c, e, patch);
	let error: unknown;
	c.riva.batch(() => {
		try {
			putStored(c, e, { ...patch, data: toStored(c, e, patch.data) });
		} catch (x) {
			error = x;
			const { data: _, ...rest } = patch;
			put(c, e, { ...rest, status: 'error', error: x });
		}
	});
	return error;
}

/** Writes a patch over the current state (one notification). */
export const put = (c: Ctx, e: Entry, patch: Partial<State>): void =>
	c.riva.set(e.signal, { ...peek(c, e), ...patch });

/** Whether the entry must be fetched: not a success, invalidated, or older than `staleTime`. */
export const stale = (
	c: Ctx,
	e: Entry,
	staleTime: number = e.def.options.staleTime ?? c.riva.staleTime,
): boolean =>
	peek(c, e).status !== 'success' ||
	e.invalidated ||
	(e.def.options.live && !e.stop) ||
	c.sched.now() - peek(c, e).updatedAt >= staleTime ||
	unreadable(c, e);

/** Schedules the removal of an unobserved entry after `gcTime` (never on the server by default). */
export function armGc(c: Ctx, e: Entry): void {
	c.sched.clearTimeout(e.gc);
	e.gc = undefined;
	const ms = e.def.options.gcTime ?? (isBrowser() ? 300_000 : Infinity);
	if (e.observers || ms === Infinity) return;
	e.gc = c.sched.setTimeout(() => {
		e.gc = undefined;
		// A computed or listener still reading the signal keeps the entry alive.
		if (
			e.observers ||
			e.run ||
			nodeOf(c.riva.graph, e.signal).refs ||
			(nodeOf(c.riva.graph, e.lay).value as Lay[]).length
		)
			return armGc(c, e);
		if (c.entries.get(e.key) !== e) return;
		c.entries.delete(e.key);
		e.stop?.();
		const stored = peek(c, e).data;
		if (stored !== undefined) e.def.options.cache?.release(c.riva, stored);
	}, ms);
}

/** Shallow: the standard fields and whatever `derive` adds. */
const sameState = (a: State, b: State): boolean => {
	const k = Object.keys(a) as Array<keyof State>;
	return k.length === Object.keys(b).length && k.every((x) => a[x] === b[x]);
};

export function entryOf(c: Ctx, def: AnyQuery, vars: unknown): Entry {
	const { riva } = c;
	const key = stableKey(def.id, vars);
	let e = c.entries.get(key);
	if (e && e.def.options !== def.options) {
		// Another definition under this id (a wrapper such as infinite() shares
		// its query's options, so it is the same definition): refused on the server, taken over by
		// the newest in a browser (a hot-reloaded module).
		if (!isBrowser() || e.was === def.options)
			throw new RivaError(
				'RIVA_KEY',
				`Two definitions share the id "${def.id}": define each query once (a module-level const) and import it, or pass a distinct id.`,
			);
		// Drop what the old policy stored: the new one reads only its own data.
		const d = peek(c, e).data;
		if (d !== undefined) e.def.options.cache?.release(riva, d);
		e.was = e.def.options;
		e.def = def;
		put(c, e, IDLE);
	}
	if (!e) {
		const a = signal<State>(IDLE, { name: key });
		const lay = signal<Lay[]>([], { name: `${key}#layers` });
		const n: Entry = {
			key,
			def,
			vars,
			signal: a,
			lay,
			out: computed(
				(get) => {
					const s = get(a);
					const ls = get(lay);
					const { cache, derive } = n.def.options;
					if (!cache && !ls.length && !derive) return s;
					let data =
						cache && s.data !== undefined ? cache.read(riva, s.data) : s.data;
					for (const l of ls) data = l(data);
					const out = { ...s, data };
					return derive ? (derive(riva, out, vars) as State) : out;
				},
				{ equals: sameState, name: key },
			),
			observers: 0,
		};
		e = n;
		c.entries.set(key, e);
		c.seed?.(c, e);
		armGc(c, e);
	}
	return e;
}

export type { QueryState };
