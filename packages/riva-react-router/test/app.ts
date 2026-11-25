/* biome-ignore-all lint/style/useNamingConvention: GraphQL's field names */
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { type RivaClient, signal } from '@softistx/riva';
import {
	type GraphQLTransport,
	provideGraphQL,
	query,
} from '@softistx/riva-graphql';
import { useClient, useQuery } from '@softistx/riva-react';
import { parse } from 'graphql';
import { act, createElement as h, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToReadableStream } from 'react-dom/server';
import {
	createMemoryRouter,
	createStaticHandler,
	createStaticRouter,
	type NonIndexRouteObject,
	Outlet,
	type RouteObject,
	RouterContextProvider,
	RouterProvider,
	StaticRouterProvider,
	useParams,
} from 'react-router';
import { RivaRouterProvider, riva, rivaContext, rivaOf } from '../src/index';
import { rivaMiddleware } from '../src/server/index';

/**
 * The console errors a spy caught, minus React's "multiple renderers" notice:
 * react-dom/server leaves its marker on contexts the DOM renderer then shares
 * in this one process. Test-only noise.
 */
export const errorsOf = (spy: { mock: { calls: unknown[][] } }): string[] =>
	spy.mock.calls
		.map((c) => String(c[0]))
		.filter((m) => !m.includes('multiple renderers'));

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Page {
	rev: number;
	label: string;
}

export const PATIENTS = query(
	parse(
		'query Patients($school: ID!) { patients(school: $school) { label } }',
	) as TypedDocumentNode<Page, { school: string }>,
	{ staleTime: '1m' },
);
export const PATIENT = query(
	parse(
		'query Patient($id: ID!) { patient(id: $id) { label } }',
	) as TypedDocumentNode<Page, { id: string }>,
	{ staleTime: '1m' },
);

/** Shared with the loaders, the browser and the page: a named signal that travels, and a local one that does not. */
export const counter = signal(0, { name: 'counter', ssr: true });
export const local = signal('draft');

/** A transport that counts its calls and stamps each answer with a revision. */
export function fakeApi(delay: (school: string) => number = () => 0) {
	const calls: string[] = [];
	let rev = 0;
	const transport: GraphQLTransport = {
		async execute(operation, variables) {
			const vars = variables as { school?: string; id?: string };
			calls.push(operation.name);
			await sleep(delay(vars.school ?? vars.id ?? ''));
			rev += 1;
			return {
				rev,
				label: `${operation.name}:${vars.school ?? vars.id}`,
			} as never;
		},
	};
	return { calls, transport };
}

export type Api = ReturnType<typeof fakeApi>;

const SCHOOL = { school: 's' };

function Patients(): ReactElement {
	const q = useQuery(PATIENTS, SCHOOL);
	return h('p', { id: 'patients' }, `${q.data?.label} #${q.data?.rev}`);
}

/** The client the last page rendered with, for the specs to read. */
export const seen: { client?: RivaClient } = {};

function PatientPage(): ReactElement {
	seen.client = useClient();
	const q = useQuery(PATIENT, { id: useParams()['id'] ?? '' });
	return h('p', { id: 'patient' }, `${q.data?.label} #${q.data?.rev}`);
}

export interface AppOptions {
	server?: Api;
	browser?: Api;
	/** Runs inside the `/patients/:id` server loader, after its `await`s. */
	onPatient?: (id: string) => Promise<void> | void;
}

