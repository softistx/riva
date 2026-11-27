import { expect, test } from 'bun:test';
import * as rxjs from './index';

test('the subpath exports', () => {
	expect(Object.keys(rxjs).sort()).toEqual([
		'data$',
		'fromAsyncIterable',
		'liveQuery',
		'toObservable',
	]);
});
