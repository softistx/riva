import { expect, test } from 'bun:test';
import { createRiva } from '../client';
import { computed } from '../computed';
import { denormalize } from './denormalize';
import { EntityStore } from './store';

const dn = (s: EntityStore, v: unknown, memo = new Map<string, unknown>()) =>
	denormalize(s, v, memo);

const make = () => {
	const riva = createRiva();
	return { riva, store: new EntityStore(riva) };
};

test('resolves refs, nested, in arrays and in plain objects', () => {
	const { store } = make();
	store.merge('A:1', { n: 1, b: { __ref: 'B:1' } });
	store.merge('B:1', { n: 2 });
	expect(
		dn(store, {
			list: [{ __ref: 'A:1' }],
			meta: { first: { __ref: 'B:1' } },
		}),
	).toEqual({ list: [{ n: 1, b: { n: 2 } }], meta: { first: { n: 2 } } });
});

test('a missing entity is undefined, never an error; the field is omitted', () => {
	const { store } = make();
	store.merge('A:1', { n: 1, gone: { __ref: 'B:9' } });
	expect(dn(store, { __ref: 'A:1' })).toEqual({ n: 1 });
	expect(dn(store, { __ref: 'X:1' })).toBeUndefined();
	expect(dn(store, [{ __ref: 'X:1' }])).toEqual([undefined]);
});

test('a reference cycle is cut where it loops back', () => {
	const { store } = make();
	store.merge('A:1', { n: 1, b: { __ref: 'B:1' } });
	store.merge('B:1', { n: 2, a: { __ref: 'A:1' } });
	expect(dn(store, { __ref: 'A:1' })).toEqual({ n: 1, b: { n: 2 } });
});

test('unchanged entities keep their identity when another one changes', () => {
	const { riva, store } = make();
	store.merge('A:1', { tags: ['x'] });
	store.merge('A:2', { tags: ['y'] });
	const memo = new Map<string, unknown>();
	const roots = { list: [{ __ref: 'A:1' }, { __ref: 'A:2' }] };
	const read = computed(
		() => dn(store, roots, memo) as { list: { tags: string[] }[] },
	);
	const first = riva.get(read);
	store.merge('A:2', { tags: ['z'] });
	const second = riva.get(read);
	expect(second).not.toBe(first);
	expect(second.list[0]).toBe(first.list[0]);
	expect(second.list[1]?.tags).toEqual(['z']);
});

test('the read is tracked: only a reached entity re-evaluates it', () => {
	const { riva, store } = make();
	store.merge('A:1', { n: 1 });
	store.merge('A:2', { n: 1 });
	let runs = 0;
	const read = computed(() => {
		runs++;
		return dn(store, { __ref: 'A:1' });
	});
	riva.subscribe(read, () => {});
	store.merge('A:2', { n: 2 });
	expect(runs).toBe(1);
	store.merge('A:1', { n: 2 });
	expect(runs).toBe(2);
});

test('an untracked read of a missing entity leaves no signal; a tracked one does', () => {
	const { riva, store } = make();
	expect(dn(store, { __ref: 'X:1' })).toBeUndefined();
	expect(store.signals.has('X:1')).toBe(false);
	const read = computed(() => dn(store, { __ref: 'X:1' }));
	riva.subscribe(read, () => {});
	expect(store.signals.has('X:1')).toBe(true);
	store.merge('X:1', { n: 1 });
	expect(riva.get(read)).toEqual({ n: 1 });
});

test('a memo per reader: a cut cycle does not flip the identity between readers', () => {
	const { store } = make();
	store.merge('A:1', { b: { __ref: 'B:1' } });
	store.merge('B:1', { a: { __ref: 'A:1' } });
	const m1 = new Map<string, unknown>();
	const m2 = new Map<string, unknown>();
	const first = dn(store, { __ref: 'A:1' }, m1);
	dn(store, { __ref: 'B:1' }, m2);
	expect(dn(store, { __ref: 'A:1' }, m1)).toBe(first);
});

test('a GraphQL argument field is not part of a plain result', () => {
	const { store } = make();
	store.merge('A:1', { n: 1, 'friends({"first":1})': [{ __ref: 'A:2' }] });
	store.merge('A:2', { n: 2 });
	expect(dn(store, { __ref: 'A:1' })).toEqual({ n: 1 });
});
