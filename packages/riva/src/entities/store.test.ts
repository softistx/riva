import { describe, expect, test } from 'bun:test';
import { createRiva } from '../client';
import { computed } from '../computed';
import { EntityStore } from './store';

const make = () => {
	const riva = createRiva();
	return { riva, store: new EntityStore(riva) };
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
		const { riva, store } = make();
		store.merge('Book:1', { title: 'A' });
		store.merge('Book:2', { title: 'B' });
		const seen: string[] = [];
		const one = computed(() => riva.get(store.signalOf('Book:1')));
		const two = computed(() => riva.get(store.signalOf('Book:2')));
		riva.subscribe(one, () => seen.push('1'));
		riva.subscribe(two, () => seen.push('2'));
		riva.batch(() => {
			store.merge('Book:1', { title: 'A2' });
			store.merge('Book:1', { pages: 3 });
		});
		expect(seen).toEqual(['1']);
	});

	test('clear on an absent entity is false', () => {
		const { store } = make();
		expect(store.clear('Book:1')).toBe(false);
	});

	test('sweep removes what no root or pin reaches, through entity fields', () => {
		const { store } = make();
		store.merge('Book:1', { author: { __ref: 'Author:1' } });
		store.merge('Author:1', { name: 'N' });
		store.merge('Other:1', {});
		const root = { refs: ['Book:1'] };
		store.roots.add(root);
		store.sweep();
		expect(store.peek('Book:1')).toBeDefined();
		expect(store.peek('Author:1')).toBeDefined();
		expect(store.peek('Other:1')).toBeUndefined();
		store.roots.delete(root);
		store.sweep();
		expect(store.peek('Book:1')).toBeUndefined();
		expect(store.peek('Author:1')).toBeUndefined();
		expect(store.signals.size).toBe(0);
	});

	test('sweep collects entities that point at each other', () => {
		const { store } = make();
		store.merge('A:2', { b: { __ref: 'B:2' } });
		store.merge('B:2', { a: { __ref: 'A:2' } });
		const root = { refs: ['A:2'] };
		store.roots.add(root);
		store.sweep();
		expect(store.peek('B:2')).toBeDefined();
		store.roots.delete(root);
		store.sweep();
		expect(store.peek('A:2')).toBeUndefined();
		expect(store.peek('B:2')).toBeUndefined();
	});

	test('a pin keeps an entity without a root', () => {
		const { store } = make();
		store.merge('A:1', { n: 1 });
		store.pins.add('A:1');
		store.sweep();
		expect(store.peek('A:1')).toBeDefined();
	});

	test('empty tells whether any entity holds fields', () => {
		const { store } = make();
		expect(store.empty).toBe(true);
		store.merge('A:1', { n: 1 });
		expect(store.empty).toBe(false);
	});

	test('holds tells whether an entity of the exact type holds fields', () => {
		const { store } = make();
		store.merge('Pen:1', { a: 1 });
		store.merge('PenCase:1', { a: 1 });
		store.merge('Cup:1', { a: 1 });
		store.clear('Cup:1');
		expect(store.holds('Pen')).toBe(true);
		expect(store.holds('Cup')).toBe(false);
		expect(store.holds('Pe')).toBe(false);
		store.clear('Pen:1');
		expect(store.holds('Pen')).toBe(false);
		expect(store.holds('PenCase')).toBe(true);
	});

	test('an observed signal stays when its entity is removed', () => {
		const { riva, store } = make();
		store.merge('Book:1', { title: 'A' });
		const seen: unknown[] = [];
		riva.subscribe(store.signalOf('Book:1'), (v) => seen.push(v));
		store.sweep();
		expect(seen).toEqual([undefined]);
		expect(store.signals.has('Book:1')).toBe(true);
	});
});
