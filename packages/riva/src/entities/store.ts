import type { RivaClient } from '../client';
import { nodeOf } from '../graph';
import { type Signal, signal } from '../signal';
import { fieldsOf } from './denormalize';
import { type Identify, makeIdentify } from './identity';
import { equal, refsIn } from './json';

export type Stored = Record<string, unknown>;

/** The options a store's identity rules came from, compared by reference. */
export interface Rules {
	keys: unknown;
	identify: unknown;
}

/** The entities of one client: one signal per entity, kept alive by roots. */
export class EntityStore {
	readonly signals = new Map<string, Signal<Stored | undefined>>();
	/** The stored data of every live query entry (anything with `refs`). */
	readonly roots = new Set<{ refs: string[] }>();
	/** Entities written by hand, kept until evicted. */
	readonly pins = new Set<string>();
	/** The last denormalized value of each entity that no cut cycle shaped. */
	readonly direct = new Map<string, unknown>();
	/** The same for direct reads of entities a cut shaped. */
	readonly directLocal = new Map<string, unknown>();
	/** The optimistic layers of mutations: field patches by entity, oldest first. */
	readonly ov = signal<Map<string, Stored>[]>([]);
	/** Set while a committed read runs: the layers are skipped. */
	skip = false;
	identify: Identify = makeIdentify();
	/** Set by the first policy that uses the store. */
	rules: Rules | undefined;

	constructor(readonly client: RivaClient) {}

	/** The signal of an entity (created empty when missing, so a tracked read of it is notified). */
	signalOf(ref: string): Signal<Stored | undefined> {
		let a = this.signals.get(ref);
		if (!a) {
			a = signal<Stored | undefined>(undefined, { name: ref });
			this.signals.set(ref, a);
		}
		return a;
	}

	/** The stored fields, untracked; creates nothing. */
	peek(ref: string): Stored | undefined {
		const a = this.signals.get(ref);
		return a && this.client.untracked(() => this.client.get(a));
	}

	/** The fields as a reader sees them: tracked, the optimistic layers over them. */
	fields(ref: string): Stored | undefined {
		return fieldsOf(this, ref);
	}

	/** Whether any entity holds fields. */
	get empty(): boolean {
		for (const ref of this.signals.keys()) if (this.peek(ref)) return false;
		return true;
	}

	/** Empties an entity; its signal stays while observed, so readers are notified. */
	clear(ref: string): boolean {
		const had = this.peek(ref) !== undefined;
		this.direct.delete(ref);
		this.directLocal.delete(ref);
		const a = this.signals.get(ref);
		if (!a) return false;
		if (had) this.client.set(a, undefined);
		if (nodeOf(this.client.graph, a).refs === 0) this.signals.delete(ref);
		return had;
	}

	/** Merges fields into an entity: only a changed field changes the signal. */
	merge(ref: string, fields: Stored): void {
		const prev = this.peek(ref);
		const changed: Stored = {};
		let any = !prev;
		for (const k in fields) {
			if (prev && Object.hasOwn(prev, k) && equal(prev[k], fields[k])) continue;
			changed[k] = fields[k];
			any = true;
		}
		if (any) this.client.set(this.signalOf(ref), { ...prev, ...changed });
	}

	/** Removes every entity no live root or pin reaches (cycles included). */
	sweep(): void {
		const live = new Set<string>();
		const todo = [...this.pins];
		for (const root of this.roots) todo.push(...root.refs);
		for (let r = todo.pop(); r !== undefined; r = todo.pop()) {
			if (live.has(r)) continue;
			live.add(r);
			const fields = this.peek(r);
			for (const k in fields) todo.push(...refsIn(fields[k]));
		}
		this.client.batch(() => {
			for (const ref of [...this.signals.keys()])
				if (!live.has(ref)) this.clear(ref);
		});
	}
}
