import type { Riva } from './client';
import type { Computed, Readable } from './computed';
import { RivaError } from './errors';
import { collect, flush } from './flush';
import { withRiva } from './scope';
import type { Listener, Signal } from './signal';

type Def = Signal<unknown> | Computed<unknown>;

/** The per-riva node of a definition: its value and its links. */
export interface Node {
	def: Def;
	value: unknown;
	/** Bumped each time the value changes. */
	ver: number;
	/** The graph epoch this computed was last verified at. */
	stamp?: number;
	/** Live observers plus listeners: links to sources exist only while > 0. */
	refs: number;
	observers: Set<Node>;
	/** Sources read by the last evaluation, with the version seen. */
	deps: Map<Node, number>;
	listeners: Set<Listener<unknown>>;
	seen?: number;
	busy?: boolean;
	/** Called when refs drop to 0: a subpath stops work it started for this node. @internal */
	idle?: () => void;
	init: boolean;
}

export interface Graph {
	riva: Riva;
	nodes: WeakMap<Def, Node>;
	/** Bumped on every write: a computed verified at this epoch is fresh. */
	epoch: number;
	track?: Map<Node, number> | undefined;
	depth: number;
	flushing?: boolean;
	pending: Set<Node>;
	/** The signals that travel in an SSR snapshot, by name; null once a name is taken twice. @internal */
	named: Map<string, Node | null>;
	/** Values of hydrated signals not created yet, by name. @internal */
	seeds?: Map<string, unknown>;
}

export const createGraph = (riva: Riva): Graph => ({
	riva,
	nodes: new WeakMap(),
	epoch: 0,
	depth: 0,
	pending: new Set(),
	named: new Map(),
});

/** A signal's first value: what a snapshot seeded for its name, else its initial. */
function initialOf(g: Graph, def: Signal<unknown>): unknown {
	const { name } = def;
	return def.ssr && name !== undefined && g.seeds?.has(name)
		? g.seeds.get(name)
		: def.initial;
}

export function nodeOf(g: Graph, def: Def): Node {
	let n = g.nodes.get(def);
	if (!n) {
		const isSignal = def.kind === 'signal';
		n = {
			def,
			value: isSignal && initialOf(g, def),
			ver: 0,
			refs: 0,
			observers: new Set(),
			deps: new Map(),
			listeners: new Set(),
			init: isSignal,
		};
		g.nodes.set(def, n);
		if (isSignal && def.ssr && def.name !== undefined)
			g.named.set(def.name, g.named.has(def.name) ? null : n);
	}
	return n;
}

function retain(n: Node): void {
	if (n.refs++ === 0)
		for (const d of n.deps.keys()) {
			d.observers.add(n);
			retain(d);
		}
}

function release(n: Node): void {
	if (--n.refs) return;
	for (const d of n.deps.keys()) {
		d.observers.delete(n);
		release(d);
	}
	n.idle?.();
}

export function untracked<R>(g: Graph, fn: () => R): R {
	const previous = g.track;
	g.track = undefined;
	try {
		return fn();
	} finally {
		g.track = previous;
	}
}

function recompute(g: Graph, n: Node): void {
	const def = n.def as Computed<unknown>;
	const next = new Map<Node, number>();
	const previous = g.track;
	g.track = next;
	let value: unknown;
	try {
		value = withRiva(g.riva, () =>
			def.fn((d) => read(g, d as Readable<never>)),
		);
	} finally {
		g.track = previous;
	}
	if (n.refs > 0) {
		for (const d of next.keys())
			if (!n.deps.has(d)) {
				d.observers.add(n);
				retain(d);
			}
		for (const d of n.deps.keys())
			if (!next.has(d)) {
				d.observers.delete(n);
				release(d);
			}
	}
	n.deps = next;
	if (!n.init || !def.equals(n.value, value)) {
		n.value = value;
		n.ver++;
		n.init = true;
	}
}

/** Brings a computed up to date, re-evaluating only when a source changed. */
export function refresh(g: Graph, n: Node): void {
	if (n.def.kind === 'signal' || n.stamp === g.epoch) return;
	if (n.busy)
		throw new RivaError(
			'RIVA_CYCLE',
			`Cycle detected: computed ${n.def.name ?? '(anonymous)'} reads itself.`,
		);
	const epoch = g.epoch;
	n.busy = true;
	try {
		let stale = !n.init;
		if (!stale)
			for (const [d, v] of n.deps) {
				refresh(g, d);
				if (d.ver !== v) {
					stale = true;
					break;
				}
			}
		if (stale) recompute(g, n);
		// The epoch from before the run: a write the node made itself is rechecked.
		n.stamp = epoch;
	} finally {
		n.busy = false;
	}
}

export function read<T>(g: Graph, def: Readable<T>): T {
	const n = nodeOf(g, def as Def);
	refresh(g, n);
	g.track?.set(n, n.ver);
	return n.value as T;
}

export function write<T>(
	g: Graph,
	def: Signal<T>,
	value: T | ((prev: T) => T),
): void {
	const n = nodeOf(g, def as Def);
	const next =
		typeof value === 'function'
			? (value as (prev: T) => T)(n.value as T)
			: value;
	if (def.equals(n.value as T, next)) return;
	n.value = next;
	n.ver++;
	g.epoch++;
	collect(g, n);
	flush(g, refresh);
}

export function subscribe<T>(
	g: Graph,
	def: Readable<T>,
	listener: Listener<T>,
): () => void {
	const n = nodeOf(g, def as Def);
	if (n.listeners.size === 0) refresh(g, n);
	if (n.listeners.size === 0) n.seen = n.ver;
	const entry = listener as Listener<unknown>;
	const own: Listener<unknown> = (v) => entry(v);
	n.listeners.add(own);
	retain(n);
	const off = () => {
		if (!n.listeners.delete(own)) return;
		release(n);
	};
	// A node that wrote its own source while evaluating is not fresh yet.
	if (n.def.kind === 'computed' && n.stamp !== g.epoch) {
		g.pending.add(n);
		try {
			flush(g, refresh);
		} catch (e) {
			off();
			throw e;
		}
	}
	return off;
}

export function batch<R>(g: Graph, fn: () => R): R {
	g.depth++;
	let result: R;
	try {
		result = fn();
	} catch (e) {
		g.depth--;
		try {
			flush(g, refresh);
		} catch (flushError) {
			if (Object.isExtensible(e) && !('cause' in (e as object)))
				Object.defineProperty(e, 'cause', {
					value: flushError,
					configurable: true,
					writable: true,
				});
		}
		throw e;
	}
	g.depth--;
	flush(g, refresh);
	return result;
}
