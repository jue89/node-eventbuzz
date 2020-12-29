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
	async function getWriter (src) {
		// Generate writer on the fly
		if (!writers[src]) writers[src] = writerFactory(src);

		// Wait for the writer factory to finish
		const writer = await writers[src];

		// Accquire the writer
		await writer.accquire();

		return writer;
	}

	return async (src) => {
		const srcCheckpoint = checkpoint[src] || {};

		const writer = await getWriter(src);

		async function emit (event, payload = {}) {
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
			return writer.release();
		}

		return {emit, close};
	};
};
