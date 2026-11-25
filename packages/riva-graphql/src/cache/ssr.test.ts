/* biome-ignore-all lint/style/useNamingConvention: GraphQL's field names */
import { expect, test } from 'bun:test';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { createRiva, type Riva } from '@softistx/riva';
import { readEntity } from '@softistx/riva/entities';
import { dehydrate, hydrate } from '@softistx/riva/ssr';
import { parse } from 'graphql';
import { storeOfRiva } from '../../test/cache';
import { fakeTransport } from '../../test/fixtures';
import { query } from '../query';
import { provideGraphQL } from '../transport';
import { normalized } from './normalized';

const ALIASED_QUERY = parse(
	'query Aliased($id: ID!, $n: Int) { me: patient(id: $id) { __typename id label: name friends(first: $n) { __typename id nick: name } } }',
) as TypedDocumentNode<
	{
		me: {
			label: string;
			friends: { id: string; nick: string }[];
		};
	},
	{ id: string; n: number }
>;

const answer = (n: number) => ({
	me: {
		__typename: 'Patient',
		id: '1',
		label: 'Ada',
		friends: Array.from({ length: n }, (_, i) => ({
			__typename: 'Patient',
			id: String(i + 2),
			nick: `P${i + 2}`,
		})),
	},
});

const cache = normalized();
const aliased = query(ALIASED_QUERY, { cache, staleTime: 60_000 });

function setup(): { riva: Riva; calls: () => number } {
	const riva = createRiva();
	const transport = fakeTransport((call) =>
		answer((call.variables as { n: number }).n),
	);
	provideGraphQL(riva, transport);
	return { riva, calls: () => transport.calls.length };
}

test('a normalized cache with aliases and arguments survives dehydrate and hydrate', async () => {
	const server = setup();
	await aliased.ensure(server.riva, { id: '1', n: 1 });
	await aliased.ensure(server.riva, { id: '1', n: 2 });
	const snap = JSON.parse(JSON.stringify(dehydrate(server.riva)));

	const browser = setup();
	hydrate(browser.riva, snap);
	const one = browser.riva.get(aliased, { id: '1', n: 1 }).data;
	const two = browser.riva.get(aliased, { id: '1', n: 2 }).data;
	expect(one).toEqual(answer(1));
	expect(two).toEqual(answer(2));
	expect(one?.me.label).toBe('Ada');
	expect(two?.me.friends.map((f) => f.nick)).toEqual(['P2', 'P3']);

	// Renormalized under field names and argument keys, as the server's store is.
	expect(storeOfRiva(browser.riva).peek('Patient:1')).toEqual(
		storeOfRiva(server.riva).peek('Patient:1'),
	);
	expect(readEntity(browser.riva, 'Patient:1')).toMatchObject({
		name: 'Ada',
	});

	// Fresh data: subscribing fetches nothing; a second dehydrate is identical.
	const off = browser.riva.subscribe(aliased, { id: '1', n: 1 }, () => {});
	await new Promise((r) => setImmediate(r));
	off();
	expect(browser.calls()).toBe(0);
	const again = dehydrate(browser.riva);
	expect(again.q.map((e) => [e.k, e.d])).toEqual(
		snap.q.map((e: { k: string; d: unknown }) => [e.k, e.d]),
	);
});
