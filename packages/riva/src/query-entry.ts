import { type Atom, atom } from './atom';
import type { RivaClient } from './client';
import { computed, type Readable } from './computed';
import type { ClientEvents, Scheduler } from './env';
import { nodeOf } from './graph';
import { stableKey } from './key';
import type { Query, QueryState } from './query';
import { isBrowser } from './scope';

// biome-ignore lint/suspicious/noExplicitAny: entries of every definition share one map
export type AnyQuery = Query<any, any>;
export type State = QueryState<unknown>;

export interface Inflight {
	promise: Promise<unknown>;
	/** Replaced on a restart (invalidate while in flight); aborted and kept on a cancel. */
	ctl: AbortController;
	waiters: number;
	/** Started by a prefetch, a poll or a refetch: a caller abort never cancels it. */
	pinned: boolean;
	/** Set by `setData`: the waiters resolve with it instead of rejecting. */
	set: { v: unknown } | undefined;
	/** The state to restore on cancel. */
	prev: State;
}

/** An optimistic write: maps the value below it to the value readers see. */
export type Lay = (prev: unknown) => unknown;

export interface Entry {
	key: string;
	def: AnyQuery;
	vars: unknown;
	/** The graph atom holding the state: the one notification mechanism. */
	atom: Atom<State>;
	/** The optimistic layers over the atom's data, oldest first. */
	lay: Atom<Lay[]>;
	/** What readers see: the atom's data through the cache policy, under the layers. */
	out: Readable<State>;
	observers: number;
	invalidated: boolean;
	/** A refetch was started because the policy could not read the stored data. */
	missed: boolean;
	run: Inflight | undefined;
	gc: unknown;
	poll: unknown;
}

/** What one client's query cache shares between its files. */
export interface Ctx {
	client: RivaClient;
	sched: Scheduler;
	events: ClientEvents;
	entries: Map<string, Entry>;
	/** Observers over every entry, to attach the window events once. */
	observed: number;
	detach: (() => void) | undefined;
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
	nodeOf(c.client.graph, e.atom).value as State;

/** The state as readers see it (data read through the cache policy), untracked. */
export const view = (c: Ctx, e: Entry): State =>
	c.client.untracked(() => c.client.get(e.out));

/** The data without the entry's own layers, untracked. */
export const committed = (c: Ctx, e: Entry): unknown =>
	c.client.untracked(() => {
		const d = peek(c, e).data;
		const cache = e.def.options.cache;
		return cache && d !== undefined ? cache.read(c.client, d, true) : d;
	});

/** The data as the entry stores it: through the cache policy, which may refuse it by throwing. */
export const toStored = (c: Ctx, e: Entry, data: unknown): unknown => {
	const cache = e.def.options.cache;
	return cache && data !== undefined
		? cache.write(c.client, data, peek(c, e).data, e.vars)
		: data;
};

/** Writes a patch whose `data` is already stored, then releases the data it replaced. */
export function putStored(c: Ctx, e: Entry, patch: Partial<State>): void {
	const cache = e.def.options.cache;
	const prev = peek(c, e).data;
	put(c, e, patch);
	if (cache && 'data' in patch && prev !== undefined && prev !== patch.data)
		cache.release(c.client, prev);
}

/**
 * Writes a patch that may carry new data, through the cache policy. A policy
 * that refuses the data leaves the old data and sets the error state; the
 * error is returned.
 */
export function putData(c: Ctx, e: Entry, patch: Partial<State>): unknown {
	if (!e.def.options.cache || !('data' in patch)) return void put(c, e, patch);
	let error: unknown;
	c.client.batch(() => {
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
	c.client.set(e.atom, { ...peek(c, e), ...patch });

/** Whether the entry must be fetched: not a success, invalidated, or older than `staleTime`. */
export const stale = (
	c: Ctx,
	e: Entry,
	staleTime: number = e.def.options.staleTime,
): boolean =>
	peek(c, e).status !== 'success' ||
	e.invalidated ||
	c.sched.now() - peek(c, e).updatedAt >= staleTime;

/** Schedules the removal of an unobserved entry after `gcTime` (never on the server by default). */
export function armGc(c: Ctx, e: Entry): void {
	c.sched.clearTimeout(e.gc);
	e.gc = undefined;
	const ms = e.def.options.gcTime ?? (isBrowser() ? 300_000 : Infinity);
	if (e.observers || ms === Infinity) return;
	e.gc = c.sched.setTimeout(() => {
		e.gc = undefined;
		// A computed or listener still reading the atom keeps the entry alive.
		if (
			e.observers ||
			e.run ||
			nodeOf(c.client.graph, e.atom).refs ||
			(nodeOf(c.client.graph, e.lay).value as Lay[]).length
		)
			return armGc(c, e);
		if (c.entries.get(e.key) !== e) return;
		c.entries.delete(e.key);
		const stored = peek(c, e).data;
		if (stored !== undefined) e.def.options.cache?.release(c.client, stored);
	}, ms);
}

/** Shallow: the standard fields and whatever `derive` adds. */
const sameState = (a: State, b: State): boolean => {
	const k = Object.keys(a) as Array<keyof State>;
	return k.length === Object.keys(b).length && k.every((x) => a[x] === b[x]);
};

export function entryOf(c: Ctx, def: AnyQuery, vars: unknown): Entry {
	const { client } = c;
	const key = stableKey(def.id, vars);
	let e = c.entries.get(key);
	if (!e) {
		const a = atom<State>(IDLE, { name: key });
		const lay = atom<Lay[]>([], { name: `${key}#layers` });
		const { cache, derive } = def.options;
		e = {
			key,
			def,
			vars,
			atom: a,
			lay,
			out: computed(
				(get) => {
					const s = get(a);
					const ls = get(lay);
					if (!cache && !ls.length && !derive) return s;
					let data =
						cache && s.data !== undefined ? cache.read(client, s.data) : s.data;
					for (const l of ls) data = l(data);
					const out = { ...s, data };
					return derive ? (derive(client, out, vars) as State) : out;
				},
				{ equals: sameState, name: key },
			),
			observers: 0,
			invalidated: false,
			missed: false,
			run: undefined,
			gc: undefined,
			poll: undefined,
		};
		c.entries.set(key, e);
		armGc(c, e);
	}
	return e;
}

export type { QueryState };
