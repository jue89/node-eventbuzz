const {EventEmitter} = require('events');

jest.useFakeTimers();

const sinkFactory = require('../sink.js');

const promiseFactory = (defaultValue) => {
	const obj = {};
	obj.q = new Promise((resolve) => {
		obj.resolve = (value) => resolve(value || defaultValue);
	});
	return obj;
};

const nextLoop = () => new Promise((resolve) => setImmediate(resolve));

const defaultDB = {createReader: () => ({read: () => null})};
const defaultCalcHash = () => '';
const defaultGetCache = () => ({});

test('read from state file', async () => {
	const hash = 'foobar';
	const calcHash = jest.fn(() => hash);
	const cache = {state: {}};
	const getCache = jest.fn(() => Promise.resolve(cache));
	const sink = sinkFactory({db: defaultDB, calcHash, getCache});

	class MyState {
		constructor () {
			this.fromObject = jest.fn();
		}
		static getSchemaVersion () {
			return 123;
		}
	};
	const state = new MyState();
	const name = 'sink';

	await sink({
		name,
		storeInterval: 0,
		init: () => state,
		handler: {
			srcA: {
				evZ: () => {},
				evA: () => {}
			},
			srcB: {
				evA: () => {},
				evZ: () => {}
			}
		}
	});

	expect(calcHash.mock.calls[0][0]).toMatchObject([
		'srcA/evA',
		'srcA/evZ',
		'srcB/evA',
		'srcB/evZ',
		'MyState',
		'123',
		name
	]);
	expect(getCache.mock.calls[0][0]).toBe(hash);
	expect(state.fromObject.mock.calls[0][0]).toBe(cache.state);
});

test('listen to events', async () => {
	const payload = {foo: true};
	const read = jest.fn(() => null);
	const ptrEvZ = 122;
	read.mockReturnValueOnce({series: 'srcA', ptr: ptrEvZ, value: ['evZ', payload]});
	const ptrEvA = 123;
	read.mockReturnValueOnce({series: 'srcA', ptr: ptrEvA, value: ['evA', payload]});
	read.mockReturnValueOnce({series: 'srcA', ptr: 124, value: ['evNON', {}]});
	const db = {createReader: jest.fn(() => Promise.resolve({read}))};
	const cache = {
		ptr: {'srcB': 1234},
		state: {baz: true}
	};
	const setCache = jest.fn();
	const sink = sinkFactory({db, calcHash: defaultCalcHash, getCache: () => cache, setCache});

	const state = {};
	const observer = jest.fn();
	const handler = {
		srcA: {
			evA: jest.fn((state) => { state.baz = false; }),
			evZ: jest.fn()
		},
		srcB: {
			evA: jest.fn(),
			evZ: jest.fn()
		}
	};
	const s = await sink({init: () => state, handler, observer, storeInterval: 0});
	expect(observer.mock.calls[0][0]).toBe(state);
	expect(observer.mock.calls[0][1]).toBeUndefined();
	expect(s.state).toBe(state);
	expect(s.state.baz).toBe(true);
	const onChange = jest.fn();
	s.on('change', onChange);

	expect(db.createReader.mock.calls[0][0]).toMatchObject([
		['srcA', {ptr: -1}],
		['srcB', {ptr: cache.ptr.srcB}]
	]);

	await new Promise((resolve) => s.on('change', (state, {event}) => {
		if (event === 'evA') resolve();
	}));

	const argZ = {
		src: 'srcA',
		event: 'evZ',
		ptr: ptrEvZ,
		payload
	};
	expect(handler.srcA.evZ.mock.calls[0][0]).toBe(state);
	expect(handler.srcA.evZ.mock.calls[0][1]).toMatchObject(argZ);
	expect(onChange.mock.calls[0][0]).toBe(state);
	expect(onChange.mock.calls[0][1]).toMatchObject(argZ);
	expect(observer.mock.calls[1][0]).toBe(state);
	expect(observer.mock.calls[1][1]).toMatchObject(argZ);

	const argA = {
		src: 'srcA',
		event: 'evA',
		ptr: ptrEvA,
		payload
	};
	expect(handler.srcA.evA.mock.calls[0][0]).toBe(state);
	expect(handler.srcA.evA.mock.calls[0][1]).toMatchObject(argA);
	expect(onChange.mock.calls[1][0]).toBe(state);
	expect(onChange.mock.calls[1][1]).toMatchObject(argA);
	expect(observer.mock.calls[2][0]).toBe(state);
	expect(observer.mock.calls[2][1]).toMatchObject(argA);

	expect(s.state.baz).toBe(false);

	expect(cache.ptr.srcA).toBe(ptrEvA);
});

