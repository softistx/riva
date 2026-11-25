import { expect, expectTypeOf, test } from 'bun:test';
import { createRiva, Riva, type RivaOptions } from './client';
import {
	type ClientEvents,
	type ClientOptions,
	createRivaClient,
	RivaClient,
	setDefaultClient,
} from './deprecated';
import type { RivaEvents } from './env';
import { setDefaultRiva } from './scope';

test('the deprecated names are the same references as the new ones', () => {
	expect(createRivaClient).toBe(createRiva);
	expect(RivaClient).toBe(Riva);
	expect(setDefaultClient).toBe(setDefaultRiva);
	expect(createRivaClient() instanceof RivaClient).toBe(true);
	expect(createRiva() instanceof RivaClient).toBe(true);
});

test('the deprecated types are the new ones', () => {
	expectTypeOf<ClientOptions>().toEqualTypeOf<RivaOptions>();
	expectTypeOf<ClientEvents>().toEqualTypeOf<RivaEvents>();
	expectTypeOf<RivaClient>().toEqualTypeOf<Riva>();
});
