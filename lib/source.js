module.exports = async ({db}) => {
	const writers = {};
	async function getWriter (src) {
		if (!writers[src]) {
			const obj = {cnt: 0};
			// Expose obj before entering any async functions
			writers[src] = obj;
			const writer = await db.createWriter(src);
			obj.write = (event, payload) => writer.write({value: [event, payload]});
			obj.close = async () => {
				obj.cnt--;
				if (obj.cnt === 0) {
					delete writers[src];
					delete obj.close;
					delete obj.write;
					await writer.close();
				}
			};
		}
		writers[src].cnt++;
		return writers[src];
	}

	return async (src) => {
		const writer = await getWriter(src);

		async function emit (event, payload = {}) {
			await writer.write(event, payload);
		}

		async function close () {
			await writer.close();
		}

		return {emit, close};
	};
};
