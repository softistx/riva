import { expect, test } from 'bun:test';
import { createRivaClient } from '../client';
import { computed } from '../computed';
import { denormalize } from './denormalize';
import { makeIdentify } from './identity';
import { EntityStore } from './store';

const make = () => {
	const client = createRivaClient();
	return { client, store: new EntityStore(client, makeIdentify()) };
};

test('resolves refs, nested, in arrays and in plain objects', () => {
	const { store } = make();
	store.merge('A:1', { n: 1, b: { __ref: 'B:1' } });
	store.merge('B:1', { n: 2 });
	expect(
		denormalize(store, {
			list: [{ __ref: 'A:1' }],
			meta: { first: { __ref: 'B:1' } },
		}),
	).toEqual({ list: [{ n: 1, b: { n: 2 } }], meta: { first: { n: 2 } } });
});

test('a missing entity is undefined, never an error; the field is omitted', () => {
	const { store } = make();
	store.merge('A:1', { n: 1, gone: { __ref: 'B:9' } });
	expect(denormalize(store, { __ref: 'A:1' })).toEqual({ n: 1 });
	expect(denormalize(store, { __ref: 'X:1' })).toBeUndefined();
	expect(denormalize(store, [{ __ref: 'X:1' }])).toEqual([undefined]);
});

test('a reference cycle is cut where it loops back', () => {
	const { store } = make();
	store.merge('A:1', { n: 1, b: { __ref: 'B:1' } });
	store.merge('B:1', { n: 2, a: { __ref: 'A:1' } });
	expect(denormalize(store, { __ref: 'A:1' })).toEqual({ n: 1, b: { n: 2 } });
});

test('unchanged entities keep their identity when another one changes', () => {
	const { client, store } = make();
	store.merge('A:1', { tags: ['x'] });
	store.merge('A:2', { tags: ['y'] });
	const roots = { list: [{ __ref: 'A:1' }, { __ref: 'A:2' }] };
	const read = computed(
		() => denormalize(store, roots) as { list: { tags: string[] }[] },
	);
	const first = client.get(read);
	store.merge('A:2', { tags: ['z'] });
	const second = client.get(read);
	expect(second).not.toBe(first);
	expect(second.list[0]).toBe(first.list[0]);
	expect(second.list[1]?.tags).toEqual(['z']);
});

test('the read is tracked: only a reached entity re-evaluates it', () => {
	const { client, store } = make();
	store.merge('A:1', { n: 1 });
	store.merge('A:2', { n: 1 });
	let runs = 0;
	const read = computed(() => {
		runs++;
		return denormalize(store, { __ref: 'A:1' });
	});
	client.subscribe(read, () => {});
	store.merge('A:2', { n: 2 });
	expect(runs).toBe(1);
	store.merge('A:1', { n: 2 });
	expect(runs).toBe(2);
});
