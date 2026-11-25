# Errors

## What it is for

The transport maps `@softistx/graphql-client`'s errors to riva's, so `instanceof` holds and the core's retry policy applies. Never retried: a refusal, 4xx. Retried: 5xx, 408, 429, the network. An `ApiError` that carries no status is read as 400, so it is not retried.

| graphql-client | riva | `code` | retried |
|---|---|---|---|
| `ApiError` (the response had `errors`) | `RivaRequestError` | the API's `extensions.code`, untouched (`GRAPHQL_ERROR` when it sent none) | 5xx, 408, 429 |
| `ApiStatusError` | `RivaHttpError` | `HTTP_<status>` | 5xx, 408, 429 |
| `ApiUnavailableError` (unreachable, timeout) | `RivaNetworkError` | `RIVA_NETWORK` | yes |
| `ApiUnavailableError` (no data, no errors) | `RivaRequestError` | `RIVA_INVALID_RESPONSE` | no |
| the call's abort | `RivaAbortError` | `RIVA_ABORT` | never |

## Read the cause

The original error is the `cause`, with its `fields`, `params` and `errors`.

```ts
import { RivaRequestError } from '@softistx/riva';
import { isApiError } from '@softistx/graphql-client';

const state = riva.get(patients, { school: 'north' });
if (state.error instanceof RivaRequestError) {
	state.error.code; // 'patient.errors.not-found', as the API sent it
	if (isApiError(state.error.cause)) state.error.cause.fields; // the refused fields
}
```

## Codes this package throws

| Code | When |
|---|---|
| `RIVA_CACHE` | `normalized()` could not store or read a result (a non-JSON value, a selected field missing from a fetch). |
| `RIVA_INVALID_RESPONSE` | The transport got neither data nor errors. |

Fixes: [troubleshooting](../troubleshooting.md).

## Traps

- Match on `code`, not on the message: the API's code is passed untouched.
- `toRivaError(error, signal?)` is exported for a transport of your own; pass the signal so an abort becomes a `RivaAbortError`.
