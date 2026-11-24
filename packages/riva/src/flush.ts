import { RivaError } from './errors';
import type { Graph, Node } from './graph';
import { withClient } from './scope';

const MAX_RUNS = 100;

/** Queues every node with listeners reachable from `n`: each node once, no recursion. */
export function collect(g: Graph, n: Node): void {
	const seen = new Set([n]);
	const stack = [n];
	for (let x = stack.pop(); x; x = stack.pop()) {
		if (x.listeners.size > 0) g.pending.add(x);
		for (const o of x.observers)
			if (!seen.has(o)) {
				seen.add(o);
				stack.push(o);
			}
	}
}

/**
 * Notifies the queued nodes' listeners, each in its own client. Every
 * notification runs; errors are collected and rethrown after (one as is,
 * several as an AggregateError). A node re-running over 100 times in one
 * flush is a loop.
 */
export function flush(g: Graph, refresh: (g: Graph, n: Node) => void): void {
	if (g.depth > 0 || g.flushing) return;
	g.flushing = true;
	const errors: unknown[] = [];
	const runs = new Map<Node, number>();
	try {
		while (g.pending.size > 0) {
			const queue = [...g.pending];
			g.pending.clear();
			for (const n of queue) {
				const count = (runs.get(n) ?? 0) + 1;
				runs.set(n, count);
				if (count > MAX_RUNS) {
					errors.push(
						new RivaError(
							'RIVA_LOOP',
							`Loop detected: ${n.def.name ?? 'a node'} re-ran more than ${MAX_RUNS} times in one flush.`,
						),
					);
					continue;
				}
				try {
					refresh(g, n);
					// It wrote a source of its own while running: check it again.
					if (n.def.kind === 'computed' && n.stamp !== g.epoch)
						g.pending.add(n);
					if (n.ver === n.seen) continue;
					n.seen = n.ver;
					for (const l of [...n.listeners])
						try {
							withClient(g.client, () => l(n.value));
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
