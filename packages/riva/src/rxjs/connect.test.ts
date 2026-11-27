import { describe, expect, expectTypeOf, test } from 'bun:test';
import { Observable, of, Subject, throwError } from 'rxjs';
import { createRiva } from '../client';
import { signal } from '../signal';
import { connect } from './connect';

describe('connect', () => {
	test('each value lands in the state', () => {
		const riva = createRiva();
		const n = signal(0);
		const src = new Subject<number>();
		connect(riva, n, src);
		src.next(1);
		src.next(2);
		expect(riva.get(n)).toBe(2);
	});

	test('a synchronous source lands at once', () => {
		const riva = createRiva();
		const n = signal(0);
		connect(riva, n, of(1, 2, 3));
		expect(riva.get(n)).toBe(3);
	});

	test('stop unsubscribes, and is idempotent', () => {
		const riva = createRiva();
		const n = signal(0);
		const src = new Subject<number>();
		let closed = 0;
		const obs = new Observable<number>((sub) => {
			const s = src.subscribe(sub);
			return () => {
				closed++;
				s.unsubscribe();
			};
		});
		const stop = connect(riva, n, obs);
		src.next(1);
		stop();
		stop();
		src.next(2);
		expect(riva.get(n)).toBe(1);
		expect(closed).toBe(1);
	});

	test('complete leaves the last value', () => {
		const riva = createRiva();
		const n = signal(0);
		const src = new Subject<number>();
		connect(riva, n, src);
		src.next(5);
		src.complete();
		expect(riva.get(n)).toBe(5);
	});

	test('an error ends the connection and keeps the last value, nothing is thrown', () => {
		const riva = createRiva();
		const n = signal(0);
		const src = new Subject<number>();
		connect(riva, n, src);
		src.next(4);
		expect(() => src.error(new Error('boom'))).not.toThrow();
		expect(riva.get(n)).toBe(4);
		const m = signal(0);
		expect(() =>
			connect(
				riva,
				m,
				throwError(() => new Error('x')),
			),
		).not.toThrow();
		expect(riva.get(m)).toBe(0);
	});

	test('two rivas are isolated', () => {
		const a = createRiva();
		const b = createRiva();
		const n = signal(0);
		const src = new Subject<number>();
		connect(a, n, src);
		src.next(7);
		expect(a.get(n)).toBe(7);
		expect(b.get(n)).toBe(0);
	});

	test('the Observable type must match the state', () => {
		const riva = createRiva();
		const n = signal(0);
		connect(riva, n, of(1));
		// @ts-expect-error a string stream into a number state
		connect(riva, n, of('a'));
		expectTypeOf(connect).returns.toEqualTypeOf<() => void>();
	});
});
