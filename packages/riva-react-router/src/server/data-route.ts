import {
	type DataOperation,
	type DataSource,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
} from '@softistx/riva';
import { decode, encode } from '@softistx/riva/ssr';
import type { RouterContextProvider } from 'react-router';
import { rivaOf } from '../context';

export type { DataOperation, DataSource };

/** The codes of the route's own refusals. */
export type DataRouteCode =
	| 'RIVA_DATA_METHOD'
	| 'RIVA_DATA_CROSS_SITE'
	| 'RIVA_DATA_MEDIA_TYPE'
	| 'RIVA_DATA_TOO_LARGE'
	| 'RIVA_DATA_BAD_REQUEST'
	| 'RIVA_DATA_UNKNOWN'
	| 'RIVA_DATA_INTERNAL';

export interface DataRouteOptions {
	/** Asked in order; the first that knows the id runs it. */
	sources: readonly DataSource[];
	/** The one origin allowed to call, e.g. behind a proxy. Default: the request's own origin. */
	origin?: string | (() => string | undefined);
	/** The largest body read, in bytes. Default 262144. */
	maxBytes?: number;
	/** Called with what an operation threw that the browser does not see in full: a 500, or a network or HTTP failure of the API (the browser gets a generic message). */
	onError?: (error: unknown, request: Request) => void;
}

export interface DataRoute {
	action(args: {
		request: Request;
		context: Readonly<RouterContextProvider>;
	}): Promise<Response>;
	/** A GET (or any loader call) is refused with 405. */
	loader(): Response;
}

const refusal = (
	status: number,
	code: DataRouteCode | (string & {}),
	message: string,
	headers?: HeadersInit,
) =>
	Response.json(
		{ error: { code, message, status } },
		{ status, headers: { 'cache-control': 'no-store', ...headers } },
	);

const notPost = () =>
	refusal(405, 'RIVA_DATA_METHOD', 'Use POST.', { allow: 'POST' });

/** `null` when the body went over `max` bytes. */
async function readText(request: Request, max: number): Promise<string | null> {
	const declared = Number(request.headers.get('content-length'));
	if (declared > max) return null;
	const reader = request.body?.getReader();
	if (!reader) return '';
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > max) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const all = new Uint8Array(size);
	let at = 0;
	for (const c of chunks) {
		all.set(c, at);
		at += c.byteLength;
	}
	return new TextDecoder().decode(all);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** True when the request does not come from the allowed origin or site. */
function crossSite(request: Request, opts: DataRouteOptions): boolean {
	const allowed =
		(typeof opts.origin === 'function' ? opts.origin() : opts.origin) ??
		new URL(request.url).origin;
	const origin = request.headers.get('origin');
	const site = request.headers.get('sec-fetch-site');
	return (
		(origin !== null && origin !== allowed) ||
		(site !== null && site !== 'same-origin' && site !== 'none')
	);
}

const badRequest = () =>
	refusal(
		400,
		'RIVA_DATA_BAD_REQUEST',
		'Send { "id": string, "variables"?: object }.',
	);

/** The body's id and decoded variables, or the refusal to send. */
function parseBody(
	text: string,
): { id: string; variables: unknown } | Response {
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return badRequest();
	}
	if (
		!isRecord(body) ||
		typeof body['id'] !== 'string' ||
		(body['variables'] !== undefined && !isRecord(body['variables']))
	)
		return badRequest();
	try {
		return { id: body['id'], variables: decode(body['variables']) };
	} catch {
		return badRequest();
	}
}

/** What an operation threw, as the response the browser gets. */
function failure(
	error: unknown,
	request: Request,
	opts: DataRouteOptions,
): Response {
	const report = () => {
		try {
			opts.onError?.(error, request);
		} catch {
			// A failing logger must not turn a 500 into a crash.
		}
	};
	if (error instanceof RivaRequestError) {
		const status =
			error.status !== undefined && error.status >= 400 && error.status <= 599
				? error.status
				: 502;
		// A network or HTTP failure of the API carries its own wording (a URL,
		// a proxy page): the browser gets the code and a generic message.
		if (error instanceof RivaNetworkError || error instanceof RivaHttpError) {
			report();
			return refusal(status, error.code, 'The API is unavailable.');
		}
		return refusal(status, error.code, error.message);
	}
	report();
	return refusal(500, 'RIVA_DATA_INTERNAL', 'Internal error.');
}

/**
 * The route behind `bffTransport`: it runs the allowlisted operations the
 * browser names, on the request's client (so with the session `setup` gave
 * it). The id picks an operation from the `sources`; the browser never sends
 * a document. Refusals come back as `{ error: { code, message, status } }` in
 * this order: method, same-site, media type, size, shape, unknown id.
 */
export function dataRoute(opts: DataRouteOptions): DataRoute {
	const max = opts.maxBytes ?? 262144;
	return {
		loader: notPost,
		async action({ request, context }) {
			if (request.method !== 'POST') return notPost();
			if (crossSite(request, opts))
				return refusal(
					403,
					'RIVA_DATA_CROSS_SITE',
					'Cross-site requests are refused.',
				);
			if (
				!/^application\/json\s*(;|$)/i.test(
					request.headers.get('content-type') ?? '',
				)
			)
				return refusal(415, 'RIVA_DATA_MEDIA_TYPE', 'Send application/json.');
			const text = await readText(request, max);
			if (text === null)
				return refusal(
					413,
					'RIVA_DATA_TOO_LARGE',
					`The body is over ${max} bytes.`,
				);
			const body = parseBody(text);
			if (body instanceof Response) return body;
			let op: DataOperation | undefined;
			for (const source of opts.sources) {
				op = source.find(body.id);
				if (op) break;
			}
			if (!op) return refusal(404, 'RIVA_DATA_UNKNOWN', 'Unknown operation.');
			try {
				const data = await op.run(
					rivaOf(context),
					body.variables,
					request.signal,
				);
				return Response.json(
					{ data: encode(data) },
					{ headers: { 'cache-control': 'no-store' } },
				);
			} catch (error) {
				return failure(error, request, opts);
			}
		},
	};
}
