import { type Atom, atom } from './atom';
import type { RivaClient } from './client';
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
	/** The state to restore on cancel. */
	prev: State;
}

export interface Entry {
	key: string;
	def: AnyQuery;
	vars: unknown;
	/** The graph atom holding the state: the one notification mechanism. */
	atom: Atom<State>;
	observers: number;
	invalidated: boolean;
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

/** Writes a patch over the current state (one notification). */
export const put = (c: Ctx, e: Entry, patch: Partial<State>): void =>
	c.client.set(e.atom, { ...peek(c, e), ...patch });

/** Whether the entry must be fetched: not a success, invalidated, or older than `staleTime`. */
export const stale = (c: Ctx, e: Entry): boolean =>
	peek(c, e).status !== 'success' ||
	e.invalidated ||
	c.sched.now() - peek(c, e).updatedAt >= e.def.options.staleTime;

/** Schedules the removal of an unobserved entry after `gcTime` (never on the server by default). */
export function armGc(c: Ctx, e: Entry): void {
	c.sched.clearTimeout(e.gc);
	e.gc = undefined;
	const ms = e.def.options.gcTime ?? (isBrowser() ? 300_000 : Infinity);
	if (e.observers || ms === Infinity) return;
	e.gc = c.sched.setTimeout(() => {
		e.gc = undefined;
		// A computed or listener still reading the atom keeps the entry alive.
		if (e.observers || e.run || nodeOf(c.client.graph, e.atom).refs)
			return armGc(c, e);
		if (c.entries.get(e.key) === e) c.entries.delete(e.key);
	}, ms);
}

export function entryOf(c: Ctx, def: AnyQuery, vars: unknown): Entry {
	const key = stableKey(def.id, vars);
	let e = c.entries.get(key);
	if (!e) {
		e = {
			key,
			def,
			vars,
			atom: atom<State>(IDLE, { name: key }),
			observers: 0,
			invalidated: false,
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
