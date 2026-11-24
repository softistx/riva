import { describe, expect, test } from 'bun:test';
import { createRivaClient } from '../client';
import { createSlots } from './slots';

describe('slots', () => {
	test('setFlag adds an entry and drops it when both flags are off', () => {
		const slots = createSlots();
		const c = createRivaClient();
		expect(c.get(slots.flags)).toEqual({});
		slots.setFlag(c, 'k', 'next', true);
		expect(c.get(slots.flags)['k']).toEqual([true, false]);
		slots.setFlag(c, 'k', 'previous', true);
		slots.setFlag(c, 'k', 'next', false);
		expect(Object.keys(c.get(slots.flags))).toEqual(['k']);
		slots.setFlag(c, 'k', 'previous', false);
		expect(c.get(slots.flags)).toEqual({});
	});

	test('an unchanged flag keeps the same object', () => {
		const slots = createSlots();
		const c = createRivaClient();
		const before = c.get(slots.flags);
		slots.setFlag(c, 'k', 'next', false);
		expect(c.get(slots.flags)).toBe(before);
		slots.setFlag(c, 'k', 'next', true);
		const on = c.get(slots.flags);
		slots.setFlag(c, 'k', 'next', true);
		expect(c.get(slots.flags)).toBe(on);
	});

	test('each client has its own slot', () => {
		const slots = createSlots();
		const a = createRivaClient();
		const b = createRivaClient();
		expect(slots.slot(a)).toBe(slots.slot(a));
		expect(slots.slot(a)).not.toBe(slots.slot(b));
	});
});
