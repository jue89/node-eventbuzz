module.exports = async ({db, sink, opts: {checkpoint, rejectUnspecifiedEvents}}) => {
	if (checkpoint === undefined) {
		checkpoint = {};
	} else if (typeof checkpoint === 'function') {
		// Checkpoint can be a factory function. It gets access the the sink
		// factory to observe current state and enforce things like unique IDs.
		checkpoint = await checkpoint({sink});
	}

	async function writerFactory (src) {
		let cnt = 0;
		let writer;

		async function accquire () {
			if (cnt++ === 0) writer = db.createWriter(src);
			// wait until the writer is actually available
			await writer;
		}

		async function release () {
			if (--cnt === 0) {
				const {close} = await writer;
				await close();
			}
		}

		async function write (event, payload) {
			const {write} = await writer;
			return write({value: [event, payload]});
		}

		return {accquire, release, write};
	}

	const writers = {};
	return async (src) => {
		const srcCheckpoint = checkpoint[src] || {};

		// Open writer
		if (!writers[src]) writers[src] = writerFactory(src);
		const writer = await writers[src];
		await writer.accquire();
		let closed = false;

		async function emit (event, payload = {}) {
			if (closed) {
				throw new Error('Source has been closed');
			}

			if (srcCheckpoint[event]) {
				// Let the checkpoint check payload.
				// Might throw an error and aborts execution of this function.
				payload = await srcCheckpoint[event](payload);
			} else if (rejectUnspecifiedEvents === true) {
				throw new Error('Unspecified event');
			}

			await writer.write(event, payload);
			return payload;
		}

		function close () {
			closed = true;
			return writer.release();
		}

		return {emit, close};
	};
};
