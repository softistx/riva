import { describe, expect, test } from 'bun:test';
import { createRivaClient } from '../client';
import { RivaError } from '../errors';
import { makeIdentify } from './identity';
import { normalize, normalizeAt } from './normalize';
import { EntityStore } from './store';

const store = () => new EntityStore(createRivaClient(), makeIdentify());
const patient = { __typename: 'Patient', id: '1', name: 'Ann' };

describe('normalize', () => {
	test('replaces entities by refs, nested and in arrays', () => {
		const { root, pending } = normalize(store(), {
			list: [
				{ ...patient, doctor: { __typename: 'Doctor', id: 'd', name: 'D' } },
			],
			total: 1,
			page: { cursor: 'x' },
		});
		expect(root).toEqual({
			list: [{ __ref: 'Patient:1' }],
			total: 1,
			page: { cursor: 'x' },
		});
		expect(pending.get('Patient:1')).toEqual({
			__typename: 'Patient',
			id: '1',
			name: 'Ann',
			doctor: { __ref: 'Doctor:d' },
		});
		expect(pending.get('Doctor:d')).toEqual({
			__typename: 'Doctor',
			id: 'd',
			name: 'D',
		});
	});

	test('an entity met twice in one result is merged', () => {
		const { pending } = normalize(store(), [
			{ __typename: 'A', id: 1, x: 1 },
			{ __typename: 'A', id: 1, y: 2 },
		]);
		expect(pending.get('A:1')).toEqual({ __typename: 'A', id: 1, x: 1, y: 2 });
	});

	test('non-entities stay inline; undefined fields are dropped; Dates and null are kept', () => {
		const d = new Date(1);
		const { root } = normalize(store(), {
			a: undefined,
			b: null,
			c: d,
			d: { id: 1 },
		});
		expect(root).toEqual({ b: null, c: d, d: { id: 1 } });
	});

	test('nothing but JSON: functions, classes, bigint, non-finite numbers, cycles refuse with RIVA_CACHE', () => {
		const cyc: Record<string, unknown> = {};
		cyc['self'] = cyc;
		for (const bad of [
			() => 1,
			1n,
			Symbol('s'),
			new Map(),
			new (class A {})(),
			Number.NaN,
			{ nested: [{ f() {} }] },
			cyc,
		]) {
			try {
				normalize(store(), { x: bad });
				throw new Error('should refuse');
			} catch (e) {
				expect(e).toBeInstanceOf(RivaError);
				expect((e as RivaError).code).toBe('RIVA_CACHE');
			}
		}
	});

	test('a custom identify that throws leaves the walk without a result', () => {
		const s = new EntityStore(createRivaClient(), () => {
			throw new Error('boom');
		});
		expect(() => normalize(s, { a: {} })).toThrow('boom');
	});
});

describe('normalizeAt', () => {
	test('puts the fields under the ref, nested entities normalized', () => {
		const pending = normalizeAt(store(), 'Patient:1', {
			name: 'Z',
			doctor: { __typename: 'Doctor', id: 'd' },
		});
		expect(pending.get('Patient:1')).toEqual({
			name: 'Z',
			doctor: { __ref: 'Doctor:d' },
		});
		expect(pending.has('Doctor:d')).toBe(true);
	});

	test('refuses what is not an object', () => {
		expect(() => normalizeAt(store(), 'A:1', [1] as never)).toThrow(RivaError);
	});
});
