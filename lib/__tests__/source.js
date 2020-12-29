const sourceFactory = require('../source.js');

test('write events to database', async () => {
	const write = jest.fn();
	const createWriter = jest.fn(() => Promise.resolve({write}));
	const source = await sourceFactory({db: {createWriter}, opts: {}});
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
	const source = await sourceFactory({db: {createWriter}, opts: {}});
	const src = 'abc';
	const [s0, s1] = await Promise.all([
		source(src),
		source(src)
	]);
	expect(createWriter.mock.calls.length).toBe(1);
	await s0.close();
	expect(close.mock.calls.length).toBe(0);
	await s1.close();
	expect(close.mock.calls.length).toBe(1);
	await expect(s1.emit('ev')).rejects.toThrow('Source has been closed');
	await source(src);
	expect(createWriter.mock.calls.length).toBe(2);
});

test('check payload with checkpoint factory', async () => {
	const evA = jest.fn();
	const checkpoint = jest.fn(() => ({srcA: {evA}}));
	const write = jest.fn();
	const createWriter = jest.fn(() => ({write, close: () => {}}));
	const close = jest.fn();
	const sink = jest.fn(() => ({close}));
	const source = await sourceFactory({db: {createWriter}, sink, opts: {checkpoint, rejectUnspecifiedEvents: true}});
	const s = await source('srcA');

	// at this point the factory must be executed
	const arg = {};
	checkpoint.mock.calls[0][0].sink(arg);
	expect(sink.mock.calls[0][0]).toBe(arg);

	// reject by checkpoint
	const err = new Error();
	evA.mockImplementationOnce(() => { throw err; });
	await expect(s.emit('evA')).rejects.toBe(err);

	// exchange payload
	const newPayload = {};
	evA.mockImplementationOnce(() => newPayload);
	const payload = {};
	await expect(s.emit('evA', payload)).resolves.toBe(newPayload);
	expect(evA.mock.calls[1][0]).toBe(payload);
	expect(write.mock.calls[0][0].value[1]).toBe(newPayload);

	// reject other event
	await expect(s.emit('nope')).rejects.toThrow('Unspecified event');

	// close source and clean up checkpoint
	await s.close();
	expect(close.mock.calls.length).toBe(1);

	// reopen checkpoint
	await source('srcA');
	expect(checkpoint.mock.calls.length).toBe(2);
});

test('check payload with static checkpoint object', async () => {
	const evA = jest.fn(() => Promise.reject(new Error()));
	const checkpoint = {srcA: {evA}};
	const createWriter = () => ({});
	const source = await sourceFactory({db: {createWriter}, opts: {checkpoint}});
	const s = await source('srcA');

	// reject by checkpoint
	await expect(s.emit('evA')).rejects.toThrow();
});
