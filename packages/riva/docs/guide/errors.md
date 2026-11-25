# Errors

Every error riva throws is defined once here, so `instanceof` holds across packages. The adapters throw these classes; they never define their own. Keep one copy of `@softistx/riva` in the tree.

```ts
import { RivaError, RivaHttpError, RivaRequestError } from '@softistx/riva';

const state = riva.get(user, { id: '1' });
if (state.error instanceof RivaHttpError && state.error.status === 404) {
	// not found
} else if (state.error instanceof RivaRequestError && state.error.retryable) {
	// a retry may help
} else if (state.error instanceof RivaError) {
	console.log(state.error.code);
}
```

| Class | `code` | Notes |
| --- | --- | --- |
| `RivaError` | any | Base class; has `code`. |
| `RivaScopeError` | `RIVA_SCOPE` | A read with no riva in scope. |
| `RivaRequestError` | any | `status?`, `retryable`, `cause`. A failed request. |
| `RivaHttpError(status)` | `HTTP_<status>` | Retryable for 5xx, 408 and 429. |
| `RivaNetworkError` | `RIVA_NETWORK` | Retryable. |
| `RivaAbortError` | `RIVA_ABORT` | Never retried. |

Other codes thrown as `RivaError`: `RIVA_CYCLE`, `RIVA_LOOP`, `RIVA_DURATION`, `RIVA_KEY`, `RIVA_CACHE`, `RIVA_STORE`, `RIVA_SSR`. `RIVA_INVALID_RESPONSE` and `RIVA_UNKNOWN` are carried by `RivaRequestError` (a transport answer that is not valid) and by an SSR snapshot (an error that was not a `RivaError`). The adapters add `RIVA_DEFINITION` (a misused definition), `RIVA_VALIDATION`, `RIVA_REST_UNWIRED` and `RIVA_DATA_*`. Each has an entry by its message in [troubleshooting](../troubleshooting.md).

Listeners and effects that throw never stop the others: every notification runs, then the single error is rethrown as is, and several become an `AggregateError`.

Errors travel in an SSR snapshot as codes, with an empty message (see [ssr](./ssr.md)).
