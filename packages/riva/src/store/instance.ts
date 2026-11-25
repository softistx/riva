import type { Riva } from '../client';
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
 * The store on one riva, made on first use and kept in `riva.slots`: a
 * read-only view of its state and computeds, and its bound actions. It also
 * claims the store's name on the riva: a second store with that name is
 * refused on the server, and takes over in a browser (a hot-reloaded module).
 * A replaced definition is remembered (`was:<name>`): a component still holding
 * it resolves to the current instance and does not take the name back.
 */
export function instance(def: StoreDef, riva: Riva): Instance {
	const cached = riva.slots.get(def) as Instance | undefined;
	if (cached) return cached;
	const { name, sigs, members, actions } = def;
	const claim = `name:${name}`;
	const holder = riva.slots.get(claim) as StoreDef | undefined;
	const was = riva.slots.get(`was:${name}`) as Set<StoreDef> | undefined;
	if (holder !== undefined && was?.has(def)) return instance(holder, riva);
	if (holder !== undefined) {
		if (!isBrowser())
			refuse(
				`Store "${name}": two stores are named "${name}" on this riva: give each store a unique name.`,
			);
		riva.slots.delete(holder);
		riva.slots.set(`was:${name}`, (was ?? new Set()).add(holder));
		for (const sig of Object.values(holder.sigs))
			if (sig.name) riva.graph.named.delete(sig.name);
	}
	riva.slots.set(claim, def);
	// A hydrated value is not frozen when it is decoded: freeze it here (dev only).
	const seeds = riva.graph.seeds;
	if (seeds)
		for (const k in sigs) {
			const sig = sigs[k];
			if (sig?.name !== undefined && seeds.has(sig.name))
				riva.untracked(() => freeze(riva.get(sig)));
		}
	const bound: Record<string, (...args: unknown[]) => unknown> = {};
	for (const k in actions)
		bound[k] = (...args) => run(def, riva, actions[k] as never, args);
	const made: Instance = [
		view(
			members,
			(k) => riva.get(members[k] as Readable<unknown>),
			(k) =>
				refuse(
					`Store "${name}": "${k}" is read-only here; write it in an action.`,
				),
		),
		bound,
	];
	riva.slots.set(def, made);
	return made;
}
