const path = require('path');

jest.mock('fs');
const mockFs = require('fs');

const cacheFactory = require('../cache.js');

test('create cache dir', async () => {
	mockFs.stat.mockImplementationOnce((path, cb) => cb(new Error('ENOENT')));
	const cachePath = 'abc';
	await cacheFactory({cachePath});
	expect(mockFs.stat.mock.calls[0][0]).toBe(cachePath);
	expect(mockFs.mkdir.mock.calls[0][0]).toBe(cachePath);
});

test('getCache from non-existing file', async () => {
	mockFs.readFile.mockImplementationOnce((path, cb) => cb(new Error('ENOENT')));
	const cachePath = 'abc';
	const {getCache} = await cacheFactory({cachePath});
	const key = 'def'
	const obj = await getCache(key);
	expect(mockFs.readFile.mock.calls[0][0]).toEqual(path.join(cachePath, key));
	expect(obj).toMatchObject({});
});

test('getCache from file', async () => {
	const data = Buffer.alloc(0);
	mockFs.readFile.mockImplementationOnce((path, cb) => cb(null, data));
	const deserialize = jest.fn(() => ({}));
	const {getCache} = await cacheFactory({cachePath: 'abc', deserialize});
	const obj = await getCache('def');
	expect(deserialize.mock.calls[0][0]).toBe(data);
	expect(obj).toBe(deserialize.mock.results[0].value);
});

test('setCache', async () => {
	const serialize = jest.fn(() => Buffer.alloc(0));
	const cachePath = 'abc';
	const {setCache} = await cacheFactory({cachePath, serialize});
	const key = 'def';
	const obj = {};
	await setCache(key, obj);
	expect(serialize.mock.calls[0][0]).toBe(obj);
	expect(mockFs.writeFile.mock.calls[0][0]).toEqual(path.join(cachePath, '.' + key));
	expect(mockFs.writeFile.mock.calls[0][1]).toBe(serialize.mock.results[0].value);
	expect(mockFs.rename.mock.calls[0][0]).toEqual(path.join(cachePath, '.' + key));
	expect(mockFs.rename.mock.calls[0][1]).toEqual(path.join(cachePath, key));
});
