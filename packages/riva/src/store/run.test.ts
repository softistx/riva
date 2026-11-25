import { describe, expect, test } from 'bun:test';
import { createRiva } from '../client';
import type { RivaError } from '../errors';
import { type Signal, signal } from '../signal';
import type { StoreDef } from './def';
import { run } from './run';

const make = () => {
	const n = signal(0, { name: 't.n' }) as Signal<unknown>;
	const def: StoreDef = {
		name: 't',
		sigs: { n },
		members: { n },
		actions: {},
	};
	return { n, def };
};

describe('run', () => {
	test('runs a sync action in one batch and returns its result', () => {
		const { n, def } = make();
		const c = createRiva();
		const seen: unknown[] = [];
		c.subscribe(n, (v) => seen.push(v));
		const r = run(
			def,
			c,
			(s: { n: number }) => {
				s.n = 1;
				s.n = 2;
				return 'done';
			},
			[],
		);
		expect(r).toBe('done');
		expect(seen).toEqual([2]);
	});

	test('passes the arguments, then the context after the declared ones', () => {
		const { def } = make();
		const c = createRiva();
		let got: unknown[] = [];
		run(
			def,
			c,
			(_s: unknown, ...a: unknown[]) => {
				got = a;
			},
			[1],
		);
		expect(got).toEqual([1, expect.objectContaining({ riva: c })]);
		got = [];
		let ctx: unknown;
		run(
			def,
			c,
			(_s: unknown, _a?: number, _b?: number, x?: unknown) => {
				ctx = x;
			},
			[],
		);
		expect(ctx).toEqual(expect.objectContaining({ riva: c }));
	});

	test('revokes s once the action settles, and rethrows its error', async () => {
		const { def } = make();
		const c = createRiva();
		let kept!: { n: number };
		expect(() =>
			run(
				def,
				c,
				(s: { n: number }) => {
					kept = s;
					throw new Error('x');
				},
				[],
			),
		).toThrow('x');
		try {
			kept.n = 1;
			throw new Error('no refusal');
		} catch (e) {
			expect((e as RivaError).code).toBe('RIVA_STORE');
		}
		await expect(
			run(def, c, async () => Promise.reject(new Error('y')), []),
		).rejects.toThrow('y');
	});
});
