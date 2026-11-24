import type { Atom, Listener } from './atom';
import type { RivaClient } from './client';
import type { Computed, Readable } from './computed';
import { RivaError } from './errors';
import { withClient } from './scope';

type Def = Atom<unknown> | Computed<unknown>;

/** The per-client node of a definition: its value and its links. */
export interface Node {
	def: Def;
	value: unknown;
	/** Bumped each time the value changes. */
	ver: number;
	/** The graph epoch this computed was last verified at. */
	stamp: number;
	/** Live observers plus listeners: links to sources exist only while > 0. */
	refs: number;
	observers: Set<Node>;
	/** Sources read by the last evaluation, with the version seen. */
	deps: Map<Node, number>;
	listeners: Set<Listener<unknown>>;
	seen: number;
	busy: boolean;
	init: boolean;
}

export interface Graph {
	client: RivaClient;
	nodes: WeakMap<Def, Node>;
	/** Bumped on every write: a computed verified at this epoch is fresh. */
	epoch: number;
	track: Map<Node, number> | undefined;
	depth: number;
	flushing: boolean;
	pending: Set<Node>;
}

export const createGraph = (client: RivaClient): Graph => ({
	client,
	nodes: new WeakMap(),
	epoch: 0,
	track: undefined,
	depth: 0,
	flushing: false,
	pending: new Set(),
});

export function nodeOf(g: Graph, def: Def): Node {
	let n = g.nodes.get(def);
	if (!n) {
		const isAtom = def.kind === 'atom';
		n = {
			def,
			value: isAtom ? def.initial : undefined,
			ver: 0,
			stamp: -1,
			refs: 0,
			observers: new Set(),
			deps: new Map(),
			listeners: new Set(),
			seen: 0,
			busy: false,
			init: isAtom,
		};
		g.nodes.set(def, n);
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
	if (--n.refs === 0)
		for (const d of n.deps.keys()) {
			d.observers.delete(n);
			release(d);
		}
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
		value = withClient(g.client, () =>
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
function refresh(g: Graph, n: Node): void {
	if (n.def.kind === 'atom' || n.stamp === g.epoch) return;
	if (n.busy)
		throw new RivaError(
			'RIVA_CYCLE',
			`Cycle detected: computed ${n.def.name ?? '(anonymous)'} reads itself.`,
		);
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
		n.stamp = g.epoch;
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

function collect(g: Graph, n: Node): void {
	if (n.listeners.size > 0) g.pending.add(n);
	for (const o of n.observers) collect(g, o);
}

function flush(g: Graph): void {
	if (g.depth > 0 || g.flushing) return;
	g.flushing = true;
	const errors: unknown[] = [];
	try {
		while (g.pending.size > 0) {
			const queue = [...g.pending];
			g.pending.clear();
			for (const n of queue) {
				try {
					refresh(g, n);
					if (n.ver === n.seen) continue;
					n.seen = n.ver;
					for (const l of [...n.listeners])
						try {
							l(n.value);
						} catch (e) {
							errors.push(e);
						}
				} catch (e) {
					errors.push(e);
				}
			}
		}
	} finally {
		g.flushing = false;
	}
	if (errors.length === 1) throw errors[0];
	if (errors.length > 1)
		throw new AggregateError(errors, 'Several listeners threw.');
}

export function write<T>(
	g: Graph,
	def: Atom<T>,
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
	flush(g);
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
	return () => {
		if (!n.listeners.delete(own)) return;
		release(n);
	};
}

export function batch<R>(g: Graph, fn: () => R): R {
	g.depth++;
	try {
		return fn();
	} finally {
		g.depth--;
		flush(g);
	}
}
