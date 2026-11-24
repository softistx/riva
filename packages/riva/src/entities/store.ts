import { type Atom, atom } from '../atom';
import type { RivaClient } from '../client';
import { nodeOf } from '../graph';
import type { Identify } from './identity';
import { equal, refsIn } from './json';

export type Stored = Record<string, unknown>;

/** The entities of one client: one atom per entity, with reference counts. */
export class EntityStore {
	readonly atoms = new Map<string, Atom<Stored | undefined>>();
	/** What holds each entity: query roots and fields of other entities. */
	readonly counts = new Map<string, number>();
	/** The last denormalized value of each entity, to keep identities. */
	readonly last = new Map<string, unknown>();

	constructor(
		readonly client: RivaClient,
		readonly identify: Identify,
	) {}

	/** The atom of an entity (created empty when missing, so a read of it is tracked). */
	atomOf(ref: string): Atom<Stored | undefined> {
		let a = this.atoms.get(ref);
		if (!a) {
			a = atom<Stored | undefined>(undefined, { name: ref });
			this.atoms.set(ref, a);
		}
		return a;
	}

	/** The stored fields, untracked. */
	peek(ref: string): Stored | undefined {
		const a = this.atoms.get(ref);
		return a && this.client.untracked(() => this.client.get(a));
	}

	retain(ref: string): void {
		this.counts.set(ref, (this.counts.get(ref) ?? 0) + 1);
	}

	/** Drops one hold; an entity nobody holds is removed, and what it held is released. */
	release(ref: string): void {
		const n = (this.counts.get(ref) ?? 0) - 1;
		if (n > 0) return void this.counts.set(ref, n);
		this.counts.delete(ref);
		this.clear(ref);
		const a = this.atoms.get(ref);
		if (a && nodeOf(this.client.graph, a).refs === 0) this.atoms.delete(ref);
	}

	/** Empties an entity (its atom stays, so readers are notified) and releases its refs. */
	clear(ref: string): boolean {
		const fields = this.peek(ref);
		this.last.delete(ref);
		if (!fields) return false;
		this.client.batch(() => {
			this.client.set(this.atomOf(ref), undefined);
			for (const k in fields)
				for (const r of refsIn(fields[k])) this.release(r);
		});
		return true;
	}

	/** Merges fields into an entity: only a changed field changes the atom. */
	merge(ref: string, fields: Stored): void {
		const prev = this.peek(ref);
		const changed: Stored = {};
		let any = !prev;
		for (const k in fields) {
			if (prev && Object.hasOwn(prev, k) && equal(prev[k], fields[k])) continue;
			changed[k] = fields[k];
			any = true;
		}
		if (!any) return;
		for (const k in changed) for (const r of refsIn(changed[k])) this.retain(r);
		this.client.set(this.atomOf(ref), { ...prev, ...changed });
		if (prev)
			for (const k in changed)
				if (Object.hasOwn(prev, k))
					for (const r of refsIn(prev[k])) this.release(r);
	}
}
