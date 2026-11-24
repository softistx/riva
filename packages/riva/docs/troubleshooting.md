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

**When:** an option such as `staleTime`, `gcTime` or `refetchEvery` got a value `toMs` cannot read, at the `query({...})` call.

**Why:** a duration is a non-negative number of milliseconds (or `Infinity`), or a string of digits and one unit: `ms`, `s`, `m`, `h`.

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

## The request was aborted

Code: `RIVA_ABORT` (`RivaAbortError`).

**When:** `ensure` rejects with it after the `signal` you passed aborted, or after `cancel` aborted the fetch you were waiting on.

**Why:** abort is a decision, not a failure: it is never retried and never stored as the query's error; the entry returns to its previous state.

**Fix:** catch it where you abort.

```ts
try {
	await user.ensure(client, { id }, { signal });
} catch (e) {
	if (!(e instanceof RivaAbortError)) throw e;
}
```
