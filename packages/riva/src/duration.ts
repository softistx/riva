import { RivaError } from './errors';

/** A duration: a number of milliseconds, or a string such as `"30s"`, `"5m"`, `"2h"`, `"250ms"`. */
export type Duration = number | `${number}${'ms' | 's' | 'm' | 'h'}`;

const UNITS = { ms: 1, s: 1e3, m: 6e4, h: 36e5 };

/** Converts a `Duration` to milliseconds. `Infinity` is allowed; anything else invalid throws `RIVA_DURATION`. */
export function toMs(d: Duration): number {
	const m = /^(\d+(\.\d+)?)(ms|s|m|h)$/.exec(d as string);
	if (m) return Number(m[1]) * UNITS[m[3] as keyof typeof UNITS];
	if (typeof d === 'number' && d >= 0) return d;
	throw new RivaError(
		'RIVA_DURATION',
		`Invalid duration ${JSON.stringify(d)}: use ms, Infinity or "30s", "5m".`,
	);
}
