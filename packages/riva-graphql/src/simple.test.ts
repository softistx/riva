/* biome-ignore-all lint/style/useNamingConvention: GraphQL's field names */
import { describe, expect, expectTypeOf, test } from 'bun:test';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { createRiva, RivaError } from '@softistx/riva';
import { readEntity } from '@softistx/riva/entities';
import { parse } from 'graphql';
import {
	fakeTransport,
	PATIENTS_QUERY,
	RENAME_PATIENT_MUTATION,
	VIEWER_QUERY,
} from '../test/fixtures';
import { normalized } from './cache/index';
import { mutation, query } from './query';
import { graphql } from './simple';
import type { GraphQLTransport } from './transport';

const SUB = parse(
	'subscription PatientRenamed($school: ID!) { patientRenamed(school: $school) { __typename id name } }',
) as TypedDocumentNode<
	{ patientRenamed: { __typename: 'Patient'; id: string; name: string } },
	{ school: string }
>;

/** A transport whose subscription yields what `feed` pushes. */
function streaming() {
	const t = fakeTransport(() => ({ viewer: { id: '1' } }));
	const queue: unknown[] = [];
	let wake: (() => void) | undefined;
	let failure: unknown;
	const source: GraphQLTransport = {
		execute: t.execute,
		subscribe(_op, _vars, { signal }) {
			signal.addEventListener('abort', () => wake?.());
			return {
				async *[Symbol.asyncIterator]() {
					for (;;) {
						if (failure) throw failure;
						if (signal.aborted) return;
						if (queue.length) yield queue.shift() as never;
						else await new Promise<void>((r) => (wake = r));
					}
				},
			};
		},
	};
	return {
		source,
		calls: t.calls,
		feed(d: unknown) {
			queue.push(d);
			wake?.();
		},
		fail(e: unknown) {
			failure = e;
			wake?.();
		},
	};
}
const tick = () => new Promise<void>((r) => setTimeout(r, 5));

describe('riva.graphql.query', () => {
	test('returns the data, with a cache and a deduped fetch', async () => {
		const t = fakeTransport(() => ({ patients: 1 }));
		const riva = createRiva({ graphql: graphql(t) });
		const [a, b] = await Promise.all([
			riva.graphql.query(PATIENTS_QUERY, { school: 's' }),
			riva.graphql.query(PATIENTS_QUERY, { school: 's' }),
		]);
		expect(a).toEqual({ patients: 1 } as never);
		expect(b).toBe(a);
		expect(t.calls).toHaveLength(1);
		expect(t.calls[0]).toMatchObject({
			name: 'Patients',
			variables: { school: 's' },
		});
		await riva.graphql.query(PATIENTS_QUERY, { school: 'other' });
		expect(t.calls).toHaveLength(2);
	});

	test('a per-call staleTime keeps the data fresh', async () => {
		const t = fakeTransport(() => ({ viewer: { id: '1' } }));
		const riva = createRiva({ graphql: graphql(t) });
		await riva.graphql.query(VIEWER_QUERY);
		await riva.graphql.query(VIEWER_QUERY, undefined, { staleTime: '1m' });
		expect(t.calls).toHaveLength(1);
		await riva.graphql.query(VIEWER_QUERY);
		expect(t.calls).toHaveLength(2);
	});

	test('its signal aborts the call', async () => {
		const ctl = new AbortController();
		ctl.abort();
		const riva = createRiva({ graphql: graphql(fakeTransport()) });
		await expect(
			riva.graphql.query(VIEWER_QUERY, undefined, { signal: ctl.signal }),
		).rejects.toBeInstanceOf(Error);
	});

	test('definitions are memoised per riva and isolated between rivas', async () => {
		const t = fakeTransport(() => ({ viewer: { id: '1' } }));
		const ext = graphql(t);
		const a = createRiva({ graphql: ext });
		const b = createRiva({ graphql: ext });
		await a.graphql.query(VIEWER_QUERY, undefined, { staleTime: '1m' });
		await a.graphql.query(VIEWER_QUERY, undefined, { staleTime: '1m' });
		expect(t.calls).toHaveLength(1);
		await b.graphql.query(VIEWER_QUERY, undefined, { staleTime: '1m' });
		expect(t.calls).toHaveLength(2);
	});

	test('definitions keep working on the same riva', async () => {
		const t = fakeTransport(() => ({ viewer: { id: '1' } }));
		const riva = createRiva({ graphql: graphql(t) });
		const own = query(VIEWER_QUERY, { id: 'own', staleTime: '1m' });
		await own.ensure(riva);
		expect(riva.get(own).data).toEqual({ viewer: { id: '1' } });
		await riva.graphql.query(VIEWER_QUERY);
		expect(t.calls).toHaveLength(2);
	});
});

