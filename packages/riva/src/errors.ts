/** Base of every error riva throws. Defined once here so `instanceof` holds across packages. */
export class RivaError extends Error {
	readonly code: string;
	constructor(code: string, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'RivaError';
		this.code = code;
	}
}

/** A value was read with no `RivaClient` in scope. */
export class RivaScopeError extends RivaError {
	constructor(message: string) {
		super('RIVA_SCOPE', message);
		this.name = 'RivaScopeError';
	}
}

/** A request failed. `retryable` tells the query engine whether trying again can help. */
export class RivaRequestError extends RivaError {
	readonly status: number | undefined;
	readonly retryable: boolean;
	constructor(
		code: string,
		message: string,
		options: { retryable: boolean; status?: number; cause?: unknown },
	) {
		super(code, message, { cause: options.cause });
		this.name = 'RivaRequestError';
		this.status = options.status;
		this.retryable = options.retryable;
	}
}

/** An HTTP error status. Retryable for 5xx, 408 and 429. */
export class RivaHttpError extends RivaRequestError {
	constructor(status: number, message?: string, options?: { cause?: unknown }) {
		super(`HTTP_${status}`, message ?? `HTTP ${status}`, {
			status,
			retryable: status >= 500 || status === 408 || status === 429,
			cause: options?.cause,
		});
		this.name = 'RivaHttpError';
	}
}

/** The network failed before any response. Always retryable. */
export class RivaNetworkError extends RivaRequestError {
	constructor(message = 'Network error', options?: { cause?: unknown }) {
		super('RIVA_NETWORK', message, { retryable: true, cause: options?.cause });
		this.name = 'RivaNetworkError';
	}
}

/** A request was aborted. Never retried. */
export class RivaAbortError extends RivaError {
	constructor(message = 'The request was aborted.') {
		super('RIVA_ABORT', message);
		this.name = 'RivaAbortError';
	}
}
