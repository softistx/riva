import { expect, test } from 'bun:test';
import {
	createRivaClient,
	RivaHttpError,
	RivaRequestError,
} from '@softistx/riva';
import {
	provideRest,
	type RestTransport,
	type Route,
} from '@softistx/riva-rest';
import { bffTransport } from '@softistx/riva-rest/bff';
import { operations } from '@softistx/riva-rest/server';
import { RouterContextProvider } from 'react-router';
import { rivaContext } from '../context';
import { dataRoute } from './data-route';

const param = { name: 'id', in: 'path', required: true };
/** An OpenAPI client's operation table, as `createOpenApiClient` exposes it. */
const api = {
	operations: {
		getInvoice: { method: 'get', path: '/invoices/{id}', parameters: [param] },
		boom: { method: 'get', path: '/boom', parameters: [] },
	},
};

/** The server: a request client whose REST transport is the API, behind the /_data route; the browser's client posts to it. */
function setup() {
	const calls: Array<{ route: Route; input: unknown }> = [];
	const server = createRivaClient();
	provideRest(server, {
		async call(route, input) {
			calls.push({ route, input });
			if (route.operationId === 'boom')
				throw new RivaHttpError(409, 'Conflict');
			return { id: '7', at: new Date(0) };
		},
	});
	const context = new RouterContextProvider();
	context.set(rivaContext, server);
	const route = dataRoute({ sources: [operations(api)] });
	const browser = bffTransport({
		fetch: (async (url: string, init: RequestInit) =>
			route.action({
				request: new Request(`http://app.test${url}`, init),
				context,
			})) as never,
	});
	return { calls, browser };
}

const call = (browser: RestTransport, operationId: string, input?: unknown) =>
	browser.call(
		{ method: 'get', path: '/x', operationId, hasInput: input !== undefined },
		input,
		{ signal: new AbortController().signal },
	);

test('an operation runs from the browser through /_data on the server transport, Dates both ways', async () => {
	const { calls, browser } = setup();
	const data = (await call(browser, 'getInvoice', {
		param: { id: '7' },
		query: { since: new Date(1) },
	})) as { id: string; at: Date };
	expect(data.id).toBe('7');
	expect(data.at).toBeInstanceOf(Date);
	expect(calls[0]?.route).toEqual({
		method: 'get',
		path: '/invoices/{id}',
		operationId: 'getInvoice',
		hasInput: true,
	});
	const sent = calls[0]?.input as { query: { since: Date } };
	expect(sent.query.since).toEqual(new Date(1));
});

test('an operation the spec lacks is the route 404; an API error keeps its status', async () => {
	const { browser } = setup();
	const unknown = (await call(browser, 'nope').catch(
		(e: unknown) => e,
	)) as RivaRequestError;
	expect(unknown).toBeInstanceOf(RivaRequestError);
	expect([unknown.code, unknown.status]).toEqual(['RIVA_DATA_UNKNOWN', 404]);
	const boom = (await call(browser, 'boom').catch(
		(e: unknown) => e,
	)) as RivaRequestError;
	expect(boom).toBeInstanceOf(RivaRequestError);
	expect(boom.status).toBe(409);
});
