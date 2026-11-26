import {
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
} from '@softistx/riva';
import { toRivaError } from './errors';
import type { RestTransport } from './transport';

/** The input of an untyped call: httpyz's shape. */
export interface RestInput {
	/** Values of the `{name}` placeholders of the path. */
	param?: Record<string, string | number | boolean>;
	/** Query string entries; `undefined` and `null` are left out, arrays repeat the key. */
	query?: Record<string, unknown>;
	/** The JSON body. */
	json?: unknown;
}

/** What `withRest({ baseUrl })` takes. */
export interface RestBaseOptions {
	/** Prepended to each path. */
	baseUrl: string;
	/** Default `globalThis.fetch`. */
	fetch?: (request: Request) => Promise<Response>;
	/** Sent with every request (a bearer token, say). */
	headers?: Record<string, string>;
}

function urlOf(base: string, path: string, input: RestInput): string {
	const filled = path.replace(/\{(\w+)\}/g, (_, name: string) => {
		const v = input.param?.[name];
		if (v === undefined)
			throw new RivaRequestError(
				'RIVA_VALIDATION',
				`riva-rest: ${path} needs param.${name}.`,
				{ retryable: false },
			);
		const text = String(v);
		let plain = text;
		try {
			plain = decodeURIComponent(text);
		} catch {}
		if (!text || !plain || plain === '.' || plain === '..')
			throw new RivaRequestError(
				'RIVA_VALIDATION',
				`riva-rest: param.${name} of ${path} must not be empty, "." or "..".`,
				{ retryable: false },
			);
		return encodeURIComponent(text);
	});
	const qs = new URLSearchParams();
	for (const [k, v] of Object.entries(input.query ?? {}))
		for (const x of Array.isArray(v) ? v : [v])
			if (x !== undefined && x !== null) qs.append(k, String(x));
	const q = qs.toString();
	return `${base.replace(/\/+$/, '')}${filled}${q ? `?${q}` : ''}`;
}

/**
 * A transport over `fetch` for an API with no spec: the path is the URL, the
 * input is httpyz's `{ param, query, json }`, the data is the JSON of the 2xx
 * reply (`undefined` for an empty one). A non-2xx reply throws `RivaHttpError`,
 * a failed request `RivaNetworkError`, an abort `RivaAbortError`.
 */
export function fetchTransport(options: RestBaseOptions): RestTransport {
	return {
		async call(route, input, { signal }) {
			const body = (input ?? {}) as RestInput;
			const headers = new Headers({
				accept: 'application/json',
				...options.headers,
			});
			if (body.json !== undefined)
				headers.set('content-type', 'application/json');
			const method = route.method.toUpperCase();
			const request = new Request(urlOf(options.baseUrl, route.path, body), {
				method,
				headers,
				signal,
				...(body.json !== undefined && { body: JSON.stringify(body.json) }),
			});
			let response: Response;
			try {
				response = await (options.fetch ?? fetch)(request);
			} catch (error) {
				const mapped = toRivaError(error, signal);
				throw mapped instanceof Error && mapped !== error
					? mapped
					: new RivaNetworkError(
							`${method} ${route.path}: ${(error as Error)?.message ?? 'request failed'}`,
							{ cause: error },
						);
			}
			if (!response.ok)
				throw new RivaHttpError(
					response.status,
					`${method} ${route.path}: HTTP ${response.status}`,
					{ cause: response },
				);
			const text = await response.text();
			if (!text) return undefined;
			try {
				return JSON.parse(text);
			} catch (cause) {
				throw new RivaRequestError(
					'RIVA_INVALID_RESPONSE',
					`${method} ${route.path}: the reply is not JSON.`,
					{ retryable: false, cause },
				);
			}
		},
	};
}
