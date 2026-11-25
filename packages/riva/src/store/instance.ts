import type { RivaClient } from '../client';
import type { Readable } from '../computed';
import { isBrowser } from '../scope';
import { freeze, type StoreDef } from './def';
import { run } from './run';
import { refuse, view } from './view';

export type Instance = readonly [
	Record<string, unknown>,
	Record<string, (...args: unknown[]) => unknown>,
];

/**
 * The store on one client, made on first use and kept in `client.slots`: a
 * read-only view of its state and computeds, and its bound actions. It also
 * claims the store's name on the client: a second store with that name is
 * refused on the server, and takes over in a browser (a hot-reloaded module).
 * A replaced definition is remembered (`was:<name>`): a component still holding
 * it resolves to the current instance and does not take the name back.
 */
export function instance(def: StoreDef, client: RivaClient): Instance {
	const cached = client.slots.get(def) as Instance | undefined;
	if (cached) return cached;
	const { name, sigs, members, actions } = def;
	const claim = `name:${name}`;
	const holder = client.slots.get(claim) as StoreDef | undefined;
	const was = client.slots.get(`was:${name}`) as Set<StoreDef> | undefined;
	if (holder !== undefined && was?.has(def)) return instance(holder, client);
	if (holder !== undefined) {
		if (!isBrowser())
			refuse(
				`Store "${name}": two stores are named "${name}" on this client: give each store a unique name.`,
			);
		client.slots.delete(holder);
		client.slots.set(`was:${name}`, (was ?? new Set()).add(holder));
		for (const sig of Object.values(holder.sigs))
			if (sig.name) client.graph.named.delete(sig.name);
	}
	client.slots.set(claim, def);
	// A hydrated value is not frozen when it is decoded: freeze it here (dev only).
	const seeds = client.graph.seeds;
	if (seeds)
		for (const k in sigs) {
			const sig = sigs[k];
			if (sig?.name !== undefined && seeds.has(sig.name))
				client.untracked(() => freeze(client.get(sig)));
		}
	const bound: Record<string, (...args: unknown[]) => unknown> = {};
	for (const k in actions)
		bound[k] = (...args) => run(def, client, actions[k] as never, args);
	const made: Instance = [
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
	client.slots.set(def, made);
	return made;
}
