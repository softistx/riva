import type { RivaClient } from '../client';
import { type Signal, signal } from '../signal';
import type { Dir } from './refetch';

export type Flags = readonly [next: boolean, previous: boolean];

/** What one client holds for a feed: its fetches in flight, by direction and entry. */
export interface Slot {
	runs: Map<string, Promise<void>>;
	ctls: Map<string, AbortController>;
}

export const NONE: Flags = [false, false];

/**
 * The per-client state of one feed definition. The fetching flags live in one
 * signal holding only the entries fetching now, so nothing outlives a fetch.
 */
export function createSlots() {
	const flags: Signal<Readonly<Record<string, Flags>>> = signal({});
	const slots = new WeakMap<RivaClient, Slot>();
	return {
		flags,
		slot(client: RivaClient): Slot {
			const s = slots.get(client) ?? { runs: new Map(), ctls: new Map() };
			slots.set(client, s);
			return s;
		},
		/** Sets one direction's flag of an entry; the entry is dropped once both are false. */
		setFlag(client: RivaClient, key: string, dir: Dir, on: boolean): void {
			client.set(flags, (all) => {
				const [n, p] = all[key] ?? NONE;
				const next: Flags = dir === 'next' ? [on, p] : [n, on];
				if (next[0] === n && next[1] === p) return all;
				const { [key]: _, ...rest } = all;
				return next[0] || next[1] ? { ...rest, [key]: next } : rest;
			});
		},
	};
}

export type Slots = ReturnType<typeof createSlots>;