describe('riva.graphql.mutate', () => {
	test('returns the data and invalidates documents, definitions and targets', async () => {
		const t = fakeTransport((c) =>
			c.kind === 'mutation'
				? { renamePatient: { id: '1', name: 'Ana' } }
				: { viewer: { id: '1' } },
		);
		const riva = createRiva({ graphql: graphql(t) });
		const own = query(VIEWER_QUERY, { id: 'own' });
		await riva.graphql.query(VIEWER_QUERY, undefined, { staleTime: '1h' });
		await own.ensure(riva);
		const before = t.calls.length;
		const data = await riva.graphql.mutate(
			RENAME_PATIENT_MUTATION,
			{ id: '1', name: 'Ana' },
			{ invalidates: [VIEWER_QUERY, own] },
		);
		expect(data).toEqual({ renamePatient: { id: '1', name: 'Ana' } });
		expect(t.calls).toHaveLength(before + 1);
		await riva.graphql.query(VIEWER_QUERY, undefined, { staleTime: '1h' });
		expect(t.calls).toHaveLength(before + 2);
	});

	test('does not invalidate when it fails', async () => {
		const t = fakeTransport((c) => {
			if (c.kind === 'mutation') throw new Error('no');
			return { viewer: { id: '1' } };
		});
		const riva = createRiva({ graphql: graphql(t) });
		await riva.graphql.query(VIEWER_QUERY, undefined, { staleTime: '1h' });
		await expect(
			riva.graphql.mutate(
				RENAME_PATIENT_MUTATION,
				{ id: '1', name: 'A' },
				{ invalidates: [VIEWER_QUERY] },
			),
		).rejects.toThrow('no');
		await riva.graphql.query(VIEWER_QUERY, undefined, { staleTime: '1h' });
		expect(t.calls.filter((c) => c.kind === 'query')).toHaveLength(1);
	});

	test('a mutation definition runs on the same riva', async () => {
		const t = fakeTransport(() => ({ renamePatient: { id: '1', name: 'A' } }));
		const riva = createRiva({ graphql: graphql(t) });
		await mutation(RENAME_PATIENT_MUTATION).run(riva, { id: '1', name: 'A' });
		expect(t.calls).toHaveLength(1);
	});
});

describe('riva.graphql.subscribe', () => {
	test('passes each result to next, and stop ends it', async () => {
		const s = streaming();
		const riva = createRiva({ graphql: graphql(s.source) });
		const seen: unknown[] = [];
		const stop = riva.graphql.subscribe(
			SUB,
			{ school: 's' },
			{ next: (d) => seen.push(d) },
		);
		s.feed({ n: 1 });
		await tick();
		stop();
		s.feed({ n: 2 });
		await tick();
		expect(seen).toEqual([{ n: 1 }]);
	});

	test('a failure goes to error, mapped, and ends the stream', async () => {
		const s = streaming();
		const riva = createRiva({ graphql: graphql(s.source) });
		const errors: unknown[] = [];
		riva.graphql.subscribe(
			SUB,
			{ school: 's' },
			{ next() {}, error: (e) => errors.push(e) },
		);
		const boom = new Error('down');
		s.fail(boom);
		await tick();
		expect(errors).toEqual([boom]);
	});

	test('a stopped subscription reports no error', async () => {
		const s = streaming();
		const riva = createRiva({ graphql: graphql(s.source) });
		const errors: unknown[] = [];
		const stop = riva.graphql.subscribe(
			SUB,
			{ school: 's' },
			{ next() {}, error: (e) => errors.push(e) },
		);
		stop();
		s.fail(new Error('late'));
		await tick();
		expect(errors).toEqual([]);
	});

	test('merges each result into the entity cache with normalized()', async () => {
		const s = streaming();
		const riva = createRiva({
			graphql: graphql(s.source, { cache: normalized() }),
		});
		const seen: unknown[] = [];
		riva.graphql.subscribe(SUB, { school: 's' }, { next: (d) => seen.push(d) });
		s.feed({
			patientRenamed: { __typename: 'Patient', id: '1', name: 'Ana' },
		});
		await tick();
		expect(seen).toHaveLength(1);
		expect(readEntity(riva, 'Patient:1')).toMatchObject({ name: 'Ana' });
	});

	test('throws a RivaError when the transport cannot subscribe', () => {
		const riva = createRiva({ graphql: graphql(fakeTransport()) });
		expect(() =>
			riva.graphql.subscribe(SUB, { school: 's' }, { next() {} }),
		).toThrow(/cannot subscribe/);
		try {
			riva.graphql.subscribe(SUB, { school: 's' }, { next() {} });
		} catch (e) {
			expect(e).toBeInstanceOf(RivaError);
		}
	});

	test('refuses a document that is not a subscription', () => {
		const riva = createRiva({ graphql: graphql(streaming().source) });
		expect(() =>
			(riva.graphql.subscribe as (...a: unknown[]) => unknown)(VIEWER_QUERY, {
				next() {},
			}),
		).toThrow(/is a query/);
	});
});

