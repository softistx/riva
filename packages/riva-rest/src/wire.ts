/** HTTP methods that only read: their operations are queries, the others mutations. */
export const SAFE: ReadonlySet<string> = new Set(['get', 'head', 'options']);

/** The id the browser names an operation by: `rest:<operationId>`. */
export const PREFIX = 'rest:';
