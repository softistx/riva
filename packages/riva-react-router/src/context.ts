import { type Riva, RivaScopeError } from '@softistx/riva';
import { dehydrate, type Snapshot } from '@softistx/riva/ssr';
import { createContext, type RouterContextProvider } from 'react-router';

/** What the helpers need of a React Router context: its `get`. */
export type ContextLike = Pick<Readonly<RouterContextProvider>, 'get'>;

/** Holds the request's `Riva`; `rivaMiddleware` (from `/server`) sets it. */
export const rivaContext = createContext<Riva | null>(null);

/**
 * Types `rivaOf` by your app's riva: augment it once, with the type of what
 * your `createRiva` returns.
 *
 * ```ts
 * declare module '@softistx/riva-react-router' {
 *   interface Register { riva: AppRiva }
 * }
 * ```
 *
 * Without it `rivaOf` returns the base `Riva`.
 */
// biome-ignore lint/suspicious/noEmptyInterface: filled by module augmentation
export interface Register {}

/** The riva a register declares, or the base `Riva`. */
export type RivaFrom<R> = R extends { riva: infer T extends Riva } ? T : Riva;

/** What `rivaOf` returns: the `riva` of `Register`, else `Riva`. */
export type RegisteredRiva = RivaFrom<Register>;

/** The request's `Riva` (typed by `Register`); throws a `RivaScopeError` when `rivaMiddleware` did not run. */
export function rivaOf(context: ContextLike): RegisteredRiva {
	const riva = context.get(rivaContext);
	if (!riva)
		throw new RivaScopeError(
			"No Riva in this request: add rivaMiddleware() from @softistx/riva-react-router/server to the root route's middleware.",
		);
	return riva as RegisteredRiva;
}

/** What a request riva already sent: entry key to fingerprint, signal name to encoded value. */
interface Emitted {
	readonly q: Map<string, string>;
	readonly a: Map<string, string>;
}

/** The key of the per-request record, on the riva's slots: it dies with the request's riva. */
const EMITTED = {};

/**
 * The loader payload: the request riva's settled entries, under the `~riva`
 * key the provider reads. The first call of a request holds everything; a
 * later call holds only what was not sent yet or changed since, so every
 * loader may return it.
 */
export function riva(context: ContextLike): { readonly '~riva': Snapshot } {
	const r = rivaOf(context);
	const snap = dehydrate(r) as unknown as {
		v: 1;
		t: number;
		q: Snapshot['q'][number][];
		a: Record<string, unknown>;
	};
	const sent = r.slots.get(EMITTED) as Emitted | undefined;
	const seen: Emitted = sent ?? { q: new Map(), a: new Map() };
	r.slots.set(EMITTED, seen);
	const q = snap.q.filter((e) => {
		// A commit of new data within the same ms as the previous one is not re-sent.
		const print = `${snap.t - e.u}|${e.s}|${e.i ?? 0}`;
		if (seen.q.get(e.k) === print) return false;
		seen.q.set(e.k, print);
		return true;
	});
	const a: Record<string, unknown> = {};
	for (const name in snap.a) {
		// A commit of new data within the same ms as the previous one is not re-sent.
		const print = JSON.stringify(snap.a[name]);
		if (seen.a.get(name) === print) continue;
		seen.a.set(name, print);
		a[name] = snap.a[name];
	}
	return { '~riva': { v: 1, t: snap.t, q, a } as unknown as Snapshot };
}