test('forward errors during event handling', async () => {
	const dataSource = new EventEmitter();
	const emit = () => dataSource.emit('data', {series: 'srcA', value: ['evA', null]});
	const read = () => new Promise((resolve) => dataSource.once('data', resolve));
	const db = {createReader: () => ({read})};
	const sink = sinkFactory({db, calcHash: defaultCalcHash, getCache: () => ({}), setCache: () => {}});

	const evA = jest.fn();
	const handler = {srcA: {evA}};
	const observer = jest.fn();
	const s = await sink({init: () => ({}), handler, observer, storeInterval: 0});
	const fetchErr = () => new Promise((resolve) => s.once('error', resolve));

	// Error while handling an event
	const handlerErr = new Error();
	evA.mockImplementationOnce(() => { throw handlerErr; });
	emit();
	await expect(fetchErr()).resolves.toBe(handlerErr);

	// Error while running the observer
	const observerErr = new Error();
	observer.mockImplementationOnce(() => { throw observerErr; });
	emit();
	await expect(fetchErr()).resolves.toBe(observerErr);
});

test('store state', async () => {
	const read = jest.fn(() => null);
	read.mockReturnValueOnce({series: 'srcA', ptr: 123, value: ['evA', null]});
	const evPromise = promiseFactory({series: 'srcA', ptr: 124, value: ['evZ', null]});
	read.mockReturnValueOnce(evPromise.q);
	const db = {createReader: () => ({read})};
	const setCache = jest.fn();
	const hash = 'qwert';
	const calcHash = () => hash;
	const sink = sinkFactory({db, calcHash, getCache: defaultGetCache, setCache});

	const storeInterval = 123;
	const s = await sink({
		storeInterval,
		init: () => ({}),
		handler: {
			srcA: {
				evA: (state) => { state.cur = {a: 'A'}; },
				evZ: (state) => { state.cur.a = 'Z'; }
			}
		}
	});

	// Wait for the first write
	await new Promise((resolve) => s.on('change', (state, {event}) => {
		if (event === 'evA') resolve();
	}));

	// Advance time to trigger writing cache
	jest.advanceTimersByTime(storeInterval);
	await nextLoop();

	// Read next value. It may not override the cache state!
	evPromise.resolve();
	await nextLoop();

	// Make sure the cache holds the right state
	expect(setCache.mock.calls[0][0]).toBe(hash);
	expect(setCache.mock.calls[0][1]).toMatchObject({
		ptr: {srcA: 123},
		state: {cur: {a: 'A'}}
	});

	// Add toObject helper to state object
	const curState = {foo: null};
	s.state.toObject = jest.fn(() => curState);

	// Advance time to trigger writing cache again
	jest.advanceTimersByTime(storeInterval);
	await nextLoop();

	// Make sure the helper has been used and the return object has been compied
	expect(s.state.toObject.mock.calls.length).toBe(1);
	expect(setCache.mock.calls[1][1].state).not.toBe(curState);
	expect(setCache.mock.calls[1][1]).toMatchObject({
		ptr: {srcA: 124},
		state: curState
	});
});

test('defere state storing during handler execution', async () => {
	const read = jest.fn(() => null);
	read.mockReturnValueOnce({series: 'srcA', value: ['evA', null]});
	read.mockReturnValueOnce({series: 'srcA', value: ['evZ', null]});
	const db = {createReader: () => ({read})};
	const setCache = jest.fn();
	const sink = sinkFactory({db, calcHash: () => '', getCache: defaultGetCache, setCache});

	const storeInterval = 123;
	const handlerPromise = promiseFactory();
	const s = await sink({
		storeInterval,
		init: () => ({}),
		handler: {
			srcA: {
				evA: () => {},
				evZ: () => handlerPromise.q
			}
		}
	});

	// Wait for the first write
	await new Promise((resolve) => s.on('change', (state, {event}) => {
		if (event === 'evA') resolve();
	}));

	// Wait for the second write to begin
	await nextLoop();

	// Advance time to trigger writing cache
	jest.advanceTimersByTime(storeInterval);
	await nextLoop();

	expect(setCache.mock.calls.length).toBe(0);
	handlerPromise.resolve();
	await nextLoop();
	expect(setCache.mock.calls.length).toBe(1);
});

test('close', async () => {
	const close = jest.fn();
	const setCache = jest.fn();
	const sink = sinkFactory({db: {createReader: () => ({close, read: () => null})}, calcHash: defaultCalcHash, getCache: defaultGetCache, setCache});
	const s = await sink({init: () => ({}), handler: {}});
	await s.close();
	expect(setCache.mock.calls.length).toBe(1);
	expect(close.mock.calls.length).toBe(1);
});
