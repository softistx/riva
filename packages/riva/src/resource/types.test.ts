import { expect, expectTypeOf, test } from 'bun:test';
import { createRiva } from '../client';
import { query } from '../query';
import { resource } from './resource';
import type { ResourceState } from './types';
import { IDLE, sameState } from './types';

test('a resource narrows on status and carries the data type', () => {
	const q = query<{ id: string }, { name: string }>({
		id: 'q',
		fetch: async () => ({ name: 'a' }),
	});
	const r = resource(createRiva(), () => [q, { id: '1' }] as const);
	const s = r.state;
	expectTypeOf(s).toEqualTypeOf<ResourceState<{ name: string }>>();
	if (s.status === 'success') {
		expectTypeOf(s.data).toEqualTypeOf<{ name: string }>();
		expectTypeOf(s.placeholder).toEqualTypeOf<boolean>();
	}
	if (s.status === 'idle') expectTypeOf(s.data).toEqualTypeOf<undefined>();
	if (s.status === 'loading')
		expectTypeOf(s.data).toEqualTypeOf<{ name: string } | undefined>();
	if (s.status === 'error') expectTypeOf(s.error).toEqualTypeOf<unknown>();
	expectTypeOf(r).toExtend<PromiseLike<{ name: string }>>();
	// @ts-expect-error variables are checked against the definition
	resource(createRiva(), () => [q, { id: 1 }] as const);
});

test('the shared helpers', () => {
	expect(IDLE.status).toBe('idle');
	expect(sameState({ a: 1 }, { a: 1 })).toBe(true);
	expect(sameState({ a: 1 }, { a: 2 })).toBe(false);
	expect(sameState({ a: 1 }, { a: 1, b: 2 })).toBe(false);
});
