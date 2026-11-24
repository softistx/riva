import type { Atom, Listener, Unsubscribe } from './atom';
import { computed, type Readable } from './computed';
import * as graph from './graph';
import { withClient } from './scope';

// biome-ignore lint/suspicious/noConfusingVoidType: an effect may return nothing or a cleanup
export type EffectFn = () => void | (() => void);

/** Holds every value. One per request on the server, one in the browser. */
export class RivaClient {
	/** @internal */
	readonly graph: graph.Graph = graph.createGraph(this);

	get<T>(def: Readable<T>): T {
		return graph.read(this.graph, def);
	}

	set<T>(def: Atom<T>, value: NoInfer<T> | ((prev: T) => T)): void {
		graph.write(this.graph, def, value);
	}

	subscribe<T>(def: Readable<T>, listener: Listener<T>): Unsubscribe {
		return graph.subscribe(this.graph, def, listener);
	}

	/** Re-runs `fn` when what it read changes; the returned cleanup runs before each re-run and on dispose. */
	effect(fn: EffectFn): Unsubscribe {
		let cleanup: ReturnType<EffectFn>;
		const run = () => {
			const previous = cleanup;
			cleanup = undefined;
			if (previous) graph.untracked(this.graph, previous);
			cleanup = fn();
			return {};
		};
		const def = computed(run, { equals: () => false });
		this.get(def);
		const stop = this.subscribe(def, () => {});
		return () => {
			stop();
			const previous = cleanup;
			cleanup = undefined;
			if (previous) this.run(previous);
		};
	}

	/** Runs `fn` with this client as the ambient scope. */
	run<R>(fn: () => R): R {
		return withClient(this, fn);
	}

	/** Defers notifications until the outermost batch ends. */
	batch<R>(fn: () => R): R {
		return graph.batch(this.graph, fn);
	}

	untracked<R>(fn: () => R): R {
		return graph.untracked(this.graph, fn);
	}
}

export const createRivaClient = (): RivaClient => new RivaClient();
