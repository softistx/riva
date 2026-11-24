import { describe, expect, test } from 'bun:test';
import { createRivaClient } from '../client';
import { computed } from '../computed';
import { makeIdentify } from './identity';
import { EntityStore } from './store';

const make = () => {
	const client = createRivaClient();
	return { client, store: new EntityStore(client, makeIdentify()) };
};

describe('EntityStore (ported from graphql-client store.spec, without selections)', () => {
	test('merge keeps the other fields', () => {
		const { store } = make();
		store.merge('Book:1', { title: 'A', tags: ['x'] });
		store.merge('Book:1', { title: 'A', pages: 10 });
		expect(store.peek('Book:1')).toEqual({
			title: 'A',
			tags: ['x'],
			pages: 10,
		});
	});

	test('a merge that changes nothing writes nothing', () => {
		const { store } = make();
		store.merge('Book:1', { title: 'A', tags: ['x'] });
		const before = store.peek('Book:1');
		store.merge('Book:1', { title: 'A', tags: ['x'] });
		expect(store.peek('Book:1')).toBe(before);
	});

	test("a merge notifies only that entity's readers, once", () => {
		const { client, store } = make();
		store.merge('Book:1', { title: 'A' });
		store.merge('Book:2', { title: 'B' });
		const seen: string[] = [];
		const one = computed(() => client.get(store.atomOf('Book:1')));
		const two = computed(() => client.get(store.atomOf('Book:2')));
		client.subscribe(one, () => seen.push('1'));
		client.subscribe(two, () => seen.push('2'));
		client.batch(() => {
			store.merge('Book:1', { title: 'A2' });
			store.merge('Book:1', { pages: 3 });
		});
		expect(seen).toEqual(['1']);
	});

	test('clear on an absent entity is false', () => {
		const { store } = make();
		expect(store.clear('Book:1')).toBe(false);
	});

	test('counts: an entity nobody holds is removed, what it held is released', () => {
		const { store } = make();
		store.merge('Book:1', { author: { __ref: 'Author:1' } });
		store.merge('Author:1', { name: 'N' });
		store.retain('Book:1');
		expect(store.counts.get('Author:1')).toBe(1);
		store.release('Book:1');
		expect(store.peek('Book:1')).toBeUndefined();
		expect(store.peek('Author:1')).toBeUndefined();
		expect(store.atoms.has('Book:1')).toBe(false);
	});

	test('replacing a field moves the hold', () => {
		const { store } = make();
		store.merge('Author:1', { name: 'A' });
		store.merge('Author:2', { name: 'B' });
		store.retain('Author:1');
		store.merge('Book:1', { author: { __ref: 'Author:1' } });
		store.retain('Book:1');
		store.merge('Book:1', { author: { __ref: 'Author:2' } });
		expect(store.counts.get('Author:1')).toBe(1);
		expect(store.counts.get('Author:2')).toBe(1);
	});

	test('an observed atom stays when its entity is removed', () => {
		const { client, store } = make();
		store.merge('Book:1', { title: 'A' });
		store.retain('Book:1');
		const seen: unknown[] = [];
		client.subscribe(store.atomOf('Book:1'), (v) => seen.push(v));
		store.release('Book:1');
		expect(seen).toEqual([undefined]);
		expect(store.atoms.has('Book:1')).toBe(true);
	});
});
