import { expect, test } from 'bun:test';
import { RivaRequestError } from '../errors';
import { RivaGraphQLError } from './graphql-error';

test('lists the errors with their paths, keeps the partial data and the cause', () => {
	const cause = new Error('c');
	const e = new RivaGraphQLError(
		'X',
		[
			{ message: 'Hidden', path: ['viewer', 'friends', 0] },
			{ message: 'Gone' },
		],
		{ a: 1 },
		{ retryable: false, status: 400, cause },
	);
	expect(e).toBeInstanceOf(RivaRequestError);
	expect(e.name).toBe('RivaGraphQLError');
	expect(e.message).toBe('Hidden (at viewer.friends.0); Gone');
	expect([e.data, e.cause, e.status, e.retryable]).toEqual([
		{ a: 1 },
		cause,
		400,
		false,
	]);
});
