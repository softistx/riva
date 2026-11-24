import { expect, test } from 'bun:test';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { parse } from 'graphql';
import {
	PATIENTS_QUERY,
	RENAME_PATIENT_MUTATION,
	VIEWER_QUERY,
} from '../test/fixtures';
import { operationOf } from './operation';

const doc = (source: string) => parse(source) as TypedDocumentNode;

test('reads name, kind and id (the name without a persisted id)', () => {
	const op = operationOf(PATIENTS_QUERY);
	expect(op).toMatchObject({
		name: 'Patients',
		kind: 'query',
		persistedId: undefined,
		id: 'Patients',
	});
	expect(operationOf(RENAME_PATIENT_MUTATION).kind).toBe('mutation');
	expect(op.document).toBe(PATIENTS_QUERY);
});

test('reads a document once', () => {
	expect(operationOf(VIEWER_QUERY)).toBe(operationOf(VIEWER_QUERY));
});

test('the preset persisted hash is the id', () => {
	const hashed = Object.assign(doc('query A { a }'), {
		__meta__: { hash: 'abc123' },
	});
	expect(operationOf(hashed)).toMatchObject({
		persistedId: 'abc123',
		id: 'abc123',
		name: 'A',
	});
	const noHash = Object.assign(doc('query B { a }'), { __meta__: {} });
	expect(operationOf(noHash).id).toBe('B');
});

test('rejects a document with no operation, several, or an unnamed one', () => {
	expect(() => operationOf(doc('fragment F on User { id }'))).toThrow(
		/no operation/,
	);
	expect(() => operationOf(doc('query A { a } query B { b }'))).toThrow(
		/2 operations/,
	);
	expect(() => operationOf(doc('{ a }'))).toThrow(/no name/);
	expect(() => operationOf(doc('subscription S { s }'))).toThrow(
		/subscription/,
	);
});

test('rejects what is not a document node', () => {
	expect(() => operationOf('query A { a }' as never)).toThrow(
		/TypedDocumentNode/,
	);
	expect(() => operationOf(undefined as never)).toThrow(TypeError);
});

test('rejects a document of the other kind, naming the right helper', () => {
	expect(() => operationOf(PATIENTS_QUERY, 'mutation')).toThrow(
		/use query\(\)/,
	);
	expect(() => operationOf(RENAME_PATIENT_MUTATION, 'query')).toThrow(
		/use mutation\(\)/,
	);
});