describe('hardening', () => {
	test('a hand-made query(DOC) and riva.graphql.query(DOC) coexist on one riva', async () => {
		const t = fakeTransport(() => ({ viewer: { id: '1' } }));
		const riva = createRiva({ graphql: graphql(t) });
		const own = query(VIEWER_QUERY, { staleTime: '1h' });
		await own.ensure(riva);
		await riva.graphql.query(VIEWER_QUERY, undefined, { staleTime: '1h' });
		expect(t.calls).toHaveLength(2);
		expect(own.id).toBe('Viewer');
	});

	test('invalidates: a hand-made definition and a document are separate targets', async () => {
		const t = fakeTransport((c) =>
			c.kind === 'mutation'
				? { renamePatient: { id: '1', name: 'A' } }
				: { viewer: { id: '1' } },
		);
		const riva = createRiva({ graphql: graphql(t) });
		const own = query(VIEWER_QUERY, { staleTime: '1h' });
		await own.ensure(riva);
		await riva.graphql.query(VIEWER_QUERY, undefined, { staleTime: '1h' });
		await riva.graphql.mutate(
			RENAME_PATIENT_MUTATION,
			{ id: '1', name: 'A' },
			{ invalidates: [own] },
		);
		await own.ensure(riva);
		await riva.graphql.query(VIEWER_QUERY, undefined, { staleTime: '1h' });
		expect(t.calls.filter((c) => c.kind === 'query')).toHaveLength(3);
	});

	test('a bad invalidates entry throws before the mutation runs', async () => {
		const t = fakeTransport();
		const riva = createRiva({ graphql: graphql(t) });
		await expect(
			riva.graphql.mutate(
				RENAME_PATIENT_MUTATION,
				{ id: '1', name: 'A' },
				{ invalidates: [parse('{ a }') as never] },
			),
		).rejects.toThrow();
		expect(t.calls).toHaveLength(0);
	});

	test('stop calls return() even when the transport ignores the signal', async () => {
		let returned = 0;
		const source: GraphQLTransport = {
			execute: fakeTransport().execute,
			subscribe: () => ({
				[Symbol.asyncIterator]: () => ({
					next: () => new Promise<never>(() => {}),
					return: async () => {
						returned++;
						return { done: true, value: undefined };
					},
				}),
			}),
		};
		const riva = createRiva({ graphql: graphql(source) });
		const stop = riva.graphql.subscribe(SUB, { school: 's' }, { next() {} });
		stop();
		expect(returned).toBe(1);
	});

	test('complete runs when the stream ends on its own', async () => {
		const source: GraphQLTransport = {
			execute: fakeTransport().execute,
			subscribe: () =>
				(async function* () {
					yield { n: 1 } as never;
				})(),
		};
		const riva = createRiva({ graphql: graphql(source) });
		const log: string[] = [];
		riva.graphql.subscribe(
			SUB,
			{ school: 's' },
			{ next: () => log.push('next'), complete: () => log.push('complete') },
		);
		await tick();
		expect(log).toEqual(['next', 'complete']);
	});

	test('an error thrown by next is rethrown outside, not sent to error', async () => {
		const s = streaming();
		const riva = createRiva({ graphql: graphql(s.source) });
		const errors: unknown[] = [];
		const raised: unknown[] = [];
		const on = (e: unknown) => raised.push(e);
		const real = globalThis.queueMicrotask;
		globalThis.queueMicrotask = (f) => {
			try {
				f();
			} catch (e) {
				on(e);
			}
		};
		const boom = new Error('app bug');
		riva.graphql.subscribe(
			SUB,
			{ school: 's' },
			{
				next() {
					throw boom;
				},
				error: (e) => errors.push(e),
			},
		);
		s.feed({ n: 1 });
		await tick();
		globalThis.queueMicrotask = real;
		expect(raised).toEqual([boom]);
		expect(errors).toEqual([]);
	});

	test('an error thrown by error is raised outside, not unhandled', async () => {
		const s = streaming();
		const riva = createRiva({ graphql: graphql(s.source) });
		const raised: unknown[] = [];
		const on = (e: unknown) => raised.push(e);
		const real = globalThis.queueMicrotask;
		globalThis.queueMicrotask = (f) => {
			try {
				f();
			} catch (e) {
				on(e);
			}
		};
		const boom = new Error('in error');
		riva.graphql.subscribe(
			SUB,
			{ school: 's' },
			{
				next() {},
				error() {
					throw boom;
				},
			},
		);
		s.fail(new Error('down'));
		await tick();
		globalThis.queueMicrotask = real;
		expect(raised).toEqual([boom]);
	});

	test('graphql() takes a client, told apart by its mutate method', async () => {
		const calls: string[] = [];
		const client = {
			query: async () => {
				calls.push('query');
				return { viewer: { id: '1' } };
			},
			mutate: async () => {
				calls.push('mutate');
				return {};
			},
			subscribe: () => {
				calls.push('subscribe');
				return (async function* () {})();
			},
		};
		const riva = createRiva({ graphql: graphql(client as never) });
		await riva.graphql.query(VIEWER_QUERY);
		await riva.graphql.mutate(RENAME_PATIENT_MUTATION, { id: '1', name: 'A' });
		riva.graphql.subscribe(SUB, { school: 's' }, { next() {} })();
		expect(calls).toEqual(['query', 'mutate', 'subscribe']);
	});
});