/** The routes of the fixture; `server` ones carry the middleware and the loaders, `browser` ones call `remote`. */
export function makeApp({
	server = fakeApi(),
	browser = fakeApi(),
	onPatient,
}: AppOptions = {}) {
	/** The `server` flag each provider mount's `setup` saw. */
	const envs: boolean[] = [];
	const root = (setupServer: boolean): NonIndexRouteObject => ({
		id: 'root',
		path: '/',
		...(setupServer && {
			middleware: [
				rivaMiddleware({
					setup: (client) => provideGraphQL(client, server.transport),
				}),
			],
		}),
		Component: () =>
			h(
				RivaRouterProvider,
				{
					setup: (client, env) => {
						envs.push(env.server);
						provideGraphQL(
							client,
							env.server ? server.transport : browser.transport,
						);
					},
				},
				h(Outlet),
			),
	});
	const loadPatients = async (client: RivaClient) => {
		await PATIENTS.ensure(client, SCHOOL);
	};
	const loadPatient = async (client: RivaClient, id: string) => {
		await PATIENT.ensure(client, { id });
		await onPatient?.(id);
	};
	/** What the server's loader answers a browser navigation: a fresh request client, then JSON. */
	const remote = async (load: (c: RivaClient) => Promise<void>) => {
		const context = new RouterContextProvider();
		await rivaMiddleware({
			setup: (client) => provideGraphQL(client, server.transport),
		})(
			{
				request: new Request('http://app.test/'),
				context,
				params: {},
			} as never,
			(async () => {
				await load(rivaOf(context));
				return new Response();
			}) as never,
		);
		return JSON.parse(JSON.stringify(riva(context)));
	};
	const serverRoutes: RouteObject[] = [
		{
			...root(true),
			children: [
				{
					id: 'patients',
					path: 'patients',
					Component: Patients,
					loader: async ({ context }) => {
						await loadPatients(rivaOf(context));
						return riva(context);
					},
				},
				{
					id: 'patient',
					path: 'patients/:id',
					Component: PatientPage,
					loader: async ({ context, params }) => {
						await loadPatient(rivaOf(context), params['id'] ?? '');
						return riva(context);
					},
				},
			],
		},
	];
	const browserRoutes: RouteObject[] = [
		{
			...root(false),
			children: [
				{
					id: 'patients',
					path: 'patients',
					Component: Patients,
					loader: () => remote(loadPatients),
				},
				{
					id: 'patient',
					path: 'patients/:id',
					Component: PatientPage,
					loader: ({ params }) =>
						remote((c) => loadPatient(c, params['id'] ?? '')),
				},
			],
		},
	];

	/** A document request through the static handler, the middleware wrapping the loaders and the render. */
	async function serve(url: string) {
		const handler = createStaticHandler(serverRoutes);
		const context = new RouterContextProvider();
		const request = new Request(`http://app.test${url}`);
		let html = '';
		let loaderData: Record<string, unknown> = {};
		// A server has no `document`: hide happy-dom's so the provider takes its
		// server branch, as in production.
		hideDocument();
		try {
			await handler.query(request, {
				requestContext: context,
				generateMiddlewareResponse: async (next) => {
					const result = await next(request);
					if (result instanceof Response) return result;
					loaderData = JSON.parse(JSON.stringify(result.loaderData));
					const router = createStaticRouter(handler.dataRoutes, result);
					const stream = await renderToReadableStream(
						h(StaticRouterProvider, {
							router,
							context: result,
							hydrate: false,
						}),
					);
					await stream.allReady;
					html = await new Response(stream).text();
					return new Response(html);
				},
			});
		} finally {
			restoreDocument();
		}
		return { html, loaderData, client: context.get(rivaContext) };
	}

	/** The browser: a memory router hydrated with what a document request carried. */
	async function boot(url: string, loaderData: Record<string, unknown>) {
		const router = createMemoryRouter(browserRoutes, {
			initialEntries: [url],
			hydrationData: { loaderData },
		});
		const container = document.createElement('div');
		document.body.append(container);
		const dom = createRoot(container);
		await act(async () => dom.render(h(RouterProvider, { router })));
		return {
			router,
			text: (selector: string) =>
				container.querySelector(selector)?.textContent ?? '',
			go: (to: string) =>
				act(async () => {
					await router.navigate(to);
					await sleep(5);
				}),
			revalidate: () =>
				act(async () => {
					await router.revalidate();
					await sleep(5);
				}),
			unmount: async () => {
				await act(async () => dom.unmount());
				container.remove();
			},
		};
	}

	return { server, browser, envs, serverRoutes, browserRoutes, serve, boot };
}

// Overlapping serve() calls (Promise.all) share one hidden document: a depth
// counter restores it only when the last one ends.
const g = globalThis as { document?: unknown };
let hidden = 0;
let saved: unknown;
function hideDocument() {
	if (hidden++ === 0) {
		saved = g.document;
		delete g.document;
	}
}
function restoreDocument() {
	if (--hidden === 0) g.document = saved;
}
