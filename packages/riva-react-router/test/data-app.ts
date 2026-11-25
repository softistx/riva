/* biome-ignore-all lint/style/useNamingConvention: GraphQL's field names */
import type { RivaClient } from '@softistx/riva';
import { type GraphQLTransport, provideGraphQL } from '@softistx/riva-graphql';
import { bffTransport } from '@softistx/riva-graphql/bff';
import { buildAllowlist } from '@softistx/riva-graphql/codegen';
import { allowlist } from '@softistx/riva-graphql/server';
import { useClient, useQuery } from '@softistx/riva-react';
import { act, createElement as h, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
	createMemoryRouter,
	createStaticHandler,
	Outlet,
	RouterContextProvider,
	RouterProvider,
} from 'react-router';
import { PATIENTS, sleep } from './app';
import {
	RivaRouterProvider,
	type RivaRouterProviderProps,
} from '../src/provider';
import { dataRoute } from '../src/server/data-route';
import { rivaMiddleware } from '../src/server/index';

const SCHOOL = { school: 's' };

/** The documents the server's allowlist holds; the browser's `PATIENTS` is named `Patients`, so it matches. */
const MANIFEST = buildAllowlist(
	{
		'sha256:p':
			'query Patients($school: ID!) { patients(school: $school) { label } }',
		'sha256:r': 'mutation Rename($id: ID!) { rename(id: $id) { label } }',
	},
	{ ids: 'name' },
);

export interface ApiCall {
	name: string;
	session: string | null;
}

/**
 * A browser and its server in one process: the browser's `bffTransport` posts
 * to a `dataRoute` mounted behind `rivaMiddleware` (reached through the static
 * handler's `queryRoute`), whose `setup` gives the request client a fake API
 * stamped with the `x-session` header the browser sent.
 */
export function makeDataApp(
	opts: {
		provider?: Partial<RivaRouterProviderProps>;
		onAction?: (data: FormData) => unknown;
	} = {},
) {
	const api: ApiCall[] = [];
	let rev = 0;
	let loads = 0;
	const sessionApi = (session: string | null): GraphQLTransport => ({
		async execute(operation, variables) {
			api.push({ name: operation.name, session });
			await sleep(1);
			rev += 1;
			const vars = variables as { school?: string };
			return {
				rev,
				label: `${operation.name}:${vars.school}`,
				at: new Date(0),
			} as never;
		},
	});
	const data = dataRoute({ sources: [allowlist(MANIFEST)] });
	const handler = createStaticHandler([
		{
			id: 'root',
			path: '/',
			middleware: [
				rivaMiddleware({
					setup: (client, { request }) =>
						provideGraphQL(
							client,
							sessionApi(request.headers.get('x-session')),
						),
				}),
			],
			children: [
				{
					id: 'data',
					path: '_data',
					action: data.action,
					loader: data.loader,
				},
			],
		},
	]);
	/** What the browser's `fetch` does: the request goes through the server's route. */
	const serverFetch = ((url: string, init: RequestInit) => {
		const request = new Request(`http://app.test${url}`, init);
		return handler.queryRoute(request, {
			routeId: 'data',
			requestContext: new RouterContextProvider(),
			generateMiddlewareResponse: async (
				next: (r: Request) => Promise<unknown>,
			) => (await next(request)) as Response,
		} as never) as Promise<Response>;
	}) as typeof fetch;

	const seen: { client?: RivaClient } = {};
	let Page: () => ReactElement = () => h('p');
	const routes = [
		{
			id: 'root',
			path: '/',
			HydrateFallback: () => null,
			Component: () =>
				h(
					RivaRouterProvider,
					{
						setup: (client: RivaClient) =>
							provideGraphQL(
								client,
								bffTransport({
									fetch: serverFetch,
									headers: () => ({ 'x-session': 'abc' }),
								}),
							),
						...opts.provider,
					},
					h(Outlet),
				),
			children: [
				{
					id: 'page',
					index: true,
					loader: () => ++loads,
					action: async ({ request }: { request: Request }) =>
						opts.onAction?.(await request.formData()) ?? null,
					Component: () => Page(),
				},
				{
					id: 'other',
					path: 'other',
					loader: () => null,
					Component: () => h('p', null, 'other'),
				},
			],
		},
	];

	/** Mounts the app with `page` as its index route. */
	async function boot(page: () => ReactElement) {
		Page = page;
		const router = createMemoryRouter(routes, { initialEntries: ['/'] });
		const container = document.createElement('div');
		document.body.append(container);
		const dom = createRoot(container);
		await act(async () => dom.render(h(RouterProvider, { router })));
		await act(async () => sleep(20));
		return {
			router,
			text: (selector: string) =>
				container.querySelector(selector)?.textContent ?? '',
			click: async (selector: string) => {
				await act(async () => {
					(container.querySelector(selector) as HTMLElement).click();
				});
				await settle();
			},
			go: async (to: string) => {
				await act(async () => {
					void router.navigate(to);
				});
				await settle();
			},
			unmount: async () => {
				await act(async () => dom.unmount());
				container.remove();
			},
		};
	}

	return {
		api,
		boot,
		loads: () => loads,
		seen,
		/** The client the page rendered with. */
		client: (): RivaClient => {
			if (!seen.client) throw new Error('No page rendered yet.');
			return seen.client;
		},
		/** A page that shows `PATIENTS` and keeps its client for the spec. */
		Patients: (): ReactElement => {
			seen.client = useClient();
			const q = useQuery(PATIENTS, SCHOOL);
			return h('p', { id: 'patients' }, `${q.data?.label} #${q.data?.rev}`);
		},
		SCHOOL,
	};
}

/**
 * Waits outside `act`, so React renders each router state in turn (an `act`
 * scope batches them into one idle render, which no browser does).
 */
export async function settle(ms = 40, during?: () => unknown) {
	Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false);
	try {
		await during?.();
		await sleep(ms);
	} finally {
		Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
	}
}
