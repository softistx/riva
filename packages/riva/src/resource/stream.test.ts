import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createRiva } from '../client';
import { signal } from '../signal';
import { streamResource } from './stream';

const tick = () => new Promise<void>((r) => setImmediate(r));
const g = globalThis as { document?: unknown };

beforeEach(() => {
	g.document = {};
});
afterEach(() => {
	delete g.document;
});

/** A stream the test pushes into. */
function feed() {
	const opened: Array<{
		signal: AbortSignal;
		returned: number;
		push: (v: number) => void;
		fail: (e: unknown) => void;
		end: () => void;
	}> = [];
	const factory = (signal: AbortSignal) => {
		const queue: Array<IteratorResult<number> | { error: unknown }> = [];
		let wake: (() => void) | undefined;
		const h = {
			signal,
			returned: 0,
			push: (v: number) => {
				queue.push({ value: v, done: false });
				wake?.();
			},
			fail: (error: unknown) => {
				queue.push({ error });
				wake?.();
			},
			end: () => {
				queue.push({ value: undefined, done: true });
				wake?.();
			},
		};
		opened.push(h);
		return {
			[Symbol.asyncIterator]: () => ({
				async next() {
					while (!queue.length) await new Promise<void>((r) => (wake = r));
					const x = queue.shift() as
						| IteratorResult<number>
						| { error: unknown };
					if ('error' in x) throw x.error;
					return x;
				},
				async return() {
					h.returned++;
					return { value: undefined, done: true as const };
				},
			}),
		};
	};
	return { opened, factory };
}

