import { expect, expectTypeOf, test } from 'bun:test';
import { createRiva } from './client';
import { at, type Mutation, mutation } from './mutation';
import { query } from './query';

test('a definition is frozen and stateless', () => {
	const m = mutation<{ id: string }, number>({
		id: 'm',
		run: async () => 1,
	});
	expect(Object.isFrozen(m)).toBe(true);
	expect(m.kind).toBe('mutation');
	expect(m.id).toBe('m');
});

test('variables are optional when void', async () => {
	const m = mutation({ id: 'm', run: async () => 'ok' });
	expect(await m.run(createRiva())).toBe('ok');
});

test('Vars and Data are typed through run, optimistic, updates and invalidates', () => {
	const list = query<{ s: string }, string[]>({
		id: 'l',
		fetch: async () => [],
	});
	const one = query<void, number>({ id: 'o', fetch: async () => 1 });
	const m = mutation<{ name: string }, { ok: boolean }>({
		id: 'm',
		run: async (vars, ctx) => {
			expectTypeOf(vars).toEqualTypeOf<{ name: string }>();
			expectTypeOf(ctx.signal).toEqualTypeOf<AbortSignal>();
			return { ok: true };
		},
		optimistic: (vars, tx) => {
			expectTypeOf(vars).toEqualTypeOf<{ name: string }>();
			tx.set(list, { s: 'a' }, (prev) => {
				expectTypeOf(prev).toEqualTypeOf<string[] | undefined>();
				return [...(prev ?? []), vars.name];
			});
			tx.set(one, undefined, 2);
			// @ts-expect-error wrong data type
			tx.set(list, { s: 'a' }, 'x');
			// @ts-expect-error wrong variables
			tx.set(list, { t: 'a' }, []);
			return { ok: true };
		},
		updates: (tx, data, vars) => {
			expectTypeOf(data).toEqualTypeOf<{ ok: boolean }>();
			expectTypeOf(vars).toEqualTypeOf<{ name: string }>();
			tx.set(one, undefined, 3);
		},
		invalidates: (data, vars) => {
			expectTypeOf(data.ok).toEqualTypeOf<boolean>();
			return [list, at(list, { s: vars.name })];
		},
	});
	expectTypeOf(m).toEqualTypeOf<Mutation<{ name: string }, { ok: boolean }>>();
	// @ts-expect-error wrong variables for the query
	at(list, { t: 'x' });
	// @ts-expect-error wrong variables inside invalidates
	mutation({ id: 'w', run: async () => 1, invalidates: [at(one, 3)] });
	// Never called: only the types are checked.
	const _calls = () => {
		const c = createRiva();
		expectTypeOf(m.run(c, { name: 'x' })).toEqualTypeOf<
			Promise<{ ok: boolean }>
		>();
		expectTypeOf(
			m.run(c, { name: 'x' }, { signal: new AbortController().signal }),
		).toEqualTypeOf<Promise<{ ok: boolean }>>();
		// @ts-expect-error variables are required
		m.run(c);
		// @ts-expect-error wrong variables
		m.run(c, { name: 1 });
	};
	void _calls;
	mutation({ id: 'i', run: async () => 1, invalidates: [list, one] });
});
