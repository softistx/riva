import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createGraphQLClient } from '@softistx/graphql-client';
import {
	RivaAbortError,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
} from '@softistx/riva';
import { parse } from 'graphql';
import { PATIENTS_QUERY, RENAME_PATIENT_MUTATION } from '../test/fixtures';
import { graphqlClientTransport } from './client-transport';
import { operationOf } from './operation';

type Handler = (body: Record<string, unknown>) => Response;
let handle: Handler = () => new Response();
const bodies: Record<string, unknown>[] = [];
let server: ReturnType<typeof Bun.serve>;
const servers: ReturnType<typeof Bun.serve>[] = [];

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
afterAll(async () => {
	await Promise.all([server, ...servers].map((s) => s.stop(true)));
});

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
	servers.push(dead);
	const url = `http://localhost:${dead.port}/`;
	await dead.stop(true);
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

test('a subscription yields each result and ends with the signal', async () => {
	const sse = (events: string[]) =>
		new Response(events.join(''), {
			headers: { 'content-type': 'text/event-stream' },
		});
	handle = () =>
		sse([
			'event: next\ndata: {"data":{"n":1}}\n\n',
			'event: next\ndata: {"data":{"n":2}}\n\n',
			'event: complete\ndata:\n\n',
		]);
	const t = transport();
	const Sub = operationOf(
		parse('subscription Ticks { n }') as never,
		'subscription',
	);
	const seen: unknown[] = [];
	for await (const d of t.subscribe?.(
		Sub,
		{},
		{ signal: new AbortController().signal },
	) ?? [])
		seen.push(d);
	expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
});

const PROFILE = parse(
	'query Profile { me { id ... @defer { name } } }',
) as never;

/** A multipart/mixed answer whose parts are written when the test says so. */
function multipart() {
	const enc = new TextEncoder();
	let out!: ReadableStreamDefaultController<Uint8Array>;
	const body = new ReadableStream<Uint8Array>({
		start(c) {
			out = c;
			c.enqueue(enc.encode('\r\n---'));
		},
	});
	const part = (json: unknown, last = false) =>
		out.enqueue(
			enc.encode(
				`\r\ncontent-type: application/json; charset=utf-8\r\n\r\n${JSON.stringify(json)}\r\n${last ? '-----\r\n' : '---'}`,
			),
		);
	const response = new Response(body, {
		headers: {
			'content-type': 'multipart/mixed; boundary="-"; deferSpec=20220824',
		},
	});
	return {
		response,
		first: () => part({ data: { me: { id: '1' } }, hasNext: true }),
		last: (errors?: unknown[]) =>
			part(
				{
					incremental: [
						{ data: { name: 'Ada' }, path: ['me'], ...(errors && { errors }) },
					],
					hasNext: false,
				},
				true,
			),
		close: () => out.close(),
	};
}
const tick = () => new Promise((r) => setTimeout(r, 20));

test('a deferred query publishes each part, then resolves with the final data', async () => {
	const m = multipart();
	handle = () => m.response;
	const parts: unknown[] = [];
	const done = transport().execute(
		operationOf(PROFILE),
		{},
		{
			signal: new AbortController().signal,
			onPart: (d) => void parts.push(d),
		},
	);
	m.first();
	await tick();
	expect(parts).toEqual([{ me: { id: '1' } }]);
	m.last();
	m.close();
	expect(await done).toEqual({ me: { id: '1', name: 'Ada' } } as never);
	expect(parts).toEqual([{ me: { id: '1' } }]);
});

test('a deferred query without onPart resolves with the final data', async () => {
	const m = multipart();
	handle = () => m.response;
	const done = send2(transport());
	m.first();
	m.last();
	m.close();
	expect(await done).toEqual({ me: { id: '1', name: 'Ada' } } as never);
});

const send2 = (t: ReturnType<typeof transport>, onPart?: () => void) =>
	t.execute(
		operationOf(PROFILE),
		{},
		{ signal: new AbortController().signal, ...(onPart && { onPart }) },
	);

test('a deferred query answered as plain JSON resolves with no part', async () => {
	handle = () => json({ data: { me: { id: '1', name: 'Ada' } } });
	const parts: unknown[] = [];
	const data = await send2(transport(), () => void parts.push(1));
	expect(data).toEqual({ me: { id: '1', name: 'Ada' } } as never);
	expect(parts).toEqual([]);
});

test('the signal closes a deferred request', async () => {
	const m = multipart();
	handle = () => m.response;
	const ctl = new AbortController();
	const parts: unknown[] = [];
	const done = transport()
		.execute(
			operationOf(PROFILE),
			{},
			{ signal: ctl.signal, onPart: (d) => void parts.push(d) },
		)
		.catch((x) => x);
	m.first();
	await tick();
	ctl.abort();
	expect(await done).toBeInstanceOf(RivaAbortError);
	expect(parts).toHaveLength(1);
});

test('a GraphQL error in the last part rejects as a plain query does', async () => {
	const m = multipart();
	handle = () => m.response;
	const done = send2(transport(), () => {}).catch((x) => x);
	m.first();
	m.last([{ message: 'late failure' }]);
	m.close();
	expect(await done).toBeInstanceOf(Error);
});

test('a plain query is not iterated and never calls onPart', async () => {
	handle = () => json({ data: { echo: 1 } });
	const parts: unknown[] = [];
	await transport().execute(
		operationOf(PATIENTS_QUERY),
		{ school: 's' },
		{ signal: new AbortController().signal, onPart: () => void parts.push(1) },
	);
	expect(parts).toEqual([]);
});
