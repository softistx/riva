/* biome-ignore-all lint/style/useNamingConvention: React Router's ServerBuild shape */
import { expect, test } from 'bun:test';
import { createElement as h } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import {
	createRequestHandler,
	type EntryContext,
	Outlet,
	RouterContextProvider,
	type ServerBuild,
	ServerRouter,
} from 'react-router';
import { riva, rivaOf } from '../index';
import { rivaMiddleware } from './index';

// One hand-made ServerBuild: the real request handler, its middleware chain,
// the document render and a single-fetch `.data` request. React Router minors
// may change this shape; the other specs do not depend on it.
const build = {
	entry: {
		module: {
			default: async (
				request: Request,
				status: number,
				headers: Headers,
				context: EntryContext,
			) => {
				const stream = await renderToReadableStream(
					h(ServerRouter, { context, url: request.url }),
				);
				await stream.allReady;
				headers.set('content-type', 'text/html');
				return new Response(stream, { status, headers });
			},
		},
	},
	routes: {
		root: {
			id: 'root',
			path: '',
			index: undefined,
			caseSensitive: undefined,
			parentId: undefined,
			module: {
				default: () => h(Outlet),
				middleware: [rivaMiddleware()],
			},
		},
		page: {
			id: 'page',
			path: 'x',
			index: undefined,
			caseSensitive: undefined,
			parentId: 'root',
			module: {
				default: () => h('p', null, 'page'),
				loader: ({ context }: { context: Readonly<RouterContextProvider> }) => {
					rivaOf(context);
					return { hello: 'world', ...riva(context) };
				},
			},
		},
	},
	assets: {
		entry: { imports: [], module: '' },
		routes: {
			root: {
				id: 'root',
				module: '',
				imports: [],
				hasAction: false,
				hasLoader: false,
				hasClientAction: false,
				hasClientLoader: false,
				hasClientMiddleware: false,
				hasErrorBoundary: false,
			},
			page: {
				id: 'page',
				parentId: 'root',
				path: 'x',
				module: '',
				imports: [],
				hasAction: false,
				hasLoader: true,
				hasClientAction: false,
				hasClientLoader: false,
				hasClientMiddleware: false,
				hasErrorBoundary: false,
			},
		},
		url: '',
		version: '1',
	},
	basename: '/',
	publicPath: '/',
	assetsBuildDirectory: 'build',
	future: {},
	ssr: true,
	isSpaMode: false,
	prerender: [],
	routeDiscovery: { mode: 'initial' },
} as unknown as ServerBuild;

const handler = createRequestHandler(build, 'production');
const load = () => new RouterContextProvider();

test('a document request runs the middleware and the loader', async () => {
	const res = await handler(new Request('http://app.test/x'), load());
	expect(res.status).toBe(200);
	expect(await res.text()).toContain('<p>page</p>');
});

test('a single-fetch .data request carries the snapshot', async () => {
	const res = await handler(new Request('http://app.test/x.data'), load());
	expect(res.status).toBe(200);
	const body = await res.text();
	expect(body).toContain('~riva');
	expect(body).toContain('world');
});
