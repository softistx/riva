# Troubleshooting

Each entry is headed by the message you will see.

## No RivaClient in scope

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** `atom.get()`, `.set()`, `.subscribe()` or `computed.get()` ran outside any client, on the server or in a browser with no default client.

**Why:** definitions are stateless and hold no value; values live in a `RivaClient`. A module-level client on the server would leak between requests, so none is assumed.

**Fix:** read through the client, or run the code inside it.

```ts
const client = createRivaClient(); // one per request on the server
client.get(count);
client.run(() => count.get());
```

## setDefaultClient is browser-only

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** `setDefaultClient(client)` ran where there is no `document`, that is on the server.

**Why:** a default client is module-level state; shared between requests it would mix one user's values into another's.

**Fix:** call it only in browser code. On the server, use the per-request client with `client.run(() => …)`. `setDefaultClient(undefined)` clears the default in a browser.

```ts
if (typeof document !== 'undefined') setDefaultClient(createRivaClient());
```

## Cycle detected

Code: `RIVA_CYCLE`.

**When:** a computed reads itself, directly or through other computeds.

**Why:** its value would depend on itself and can never settle.

**Fix:** break the loop: derive from atoms, or move one side to an atom you set explicitly. Name computeds (`computed(fn, { name })`) so the message names the culprit.

```ts
const total = computed((get) => get(price) * get(quantity)); // not get(total)
```

## Loop detected

Code: `RIVA_LOOP`.

**When:** a node re-ran more than 100 times in one flush, typically an effect or subscriber that writes a source it reads.

**Why:** each write re-triggers the node, so the flush never ends. The loop is cut and the error is thrown after the other notifications ran.

**Fix:** make the write converge (guard it with a condition), write to a different atom, or read the source with `untracked`. Name the node with `{ name }` to find it.

```ts
client.effect(() => {
	const n = client.get(count);
	if (n < 5) client.set(count, n + 1); // converges
});
```

## Invalid duration

Code: `RIVA_DURATION` (`RivaError`).

**When:** an option such as `staleTime`, `gcTime` or `refetchEvery` got a value it cannot read, at the `query({...})` call.

**Why:** a duration is a non-negative number of milliseconds (or `Infinity`), or a string of a number (decimals allowed, e.g. `"1.5s"`) and exactly one unit: `ms`, `s`, `m`, `h`.

**Fix:**

```ts
query({ id: 'user', staleTime: '30s', gcTime: '5m', fetch }); // not "30" or "5 min"
```

## Cannot derive a cache key

Code: `RIVA_KEY` (`RivaError`).

**When:** the variables of a query hold a function, a symbol, a bigint, a non-finite number, an invalid `Date` or a circular reference.

**Why:** the key is the definition id plus the stable-serialized variables, so they must be JSON-like.

**Fix:** pass plain data; convert before the call (`id.toString()` for a bigint, an ISO string for an odd date), and keep callbacks out of the variables.

```ts
user.ensure(client, { id: String(id) });
```

## Cannot cache the data

Code: `RIVA_CACHE` (`RivaError`).

**When:** a query with `cache: entities()` (or `writeEntity`) receives data holding a function, a symbol, a bigint, a non-finite number, a class instance other than `Date`, a `Map`/`Set` or a circular reference. A fetch rejects with it (the entry shows the error and keeps its previous data). `setData` throws it and leaves the entry untouched. A mutation with `cache: entities()` hits it too: data returned by `optimistic` makes `run` reject before anything is shown, and a server result refused at commit rolls the layers back; in both cases `updates` and `invalidates` do not run and `run` rejects with the error.

**Why:** the entity store merges and compares plain JSON data field by field, so it cannot hold anything else. Nothing is written when it throws.

**Fix:** return plain data from `fetch` (convert class instances with `toJSON()` or a mapper), or keep that query on the default keyed cache.

```ts
fetch: async () => (await res.json()) as Plain, // not a Map, not a model instance
```

## This client already uses other entity identity rules

Code: `RIVA_CACHE` (`RivaError`).

**When:** two `entities()` policies with different `keys` or `identify` (compared by reference) meet on one client, or a policy with such rules is first used after `readEntity` or `writeEntity` filled the client's store.

**Why:** a client has one entity store with one identity rule, so the same object cannot be two entities.

**Fix:** share one policy, or the same options objects, between the client's queries; create it before any `readEntity`/`writeEntity`.

```ts
const cache = entities({ keys }); // one, module level
query({ id: 'a', cache, fetch });
query({ id: 'b', cache, fetch });
```

## The query's result is incomplete in the cache: the server did not return every selected field.

Code: `RIVA_CACHE` (`RivaError`).

**When:** an observed query with a cache whose `read` returns `undefined` (a selection-aware cache such as `normalized()`), even right after a fetch: the entry shows the error status.

**Why:** a miss (an evicted entity, a field the data never held) makes the engine invalidate and refetch the entry once. If the fresh result still reads as a miss, the server answered without a selected field, and a second refetch would give the same, so it stops.

**Fix:** have the API return every selected field (a nullable field must come back as `null`, not be left out), or remove the field from the selection.

## The request was aborted

Code: `RIVA_ABORT` (`RivaAbortError`).

**When:** `ensure` rejects with it after the `signal` you passed aborted, or after `cancel` aborted the fetch you were waiting on. A mutation's `run(client, vars, { signal })` rejects with it too, and rolls back its optimistic layers, including while it waits for an earlier mutation to settle (it never commits afterwards).

**Why:** abort is a decision, not a failure: it is never retried and never stored as the query's error; the entry returns to its previous state.

**Fix:** catch it where you abort.

```ts
try {
	await user.ensure(client, { id }, { signal });
} catch (e) {
	if (!(e instanceof RivaAbortError)) throw e;
}
```

## HTTP <status>

Code: `HTTP_<status>` (`RivaHttpError`, a `RivaRequestError`).

**When:** a fetcher threw `new RivaHttpError(status)` without a message, so the message is `HTTP 503`, `HTTP 404`...

**Why:** the server answered with an error status. It is retried for 5xx, 408 and 429 (per `retry`) and never for other statuses.

**Fix:** read `error.status` and `error.cause`; fix the request for a 4xx, or raise `retry` / wait for the server for a 5xx. Pass your own message as the second argument for a clearer text.

## Network error

Code: `RIVA_NETWORK` (`RivaNetworkError`, a `RivaRequestError`).

**When:** a fetcher threw `new RivaNetworkError()` without a message: the request never got a response (offline, DNS, CORS, connection reset).

**Why:** it is always retryable, so the engine retries it per `retry` before settling the error state.

**Fix:** check connectivity and the URL; look at `error.cause` for the underlying failure. On the server `retry` defaults to 0, so set it to retry there.
