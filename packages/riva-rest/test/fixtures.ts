import { createHttpClient, type HttpClient } from '@softistx/httpyz';
import {
	createOpenApiClient,
	type OperationTable,
} from '@softistx/openapi-httpyz';
import { operationOf } from '../src/operation';
import type { RestTransport } from '../src/transport';

export interface Invoice {
	id: string;
	number: string;
	total: number;
}

type Reply<S extends number, D> = {
	status: S;
	type: string | undefined;
	data: D;
};

/** What `@softistx/openapi-codegen` writes for a small invoices spec, by hand. */
export interface ClientOperations {
	getInvoice: {
		method: 'get';
		path: '/invoices/{id}';
		args: [input: { param: { id: string } }];
		reply: Reply<200, Invoice> | Reply<404, { title: string }>;
		wire: Reply<200, Invoice> | Reply<404, { title: string }>;
	};
	listInvoices: {
		method: 'get';
		path: '/invoices';
		args: [input?: { query?: { page?: number } }];
		reply: Reply<200, { items: Invoice[] }>;
		wire: Reply<200, { items: Invoice[] }>;
	};
	createInvoice: {
		method: 'post';
		path: '/invoices';
		args: [input: { json: { number: string; total: number } }];
		reply: Reply<201, Invoice>;
		wire: Reply<201, Invoice>;
	};
	health: {
		method: 'get';
		path: '/health';
		args: [];
		reply: Reply<200, { ok: boolean }>;
		wire: Reply<200, { ok: boolean }>;
	};
	deleteInvoice: {
		method: 'delete';
		path: '/invoices/{id}';
		args: [input: { param: { id: string } }];
		reply: Reply<204, undefined>;
		wire: Reply<204, undefined>;
	};
}

const media = { 'application/json': { kind: 'json' as const } };
const param = (name: string, where: 'path' | 'query') => ({
	name,
	in: where,
	required: where === 'path',
	explode: true,
	list: false,
});

export const operations = {
	getInvoice: {
		method: 'get',
		path: '/invoices/{id}',
		parameters: [param('id', 'path')],
		responses: { 200: media, 404: media },
	},
	listInvoices: {
		method: 'get',
		path: '/invoices',
		parameters: [param('page', 'query')],
		responses: { 200: media },
	},
	createInvoice: {
		method: 'post',
		path: '/invoices',
		parameters: [],
		body: { required: true, content: media },
		responses: { 201: media },
	},
	health: {
		method: 'get',
		path: '/health',
		parameters: [],
		responses: { 200: media },
	},
	deleteInvoice: {
		method: 'delete',
		path: '/invoices/{id}',
		parameters: [param('id', 'path')],
		responses: { 204: {} },
	},
} as unknown as OperationTable<ClientOperations>;

export type Handler = (req: Request) => Response | Promise<Response>;

export const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});

/** An httpyz client answering through `handle`, no server. */
export const httpWith = (handle: Handler, options: object = {}): HttpClient =>
	createHttpClient({ baseUrl: 'http://api.test', fetch: handle, ...options });

export const apiOver = (http: HttpClient) =>
	createOpenApiClient(http, operations, { validate: false, decode: false });

export const fakeTransport = (
	call: RestTransport['call'] = async () => undefined,
): RestTransport => ({ call });

/** The `Route` a definition hands the transport for `'<method> <path>'`. */
export const routeOf = (route: string) =>
	operationOf(
		{ operations } as never,
		route as never,
		/^(get|head|options) /.test(route) ? 'query' : 'mutation',
	);
