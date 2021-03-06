module.exports = async ({db, sink, opts: {checkpoint, rejectUnspecifiedEvents}}) => {
	function checkpointFactory () {
		let cnt = 0;
		let data;
		let exit;

		function accquire () {
			// Quick exit if everything is already set up
			if (cnt++ > 0) return;

			// Run checkpoint factory
			exit = [];
			if (typeof checkpoint === 'function') {
				// Checkpoints are generated by a factory function. It gets
				// access the the sink factory to observe current state and
				// enforce things like unique IDs.
				data = checkpoint({
					sink: async (opts) => {
						const s = await sink(opts);
						exit.push(s.close);
						return s;
					},
					registerCloseCallback: (fn) => {
						exit.push(fn);
					}
				});
			} else if (typeof checkpoint === 'object') {
				data = checkpoint;
			} else {
				// Static checkpoints
				data = {};
			}
		}

		async function release () {
			// Quick exit if another source is still active
			if (--cnt > 0) return;

			// Clean up everything
			await Promise.all(exit.map((e) => e()));
		}

		async function getSrcCheckpoint (src) {
			const srcCheckpoint = (await data)[src] || {};
			return function (event) {
				if (srcCheckpoint[event]) return srcCheckpoint[event];
				if (rejectUnspecifiedEvents) throw new Error('Unspecified event');
				return (x) => x;
			};
		}

		return {accquire, release, getSrcCheckpoint};
	}

	function writerFactory (src) {
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
	const checkpointContext = checkpointFactory();
	return async (src) => {
		// Make sure checkpoints are available
		checkpointContext.accquire();
		const getEventCheckpoint = await checkpointContext.getSrcCheckpoint(src);

		// Open writer
		if (!writers[src]) writers[src] = writerFactory(src);
		const writer = await writers[src];
		await writer.accquire();
		let closed = false;

		async function emit (event, payload = {}) {
			if (closed) throw new Error('Source has been closed');

			const check = getEventCheckpoint(event);
			payload = await check(payload);

			await writer.write(event, payload);
			return payload;
		}

		async function close () {
			closed = true;
			await checkpointContext.release();
			return writer.release();
		}

		return {emit, close};
	};
};
