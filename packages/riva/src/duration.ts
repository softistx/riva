import { RivaError } from './errors';

/** A duration: a number of milliseconds, or a string such as `"30s"`, `"5m"`, `"2h"`, `"250ms"`. */
export type Duration = number | `${number}${'ms' | 's' | 'm' | 'h'}`;

const UNITS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 } as const;

/** Converts a `Duration` to milliseconds. `Infinity` is allowed; anything else invalid throws `RIVA_DURATION`. */
export function toMs(d: Duration): number {
	if (typeof d === 'number') {
		if (d >= 0) return d;
	} else if (typeof d === 'string') {
		const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(d);
		if (m) return Number(m[1]) * UNITS[m[2] as keyof typeof UNITS];
	}
	throw new RivaError(
		'RIVA_DURATION',
		`Invalid duration ${JSON.stringify(d)}: use a number of milliseconds (or Infinity), or a string like "250ms", "30s", "5m", "2h".`,
	);
}
