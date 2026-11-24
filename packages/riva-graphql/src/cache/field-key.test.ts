import { describe, expect, test } from 'bun:test';
import { type FieldNode, type OperationDefinitionNode, parse } from 'graphql';
import { fieldKey, fieldNameOf, stableJson, valueNode } from './field-key';

function firstField(source: string): FieldNode {
	const operation = parse(source).definitions[0] as OperationDefinitionNode;
	return operation.selectionSet.selections[0] as FieldNode;
}

describe('fieldKey', () => {
	test('a field with no arguments is its name, never its alias', () => {
		expect(fieldKey(firstField('{ mine: viewer { id } }'), {})).toBe('viewer');
	});

	test('arguments are sorted, at every depth', () => {
		const field = firstField(
			'{ patients(sort: { by: NAME, asc: true }, first: 2) { id } }',
		);
		expect(fieldKey(field, {})).toBe(
			'patients({"first":2,"sort":{"asc":true,"by":"NAME"}})',
		);
	});

	test('variables are read, and an argument left unset is left out', () => {
		const field = firstField(
			'query ($id: ID, $q: String) { patient(id: $id, q: $q) { id } }',
		);
		expect(fieldKey(field, { id: '1' })).toBe('patient({"id":"1"})');
		expect(fieldKey(field, {})).toBe('patient');
	});

	test('a literal and a variable of the same value share a key', () => {
		const literal = firstField('{ patient(id: "1") { id } }');
		const variable = firstField('query ($id: ID) { patient(id: $id) { id } }');
		expect(fieldKey(variable, { id: '1' })).toBe(fieldKey(literal, {}));
	});

	test('fieldNameOf reads the name back', () => {
		expect(fieldNameOf('patient({"id":"1"})')).toBe('patient');
		expect(fieldNameOf('viewer')).toBe('viewer');
	});

	test('two Date variables are two field keys', () => {
		const field = firstField('query ($at: DateTime) { visits(at: $at) }');
		expect(fieldKey(field, { at: new Date(0) })).toBe(
			'visits({"at":"1970-01-01T00:00:00.000Z"})',
		);
	});
});

describe('valueNode', () => {
	test('every kind of literal', () => {
		const field = firstField(
			'query ($v: Int) { f(a: 1, b: 1.5, c: "s", d: true, e: null, g: ENUM, h: [1, $v], i: { x: $v, y: 2 }) }',
		);
		const out = Object.fromEntries(
			(field.arguments ?? []).map((a) => [
				a.name.value,
				valueNode(a.value, { v: 7 }),
			]),
		);
		expect(out).toEqual({
			a: 1,
			b: 1.5,
			c: 's',
			d: true,
			e: null,
			g: 'ENUM',
			h: [1, 7],
			i: { x: 7, y: 2 },
		});
	});
});

describe('stableJson', () => {
	test('writes undefined in a list as null, and leaves it out of an object', () => {
		expect(stableJson([1, undefined, { b: 1, a: undefined }])).toBe(
			'[1,null,{"b":1}]',
		);
	});

	test('writes what JSON.stringify writes: toJSON honoured, a Date its ISO string', () => {
		const at = new Date('2026-01-01T00:00:00.000Z');
		expect(stableJson({ b: at, a: [at] })).toBe(
			'{"a":["2026-01-01T00:00:00.000Z"],"b":"2026-01-01T00:00:00.000Z"}',
		);
		expect(stableJson({ a: { toJSON: (key: string) => key } })).toBe(
			'{"a":"a"}',
		);
		expect(stableJson({ a: () => 1, b: { toJSON: () => undefined } })).toBe(
			'{}',
		);
	});
});
