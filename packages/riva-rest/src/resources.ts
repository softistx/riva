import type { TrackedInput } from '@softistx/riva/resource';

/**
 * What a call takes as input: a plain value, a riva signal or computed, or a
 * function that reads signals (tracked: when what it reads changes, the
 * resource follows).
 */
export type InputArg<Input> = TrackedInput<Input>;
