import type { Riva } from '../client';
import type { Readable } from '../computed';
import type { Signal } from '../signal';
import { freeze, put, type StoreDef } from './def';
import type { Action, StoreContext } from './types';
import { refuse, view } from './view';

/** What `run` and the writer of `s` share while an action runs. */
interface Phase {
	live: boolean;
	sync: boolean;
	held: boolean;
	failure: { error: unknown } | undefined;
}

/** The `s` of one run: writes state through the guard, holds the notifications past an `await`. */
function writer(def: StoreDef, riva: Riva, st: Phase, release: () => void) {
	const { name, sigs, members } = def;
	return view(
		members,
		(k) => riva.get(members[k] as Readable<unknown>),
		(k, v) => {
			if (!st.live)
				refuse(`Store "${name}": "${k}" is written after its action settled.`);
			if (!Object.hasOwn(sigs, k))
				refuse(
					`Store "${name}": "${k}" is not a state key, so it cannot be written.`,
				);
			// Past an `await`, the writes of one segment make one notification.
			if (!st.sync && !st.held) {
				st.held = true;
				riva.graph.depth++;
				queueMicrotask(release);
			}
			put(riva, sigs[k] as Signal<unknown>, freeze(v));
		},
	);
}

/**
 * Runs one action on a riva: `(s, ...args, ctx)` inside the riva's scope,
 * one batch, untracked. `s` writes state until the action settles, then is
 * revoked (reads keep working). After an `await`, the writes of one
 * synchronous segment make one notification, flushed in a microtask; a
 * listener error from that flush rejects the action's promise.
 */
export function run(
	def: StoreDef,
	riva: Riva,
	// biome-ignore lint/suspicious/noExplicitAny: any state and computed shape
	fn: Action<any, any>,
	args: unknown[],
): unknown {
	const st: Phase = { live: true, sync: true, held: false, failure: undefined };
	const g = riva.graph;
	const release = () => {
		if (!st.held) return;
		st.held = false;
		g.depth--;
		try {
			riva.batch(() => {});
		} catch (error) {
			st.failure ??= { error };
		}
	};
	const s = writer(def, riva, st, release);
	const ctx: StoreContext = {
		riva,
		fetch: (q, ...a) => (q.ensure as (...x: unknown[]) => never)(riva, ...a),
		mutate: (m, ...a) => (m.mutate as (...x: unknown[]) => never)(riva, ...a),
	};
	// The context goes after the declared arguments: defaults before it shift it.
	const given = args.slice();
	given.length = Math.max(args.length, fn.length - 2);
	const settle = () => {
		release();
		st.live = false;
	};
	let result: unknown;
	try {
		result = riva.run(() =>
			riva.batch(() => riva.untracked(() => fn(s, ...given, ctx))),
		);
	} catch (e) {
		settle();
		throw e;
	} finally {
		st.sync = false;
	}
	if (!(result as PromiseLike<unknown> | undefined)?.then) {
		settle();
		return result;
	}
	return (result as Promise<unknown>).then(
		(v) => {
			settle();
			if (st.failure) throw st.failure.error;
			return v;
		},
		(e) => {
			settle();
			throw e;
		},
	);
}
