import type { RivaClient } from '../client';
import { computed, type Getter, type Readable } from '../computed';
import { resolve } from '../scope';
import { type Signal, signal } from '../signal';
import type { Action, Store, StoreContext, StoreOptions } from './types';
import { refuse, view } from './view';

const RESERVED = ['kind', 'name', 'reset', 'bind'];
const dev =
	typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

/** Dev only: a stored value cannot be mutated in place, so a nested write throws. */
const freeze = <T>(v: T): T => {
	if (dev && v && typeof v === 'object' && !Object.isFrozen(v)) {
		Object.freeze(v);
		for (const x of Object.values(v)) freeze(x);
	}
	return v;
};

// Raised for the length of one synchronous write made through an action's `s`
// or `reset`: the state signals' `equals` refuses every other write.
let writing = 0;

const put = (
	client: RivaClient,
	sig: Signal<unknown>,
	value: unknown,
): void => {
	writing++;
	try {
		client.set(sig, () => value);
	} finally {
		writing--;
	}
};

type Instance = readonly [
	Record<string, unknown>,
	Record<string, (...args: unknown[]) => unknown>,
];

/**
 * A domain store: its state, computeds and actions in one definition. Every
 * state key is a signal named `<name>.<key>` and every computed a riva
 * computed, both read as definitions; only actions write.
 */
export function store<
	const N extends string,
	S extends Record<string, unknown>,
	C = Record<never, never>,
	A = Record<never, never>,
>(options: StoreOptions<S, C, A> & { name: N }): Store<N, S, C, A> {
	const { name, ssr = false } = options;
	const state = options.state as Record<string, unknown>;
	const derived = (options.computed ?? {}) as Record<
		string,
		(s: unknown, get: Getter) => unknown
	>;
	const actions = (options.actions ?? {}) as Record<string, Action<S, C>>;
	const seen = new Set(RESERVED);
	for (const k of [
		...Object.keys(state),
		...Object.keys(derived),
		...Object.keys(actions),
	]) {
		if (seen.has(k))
			refuse(
				`Store "${name}": the key "${k}" is taken (a state, computed or action key, or one of ${RESERVED.join(', ')}).`,
			);
		seen.add(k);
	}

	const sigs: Record<string, Signal<unknown>> = {};
	for (const k in state)
		sigs[k] = signal(freeze(state[k]), {
			name: `${name}.${k}`,
			ssr,
			equals: (a, b) =>
				writing > 0
					? Object.is(a, b)
					: refuse(
							`Store "${name}": "${k}" is written outside an action. Write it in an action of the store.`,
						),
		});
	const comps: Record<string, Readable<unknown>> = {};
	for (const k in derived)
		comps[k] = computed(
			(get) =>
				derived[k]?.(
					view(
						state,
						(key) => get(sigs[key] as Signal<unknown>),
						(key) =>
							refuse(`Store "${name}": a computed cannot write "${key}".`),
					),
					get,
				),
			{ name: `${name}.${k}` },
		);
	const members = { ...sigs, ...comps };

	const run = (
		client: RivaClient,
		fn: Action<S, C>,
		args: unknown[],
	): unknown => {
		const g = client.graph;
		let live = true;
		let sync = true;
		let held = false;
		const s = view(
			members,
			(k) => client.get(members[k] as Readable<unknown>),
			(k, v) => {
				if (!live)
					refuse(
						`Store "${name}": "${k}" is written after its action settled.`,
					);
				if (!Object.hasOwn(sigs, k))
					refuse(
						`Store "${name}": "${k}" is not a state key, so it cannot be written.`,
					);
				// Past an `await`, the writes of one segment make one notification.
				if (!sync && !held) {
					held = true;
					g.depth++;
					queueMicrotask(() => {
						held = false;
						g.depth--;
						client.batch(() => {});
					});
				}
				put(client, sigs[k] as Signal<unknown>, freeze(v));
			},
		);
		const ctx: StoreContext = {
			client,
			fetch: (q, ...a) =>
				(q.ensure as (...x: unknown[]) => never)(client, ...a),
			mutate: (m, ...a) => (m.run as (...x: unknown[]) => never)(client, ...a),
		};
		// The context goes after the declared arguments: defaults before it shift it.
		const given = args.slice();
		given.length = Math.max(args.length, fn.length - 2);
		const settle = () => {
			live = false;
		};
		let result: unknown;
		try {
			result = client.run(() =>
				client.batch(() =>
					client.untracked(() => fn(s as S & Readonly<C>, ...given, ctx)),
				),
			);
		} catch (e) {
			settle();
			throw e;
		} finally {
			sync = false;
		}
		if (!(result as PromiseLike<unknown> | undefined)?.then) {
			settle();
			return result;
		}
		return (result as Promise<unknown>).then(
			(v) => {
				settle();
				return v;
			},
			(e) => {
				settle();
				throw e;
			},
		);
	};

	const claimed = `name:${name}`;
	const instance = (client: RivaClient): Instance => {
		let i = client.slots.get(def) as Instance | undefined;
		if (!i) {
			if (client.slots.get(claimed) !== undefined)
				refuse(
					`Two stores are named "${name}" on this client: give each store a unique name.`,
				);
			client.slots.set(claimed, def);
			const bound: Record<string, (...args: unknown[]) => unknown> = {};
			for (const k in actions)
				bound[k] = (...args) => run(client, actions[k] as Action<S, C>, args);
			i = [
				view(
					members,
					(k) => client.get(members[k] as Readable<unknown>),
					(k) =>
						refuse(
							`Store "${name}": "${k}" is read-only here; write it in an action.`,
						),
				),
				bound,
			];
			client.slots.set(def, i);
		}
		return i;
	};

	const ambient: Record<string, (...args: unknown[]) => unknown> = {};
	for (const k in actions)
		ambient[k] = (...args) =>
			(instance(resolve())[1][k] as (...a: unknown[]) => unknown)(...args);

	const def = Object.freeze({
		kind: 'store',
		name,
		reset: (client: RivaClient = resolve()) => {
			instance(client);
			client.batch(() => {
				for (const k in sigs) {
					const sig = sigs[k] as Signal<unknown>;
					put(client, sig, sig.initial);
				}
			});
		},
		bind: instance,
		...ambient,
		...members,
	}) as unknown as Store<N, S, C, A>;
	return def;
}
