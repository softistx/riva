/* biome-ignore-all lint/style/useNamingConvention: GraphQL's field names */
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { parse } from 'graphql';
import type { GraphQLTransport } from '../src/transport';

export interface Patient {
	__typename: 'Patient';
	id: string;
	name: string;
}

export interface PatientsData {
	patients: {
		edges: { node: Patient; cursor: string }[];
		pageInfo: {
			hasNextPage: boolean;
			hasPreviousPage: boolean;
			endCursor: string | null;
		};
	};
}

export interface PatientsVars {
	school: string;
	first?: number | null;
	after?: string | null;
	before?: string | null;
}

export const PATIENTS_QUERY = parse(
	'query Patients($school: ID!, $first: Int, $after: String, $before: String) { patients(school: $school, first: $first, after: $after, before: $before) { edges { node { id name } cursor } pageInfo { hasNextPage hasPreviousPage endCursor } } }',
) as TypedDocumentNode<PatientsData, PatientsVars>;

export const VIEWER_QUERY = parse(
	'query Viewer { viewer { id } }',
) as TypedDocumentNode<
	{ viewer: { id: string } },
	// codegen's `Exact<{ [key: string]: never }>`
	{ [key: string]: never }
>;

export const RENAME_PATIENT_MUTATION = parse(
	'mutation RenamePatient($id: ID!, $name: String!) { renamePatient(id: $id, name: $name) { id name } }',
) as TypedDocumentNode<
	{ renamePatient: { id: string; name: string } },
	{ id: string; name: string }
>;

export interface Call {
	name: string;
	kind: string;
	variables: unknown;
	signal: AbortSignal;
}

/** A transport that records its calls and answers with `answer`. */
export function fakeTransport(
	answer: (call: Call) => unknown = () => ({}),
): GraphQLTransport & { calls: Call[] } {
	const calls: Call[] = [];
	return {
		calls,
		async execute(operation, variables, { signal }) {
			const call = {
				name: operation.name,
				kind: operation.kind,
				variables,
				signal,
			};
			calls.push(call);
			return answer(call) as never;
		},
	};
}

export const page = (
	ids: string[],
	next: string | null,
): PatientsData['patients'] => ({
	edges: ids.map((id) => ({
		node: { __typename: 'Patient', id, name: `P${id}` },
		cursor: `c${id}`,
	})),
	pageInfo: {
		hasNextPage: next !== null,
		hasPreviousPage: false,
		endCursor: next,
	},
});
