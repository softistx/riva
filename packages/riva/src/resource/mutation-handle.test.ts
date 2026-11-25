import { describe, expect, expectTypeOf, test } from 'bun:test';
import { createRiva } from '../client';
import { computed } from '../computed';
import { mutationHandle } from './mutation-handle';

const tick = () => new Promise<void>((r) => setImmediate(r));

function gate<T>() {
	const calls: Array<{
		vars: unknown;
		ok: (v: T) => void;
		no: (e: unknown) => void;
	}> = [];
	const run = (vars: unknown) =>
		new Promise<T>((ok, no) => {
			calls.push({ vars, ok, no });
		});
	return { calls, run };
}

describe('mutationHandle', () => {
	test('idle first, then loading and success', async () => {
		const riva = createRiva();
		const { calls, run } = gate<string>();
		const save = mutationHandle<{ id: number }, string>(riva, run);
		expect(save.state).toEqual({
			status: 'idle',
			data: undefined,
			error: undefined,
		});
		const seen: string[] = [];
		const off = save.subscribe((s) => seen.push(s.status));
		const p = save({ id: 1 });
		expect(save.state.status).toBe('loading');
		calls[0]?.ok('done');
		expect(await p).toBe('done');
		expect(save.state).toMatchObject({ status: 'success', data: 'done' });
		expect(seen).toEqual(['loading', 'success']);
		off();
	});

	test('a failure is the error state and rejects the call', async () => {
		const riva = createRiva();
		const { calls, run } = gate<string>();
		const save = mutationHandle<void, string>(riva, run);
		const p = save().catch((e: unknown) => e);
		const boom = new Error('boom');
		calls[0]?.no(boom);
		expect(await p).toBe(boom);
		expect(save.state).toMatchObject({ status: 'error', error: boom });
	});

	test('a synchronous throw of run rejects the call and sets the error', async () => {
		const riva = createRiva();
		const save = mutationHandle<void, string>(riva, () => {
			throw new Error('sync');
		});
		await expect(save()).rejects.toThrow('sync');
		expect(save.state.status).toBe('error');
	});

	test('the last call wins the state, each call keeps its own result', async () => {
		const riva = createRiva();
		const { calls, run } = gate<string>();
		const save = mutationHandle<number, string>(riva, run);
		const a = save(1);
		const b = save(2);
		calls[1]?.ok('B');
		calls[0]?.ok('A');
		expect(await a).toBe('A');
		expect(await b).toBe('B');
		expect(save.state).toMatchObject({ status: 'success', data: 'B' });
	});

	test('reset goes back to idle and ignores a call still running', async () => {
		const riva = createRiva();
		const { calls, run } = gate<string>();
		const save = mutationHandle<void, string>(riva, run);
		const p = save();
		save.reset();
		expect(save.state.status).toBe('idle');
		calls[0]?.ok('late');
		await p;
		expect(save.state.status).toBe('idle');
	});

	test('the state is tracked in a computed, and passes the options to run', async () => {
		const riva = createRiva();
		let got: unknown;
		const save = mutationHandle<number, number, { signal?: AbortSignal }>(
			riva,
			async (v, o) => {
				got = o;
				return v * 2;
			},
		);
		const label = computed(() => save.state.status);
		const seen: string[] = [];
		const off = riva.subscribe(label, (s) => seen.push(s));
		const opts = {};
		await save(2, opts);
		await tick();
		expect(got).toBe(opts);
		expect(seen).toEqual(['loading', 'success']);
		off();
	});

	test('two rivas are isolated', async () => {
		const a = mutationHandle<void, number>(createRiva(), async () => 1);
		const b = mutationHandle<void, number>(createRiva(), async () => 1);
		await a();
		expect(a.state.status).toBe('success');
		expect(b.state.status).toBe('idle');
	});

	test('types: variables are optional only when void', () => {
		const riva = createRiva();
		const none = mutationHandle<void, number>(riva, async () => 1);
		const some = mutationHandle<{ id: number }, string>(riva, async () => 'x');
		// biome-ignore lint/suspicious/noConfusingVoidType: void variables are the case under test
		expectTypeOf(none).parameters.toEqualTypeOf<[vars?: void, opts?: never]>();
		expectTypeOf(some).parameters.toEqualTypeOf<
			[vars: { id: number }, opts?: never]
		>();
		expectTypeOf(some).returns.toEqualTypeOf<Promise<string>>();
		const s = some.state;
		if (s.status === 'success') expectTypeOf(s.data).toEqualTypeOf<string>();
		else expectTypeOf(s.data).toEqualTypeOf<undefined>();
	});
});
