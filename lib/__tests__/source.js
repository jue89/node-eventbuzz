const sourceFactory = require('../source.js');

test('write events to database', async () => {
	const write = jest.fn();
	const createWriter = jest.fn(() => Promise.resolve({write}));
	const source = await sourceFactory({db: {createWriter}});
	const src = 'abc';
	const s = await source(src);
	const event = 'ev';
	const payload = {test: true};
	await s.emit(event, payload);
	expect(createWriter.mock.calls[0][0]).toBe(src);
	expect(write.mock.calls[0][0]).toMatchObject({
		value: [event, payload]
	});
});

test('multiplex writers', async () => {
	const close = jest.fn();
	const createWriter = jest.fn(() => Promise.resolve({close}));
	const source = await sourceFactory({db: {createWriter}});
	const src = 'abc';
	const [s0, s1] = await Promise.all([
		source(src),
		source(src)
	]);
	expect(createWriter.mock.calls.length).toBe(1);
	await s0.close();
	expect(close.mock.calls.length).toBe(0);
	await s1.close();
	await source(src);
	expect(createWriter.mock.calls.length).toBe(2);
});
