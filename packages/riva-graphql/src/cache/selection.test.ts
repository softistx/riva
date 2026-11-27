import { describe, expect, test } from 'bun:test';
import { parse } from 'graphql';
import { walkOf } from '../../test/cache';
import { cacheDocumentOf, collectFields, variablesOf } from './selection';

function deferredOf(source: string, vars: Record<string, unknown> = {}) {
	const walk = walkOf(source, vars);
	return [
		...collectFields(
			[walk.document.operation.selectionSet],
			'Query',
			walk,
			false,
		).deferred,
	].sort();
}

function keysOf(
	walk: ReturnType<typeof walkOf>,
	typename = 'Query',
	undecidedApply = false,
) {
	const { fields, undecided } = collectFields(
		[walk.document.operation.selectionSet],
		typename,
		walk,
		undecidedApply,
	);
	return { fields: [...fields.keys()], undecided: undecided.length };
}

describe('collectFields', () => {
	test('@skip and @include, from literals and variables', () => {
		const walk = walkOf(
			'query ($a: Boolean!, $b: Boolean!) { x @include(if: $a) y @skip(if: $b) z @include(if: true) @skip(if: false) }',
			{ a: false, b: false },
		);
		expect(keysOf(walk).fields).toEqual(['y', 'z']);
	});

	test('the same response key is grouped, aliases kept apart', () => {
		const walk = walkOf(
			'{ a: patient { id } patient { name } ...F } fragment F on Query { patient { age } }',
		);
		const { fields } = collectFields(
			[walk.document.operation.selectionSet],
			'Query',
			walk,
			false,
		);
		expect([...fields.keys()]).toEqual(['a', 'patient']);
		expect(fields.get('patient')).toHaveLength(2);
	});

	test('an undecided fragment is set aside, or joins with undecidedApply', () => {
		const walk = walkOf('{ id ... on Node { name } ... on Patient { age } }');
		expect(keysOf(walk, 'Patient')).toEqual({
			fields: ['id', 'age'],
			undecided: 1,
		});
		expect(keysOf(walk, 'Patient', true)).toEqual({
			fields: ['id', 'name', 'age'],
			undecided: 0,
		});
	});

	test('a fragment spread twice, or in a cycle, is visited once', () => {
		const walk = walkOf('{ ...F ...F } fragment F on Query { a ...F }');
		expect(keysOf(walk).fields).toEqual(['a']);
	});

	test('a spread of an unknown fragment throws', () => {
		expect(() => keysOf(walkOf('{ ...Missing }'))).toThrow(
			'riva-graphql: the document uses the fragment Missing but does not define it',
		);
	});
});

describe('cacheDocumentOf and variablesOf', () => {
	test('a document with no operation throws', () => {
		expect(() => cacheDocumentOf(parse('fragment F on A { a }'))).toThrow(
			'riva-graphql: the document holds no operation',
		);
	});

	test('a variable left out takes its default', () => {
		const { operation } = cacheDocumentOf(
			parse('query ($n: Int = 2, $q: String) { a(n: $n, q: $q) }'),
		);
		expect(variablesOf(operation, { q: 'x' })).toEqual({ n: 2, q: 'x' });
		expect(variablesOf(operation, { n: 5 })).toEqual({ n: 5 });
		expect(variablesOf(operation, undefined)).toEqual({ n: 2 });
	});
});

describe('collectFields, deferred keys', () => {
	test('a field only inside @defer is deferred, a plain one is not', () => {
		expect(deferredOf('query { a ... @defer { b } }')).toEqual(['b']);
	});

	test('a plain selection overrides a deferred one, whatever the order', () => {
		expect(deferredOf('query { ... @defer { a } a }')).toEqual([]);
		expect(deferredOf('query { a ... @defer { a b } }')).toEqual(['b']);
	});

	test('a fragment nested in a deferred one is deferred too', () => {
		expect(
			deferredOf(
				'query { ... @defer { a ... on Query { b } ...F } } fragment F on Query { c }',
			),
		).toEqual(['a', 'b', 'c']);
	});

	test('@defer(if: false) is plain', () => {
		expect(deferredOf('query { ... @defer(if: false) { a } }')).toEqual([]);
	});
});