test('install gives the riva its transport and a typed namespace', () => {
	const riva = createRiva({ graphql: graphql(fakeTransport()) });
	expectTypeOf(riva.graphql.query).toBeFunction();
	// @ts-expect-error `graphql` is only there when installed
	createRiva().graphql;
});

// Type tests only: nothing here runs.
const types = async () => {
	const riva = createRiva({ graphql: graphql(fakeTransport()) });
	const patients = await riva.graphql.query(PATIENTS_QUERY, { school: 's' });
	expectTypeOf(patients.patients.pageInfo.hasNextPage).toBeBoolean();
	const viewer = await riva.graphql.query(VIEWER_QUERY);
	expectTypeOf(viewer.viewer.id).toBeString();
	await riva.graphql.query(VIEWER_QUERY, undefined, { staleTime: '30s' });
	await riva.graphql.query(VIEWER_QUERY);
	// @ts-expect-error the variables are required and typed
	await riva.graphql.query(PATIENTS_QUERY);
	// @ts-expect-error wrong variables
	await riva.graphql.query(PATIENTS_QUERY, { school: 1 });
	// @ts-expect-error a duration
	await riva.graphql.query(VIEWER_QUERY, undefined, { staleTime: 'soon' });
	const renamed = await riva.graphql.mutate(RENAME_PATIENT_MUTATION, {
		id: '1',
		name: 'A',
	});
	expectTypeOf(renamed.renamePatient.name).toBeString();
	// @ts-expect-error wrong variables
	await riva.graphql.mutate(RENAME_PATIENT_MUTATION, { id: '1' });
	riva.graphql.subscribe(
		SUB,
		{ school: 's' },
		{
			next(d) {
				expectTypeOf(d.patientRenamed.name).toBeString();
			},
		},
	);
};
void types;
