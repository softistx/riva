# The data route riva: `@softistx/riva/data`

The browser's side of a `/_data` route, shared by the adapters' `bffTransport` (`@softistx/riva-graphql/bff`, `@softistx/riva-rest/bff`). Import it only to write a transport of your own.

```ts
import { type BffTransportOptions, postData } from '@softistx/riva/data';

const options: BffTransportOptions = { url: '/_data', headers: () => ({ 'x-csrf': token() }) };
const data = await postData(options, 'rest:getInvoice', { param: { id: '7' } }, signal);
```

## `postData(opts, id, variables, signal?)`

Posts `{ id, variables }` (variables in the SSR codec, so Dates travel) with same-origin cookies, and returns the decoded `{ data }`.

| `opts` field | Default | Effect |
| --- | --- | --- |
| `url` | `'/_data'` | The `dataRoute` URL. |
| `fetch` | the global `fetch`, read at each call | A fetch of your own. |
| `headers` | none | A function returning `HeadersInit`, called at each request (a CSRF token). |

## Errors

| Case | Thrown |
| --- | --- |
| The route's `{ error: { code, message, status } }` | `RivaRequestError` with that `code` and `status`, retryable for 5xx, 408 and 429 |
| An error status with no such body | `RivaHttpError` |
| A failed fetch | `RivaNetworkError` |
| An abort | `RivaAbortError` |
| A body that is not the route's JSON | `RivaRequestError` `RIVA_INVALID_RESPONSE` |

## Writing a transport

A transport for `provideGraphQL` or `provideRest` that posts to the route calls `postData(opts, operationId, variables, signal)` and returns the result. The server half is `dataRoute` from `@softistx/riva-react-router/server`.

Exports: `postData` and the type `BffTransportOptions`.