describe('streamResource', () => {
	test('loading until the first value, then success with the last', async () => {
		const riva = createRiva();
		const { opened, factory } = feed();
		const s = streamResource(riva, () => factory);
		expect(s.state.status).toBe('loading');
		const seen: Array<[string, unknown]> = [];
		const off = s.subscribe((x) => seen.push([x.status, x.data]));
		await tick();
		expect(opened).toHaveLength(1);
		expect(s.state).toMatchObject({ status: 'loading', isFetching: true });
		opened[0]?.push(1);
		await tick();
		opened[0]?.push(2);
		await tick();
		expect(s.state).toMatchObject({
			status: 'success',
			data: 2,
			isFetching: true,
		});
		expect(seen).toEqual([
			['loading', undefined],
			['success', 1],
			['success', 2],
		]);
		off();
	});

	test('nothing opens without a reader; the last unsubscribe aborts and calls return()', async () => {
		const riva = createRiva();
		const { opened, factory } = feed();
		const s = streamResource(riva, () => factory);
		await tick();
		expect(opened).toHaveLength(0);
		const a = s.subscribe(() => {});
		const b = s.subscribe(() => {});
		await tick();
		expect(opened).toHaveLength(1);
		a();
		expect(opened[0]?.signal.aborted).toBe(false);
		b();
		await tick();
		expect(opened[0]?.signal.aborted).toBe(true);
		expect(opened[0]?.returned).toBe(1);
	});

	test('a change of what the source reads restarts the stream', async () => {
		const riva = createRiva();
		const { opened, factory } = feed();
		const id = signal(1);
		const used: number[] = [];
		const s = streamResource(riva, () => {
			used.push(riva.get(id));
			return (signal) => factory(signal);
		});
		const off = s.subscribe(() => {});
		await tick();
		opened[0]?.push(1);
		await tick();
		riva.set(id, 2);
		await tick();
		expect(used).toEqual([1, 2]);
		expect(opened).toHaveLength(2);
		expect(opened[0]?.signal.aborted).toBe(true);
		expect(opened[0]?.returned).toBe(1);
		expect(s.state).toMatchObject({ status: 'loading', data: undefined });
		off();
	});

	test('enabled false is idle and the source is not called', async () => {
		const riva = createRiva();
		const { opened, factory } = feed();
		const on = signal(false);
		let sourced = 0;
		const s = streamResource(
			riva,
			() => {
				sourced++;
				return factory;
			},
			{ enabled: () => riva.get(on) },
		);
		const off = s.subscribe(() => {});
		await tick();
		expect(s.state.status).toBe('idle');
		expect(sourced).toBe(0);
		riva.set(on, true);
		await tick();
		expect(opened).toHaveLength(1);
		riva.set(on, false);
		await tick();
		expect(s.state.status).toBe('idle');
		expect(opened[0]?.signal.aborted).toBe(true);
		off();
	});

	test('an error keeps the last value, calls error and ends', async () => {
		const riva = createRiva();
		const { opened, factory } = feed();
		const errors: unknown[] = [];
		const s = streamResource(riva, () => factory, {
			error: (e) => errors.push(e),
		});
		const off = s.subscribe(() => {});
		await tick();
		opened[0]?.push(7);
		await tick();
		const boom = new Error('boom');
		opened[0]?.fail(boom);
		await tick();
		expect(s.state).toMatchObject({
			status: 'error',
			data: 7,
			error: boom,
			isFetching: false,
		});
		expect(errors).toEqual([boom]);
		off();
	});

	test('complete: success stays with the last value; no value goes idle', async () => {
		const riva = createRiva();
		const { opened, factory } = feed();
		let done = 0;
		const s = streamResource(riva, () => factory, { complete: () => done++ });
		const off = s.subscribe(() => {});
		await tick();
		opened[0]?.push(1);
		await tick();
		opened[0]?.end();
		await tick();
		expect(s.state).toMatchObject({
			status: 'success',
			data: 1,
			isFetching: false,
		});
		expect(done).toBe(1);
		off();
		const t = streamResource(riva, () => factory);
		const off2 = t.subscribe(() => {});
		await tick();
		opened[1]?.end();
		await tick();
		expect(t.state.status).toBe('idle');
		off2();
	});

	test('a throwing next ends the stream and is raised outside it', async () => {
		const riva = createRiva();
		const { opened, factory } = feed();
		const raised: unknown[] = [];
		const real = globalThis.queueMicrotask;
		globalThis.queueMicrotask = (f) => {
			try {
				f();
			} catch (e) {
				raised.push(e);
			}
		};
		try {
			const errors: unknown[] = [];
			const s = streamResource(riva, () => factory, {
				next: () => {
					throw new Error('cb');
				},
				error: (e) => errors.push(e),
			});
			const off = s.subscribe(() => {});
			await tick();
			opened[0]?.push(1);
			await tick();
			await tick();
			expect(opened[0]?.signal.aborted).toBe(true);
			expect(opened[0]?.returned).toBe(1);
			expect(errors).toEqual([]);
			expect(raised.map((e) => (e as Error).message)).toEqual(['cb']);
			off();
		} finally {
			globalThis.queueMicrotask = real;
		}
	});

	test('a factory that throws is the error state', async () => {
		const riva = createRiva();
		const boom = new Error('open');
		const s = streamResource<number>(riva, () => () => {
			throw boom;
		});
		const off = s.subscribe(() => {});
		await tick();
		expect(s.state).toMatchObject({ status: 'error', error: boom });
		off();
	});

	test('on the server nothing opens', async () => {
		delete g.document;
		const riva = createRiva();
		const { opened, factory } = feed();
		const s = streamResource(riva, () => factory);
		const off = s.subscribe(() => {});
		await tick();
		expect(opened).toHaveLength(0);
		off();
	});

	test('two rivas open their own stream', async () => {
		const { opened, factory } = feed();
		const a = streamResource(createRiva(), () => factory);
		const b = streamResource(createRiva(), () => factory);
		const offA = a.subscribe(() => {});
		const offB = b.subscribe(() => {});
		await tick();
		opened[0]?.push(1);
		await tick();
		expect(a.state.status).toBe('success');
		expect(b.state.status).toBe('loading');
		offA();
		offB();
	});
});
