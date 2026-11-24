import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createGraphQLClient } from '@softistx/graphql-client';
import {
	RivaAbortError,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
} from '@softistx/riva';
import { PATIENTS_QUERY, RENAME_PATIENT_MUTATION } from '../test/fixtures';
import { graphqlClientTransport } from './client-transport';
import { operationOf } from './operation';

type Handler = (body: Record<string, unknown>) => Response;
let handle: Handler = () => new Response();
const bodies: Record<string, unknown>[] = [];
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
	server = Bun.serve({
		port: 0,
		async fetch(req) {
			const body = (await req.json()) as Record<string, unknown>;
			bodies.push(body);
			return handle(body);
		},
	});
});
afterAll(() => server.stop(true));

const transport = (options: object = {}) =>
	graphqlClientTransport(
		createGraphQLClient({
			url: `http://localhost:${server.port}/`,
			...options,
		}),
	);
const send = (
	t: ReturnType<typeof transport>,
	signal = new AbortController().signal,
) => t.execute(operationOf(PATIENTS_QUERY), { school: 's' }, { signal });
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});

test('runs a query and a mutation and returns data', async () => {
	handle = (b) => json({ data: { echo: b['operationName'] } });
	const t = transport();
	const q = await send(t);
	const m = await t.execute(
		operationOf(RENAME_PATIENT_MUTATION),
		{ id: '1', name: 'A' },
		{ signal: new AbortController().signal },
	);
	expect(q).toEqual({ echo: 'Patients' } as never);
	expect(m).toEqual({ echo: 'RenamePatient' } as never);
	expect(bodies.at(-2)?.['variables']).toEqual({ school: 's' });
	expect(bodies.at(-1)?.['query']).toContain('mutation RenamePatient');
});

test('sends the persisted id when the client is configured for it', async () => {
	handle = () => json({ data: {} });
	const hashed = Object.assign(
		Object.create(Object.getPrototypeOf(PATIENTS_QUERY)),
		PATIENTS_QUERY,
		{ __meta__: { hash: 'h-patients' } },
	);
	await transport({ persisted: { mode: 'documentId' } }).execute(
		operationOf(hashed),
		{ school: 's' },
		{ signal: new AbortController().signal },
	);
	expect(bodies.at(-1)).toMatchObject({ documentId: 'h-patients' });
	expect(bodies.at(-1)?.['query']).toBeUndefined();
});

test('a GraphQL error keeps its API code', async () => {
	handle = () =>
		json({
			errors: [
				{ message: 'No', extensions: { code: 'patient.errors.denied' } },
			],
		});
	const e = (await send(transport()).catch((x) => x)) as RivaRequestError;
	expect(e).toBeInstanceOf(RivaRequestError);
	expect([e.code, e.retryable]).toEqual(['patient.errors.denied', false]);
});

test('a bare error status is a RivaHttpError', async () => {
	handle = () => new Response('bad gateway', { status: 502 });
	const e = (await send(transport()).catch((x) => x)) as RivaHttpError;
	expect(e).toBeInstanceOf(RivaHttpError);
	expect([e.status, e.retryable]).toEqual([502, true]);
});

test('an unreachable API is a RivaNetworkError', async () => {
	const dead = Bun.serve({ port: 0, fetch: () => new Response() });
	const url = `http://localhost:${dead.port}/`;
	dead.stop(true);
	const t = graphqlClientTransport(createGraphQLClient({ url }));
	const e = await send(t).catch((x) => x);
	expect(e).toBeInstanceOf(RivaNetworkError);
});

test('an abort is a RivaAbortError', async () => {
	handle = () => json({ data: {} });
	const ctl = new AbortController();
	const p = send(transport(), ctl.signal).catch((x) => x);
	ctl.abort();
	expect(await p).toBeInstanceOf(RivaAbortError);
});
