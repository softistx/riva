# Errors

## What it is for

The transport and the free fetcher throw riva's errors, defined once in the core so `instanceof` holds, and the core's retry policy applies.

| httpyz | riva | `code` | retried |
|---|---|---|---|
| a status the spec declares, not 2xx | `RivaHttpError` (the reply is its `cause`) | `HTTP_404` | 5xx, 408, 429 |
| `UndeclaredStatusError`, `ReplyStatusError` | `RivaHttpError` | `HTTP_<status>` | 5xx, 408, 429 |
| `NetworkError`, `TimeoutError` | `RivaNetworkError` | `RIVA_NETWORK` | yes |
| `ValidationError` on the request | `RivaRequestError` | `RIVA_VALIDATION` | no |
| `ValidationError` on the reply | `RivaRequestError` | `RIVA_INVALID_RESPONSE` | no |
| the caller's abort | `RivaAbortError` | `RIVA_ABORT` | no |
| a transport with no OpenAPI client, or one that lacks the operation | `RivaRequestError` | `RIVA_REST_UNWIRED` | no |

## Branch on it

```ts
import { RivaHttpError } from '@softistx/riva';

const state = riva.get(invoice, { param: { id: '7' } });
if (state.error instanceof RivaHttpError && state.error.status === 404) {
	// not found
}
```

## Traps

- Only httpyz's own errors are mapped (they carry the `method` and `path` of their call): a `ValidationError` or a `TimeoutError` from another library passes through unchanged.
- `toRivaError(error, signal?)` is exported for your own transports; pass the signal so an abort becomes a `RivaAbortError`.

Fixes: [troubleshooting](../troubleshooting.md).
