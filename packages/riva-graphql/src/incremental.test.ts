import { expect, test } from 'bun:test';
import { parse } from 'graphql';
import { PATIENTS_QUERY } from '../test/fixtures';
import { isIncremental } from './incremental';
import { operationOf } from './operation';

const op = (source: string) => operationOf(parse(source) as never);

test('a document selecting @defer or @stream is incremental', () => {
	expect(isIncremental(op('query A { me { id ... @defer { name } } }'))).toBe(
		true,
	);
	expect(
		isIncremental(
			op('query A { me { posts @stream(initialCount: 1) { id } } }'),
		),
	).toBe(true);
	expect(
		isIncremental(
			op('query A { me { ...F @defer } } fragment F on User { name }'),
		),
	).toBe(true);
});

test('a plain document, or one with the directive switched off, is not', () => {
	expect(isIncremental(operationOf(PATIENTS_QUERY))).toBe(false);
	expect(
		isIncremental(op('query A { me { ... @defer(if: false) { name } } }')),
	).toBe(false);
});

test('a variable `if` counts as on', () => {
	expect(
		isIncremental(
			op('query A($d: Boolean!) { me { ... @defer(if: $d) { name } } }'),
		),
	).toBe(true);
});
