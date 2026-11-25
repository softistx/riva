import type { RivaClient } from '../client';
import type { Computed, Getter, ReadonlySignal } from '../computed';
import type { Mutation, RunOptions } from '../mutation';
import type { EnsureOptions, Query, VarsArgs } from '../query';

/** What an action, a computed or a component reads: the keys of `S`, read-only. */
export type View<S> = { readonly [K in keyof S]: S[K] };

/** The last argument every action gets: its client, and the engine bound to it. */
export interface StoreContext {
	readonly client: RivaClient;
	/** Fetches when missing or stale and awaits (`query.ensure(client, …)`). */
	fetch<Vars, Data>(
		// biome-ignore lint/suspicious/noExplicitAny: any state shape of a query
		query: Query<Vars, Data, any>,
		...args: VarsArgs<Vars, [opts?: EnsureOptions]>
	): Promise<Data>;
	/** Runs a mutation (`mutation.run(client, …)`). */
	mutate<Vars, Data>(
		mutation: Mutation<Vars, Data>,
		...args: VarsArgs<Vars, [opts?: RunOptions]>
	): Promise<Data>;
}

/** The arguments a caller passes: an action's own, without its trailing `StoreContext`. */
export type Args<P extends unknown[]> = P extends [...infer H, infer L]
	? [Exclude<L, undefined>] extends [StoreContext]
		? H
		: P
	: P;

/** The actions as callers see them: `(s, ...args, ctx)` becomes `(...args)`. */
export type Bound<A> = {
	// biome-ignore lint/suspicious/noExplicitAny: any action signature
	readonly [K in keyof A]: A[K] extends (s: any, ...a: infer P) => infer R
		? (...args: Args<P>) => R
		: never;
};

/** An action: `(s, ...args, ctx)`; annotate the trailing `ctx: StoreContext`. */
// biome-ignore lint/suspicious/noExplicitAny: any arguments, then a StoreContext
export type Action<S, C> = (s: S & Readonly<C>, ...args: any[]) => unknown;

export interface StoreOptions<S, C, A> {
	/** Required and unique per client: it prefixes each state key's signal name. */
	name: string;
	/** Every state key travels in an SSR snapshot. Default false. */
	ssr?: boolean;
	state: S;
	/** Derived values: `(s, get) => value`, `s` being the state only. */
	computed?: { [K in keyof C]: (s: View<S>, get: Getter) => C[K] };
	/** The only writers: `(s, ...args, { client, fetch, mutate })`. */
	actions?: A & Record<string, Action<S, C>>;
}

/** A domain store: stateless definitions, their values live per `RivaClient`. */
export type Store<N extends string, S, C, A> = {
	readonly kind: 'store';
	readonly name: N;
	/** Puts every state key back to its initial value (the ambient client, or the one given). */
	reset(client?: RivaClient): void;
	/** The store on one client: a read-only view of state and computeds, and the actions. */
	bind(client: RivaClient): readonly [View<S & C>, Bound<A>];
} & { readonly [K in keyof S]: ReadonlySignal<S[K]> } & {
	readonly [K in keyof C]: Computed<C[K]>;
} & Bound<A>;
