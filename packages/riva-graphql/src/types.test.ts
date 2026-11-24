import { expectTypeOf, test } from 'bun:test';
import type { Mutation, Query } from '@softistx/riva';
import {
	PATIENTS_QUERY,
	type PatientsData,
	type PatientsVars,
	RENAME_PATIENT_MUTATION,
	VIEWER_QUERY,
} from '../test/fixtures';
import { mutation, query } from './query';
import type { VarsOf } from './types';

// Type tests only: nothing here runs.
const types = () => {
	const patients = query(PATIENTS_QUERY);
	expectTypeOf(patients).toEqualTypeOf<Query<PatientsVars, PatientsData>>();
	const viewer = query(VIEWER_QUERY);
	expectTypeOf(viewer).toEqualTypeOf<Query<void, { viewer: { id: string } }>>();
	const rename = mutation(RENAME_PATIENT_MUTATION, {
		optimistic: (vars) => {
			expectTypeOf(vars).toEqualTypeOf<{ id: string; name: string }>();
		},
		updates: (_tx, data, vars) => {
			expectTypeOf(data.renamePatient.name).toBeString();
			expectTypeOf(vars.id).toBeString();
		},
	});
	expectTypeOf(rename).toEqualTypeOf<
		Mutation<
			{ id: string; name: string },
			{ renamePatient: { id: string; name: string } }
		>
	>();
	// @ts-expect-error variables are required and typed
	rename.run({} as never);
	// @ts-expect-error unknown variable
	rename.run({} as never, { id: '1', name: 'a', extra: 1 });
	// @ts-expect-error a number is not a school id string
	patients.ensure({} as never, { school: 1 });
	viewer.ensure({} as never);
};
void types;

test('VarsOf maps a document without variables to void', () => {
	expectTypeOf<VarsOf<{ [key: string]: never }>>().toEqualTypeOf<void>();
	expectTypeOf<VarsOf<Record<never, never>>>().toEqualTypeOf<void>();
	expectTypeOf<VarsOf<{ id: string }>>().toEqualTypeOf<{ id: string }>();
	expectTypeOf<VarsOf<{ id?: string }>>().toEqualTypeOf<{ id?: string }>();
});
