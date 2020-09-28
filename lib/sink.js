const {EventEmitter} = require('events');
const clone = require('clone');

module.exports = ({db, calcHash, getCache, setCache}) => async ({init, handler, storeInterval = 2000}) => {
	const sink = new EventEmitter();
	sink.state = await init();

	// Calc key
	const eventNames = Object.entries(handler).reduce((eventNames, [src, events]) => {
		return eventNames.concat(Object.keys(events).map((e) => `${src}/${e}`));
	}, []).sort();
	const c = sink.state.constructor;
	if (c) {
		eventNames.push(c.name);
		if (c.getSchemeVersion) eventNames.push(c.getSchemeVersion().toString());
	}
	const key = calcHash(eventNames);

	// Restore state from cache
	const cache = await getCache(key);
	if (cache.state) {
		if (sink.state.fromObject) {
			sink.state.fromObject(cache.state);
		} else {
			Object.assign(sink.state, cache.state);
		}
	}

	// Create event reader
	const ptr = cache.ptr || {};
	const opts = Object.keys(handler).map((src) => [src, {from: ptr[src] || -1}]);
	const reader = await db.createReader(opts);

	async function nextEvent () {
		const record = await reader.read();
		if (record === null) return;
		const src = record.series;
		const timestamp = record.timestamp;
		const event = record.value[0];
		const payload = record.value[1];

		// Only handle events that have a handler!
		if (handler[src][event]) {
			const arg = {timestamp, src, event, payload};
			await handler[src][event](sink.state, arg);
			sink.emit('change', sink.state, arg);
			ptr[src] = timestamp;
			scheduleCacheStore();
		}

		nextEvent();
	}

	let cacheStoreScheduled = false;
	let cacheStoreTimeout;
	async function scheduleCacheStore () {
		// Make sure storing is activated
		if (!storeInterval) return;

		// Allow only one cache store request to be scheduled concurrently
		if (cacheStoreScheduled) return;
		cacheStoreScheduled = true;

		// Wait for the state time to accumulate further state changes before
		// writing to disk
		await new Promise((resolve) => {
			cacheStoreTimeout = setTimeout(resolve, storeInterval);
		});

		// Copy over state to cache
		if (sink.state.toObject) {
			cache.state = clone(sink.state.toObject());
		} else {
			cache.state = clone(sink.state);
		}
		cache.ptr = Object.assign({}, ptr);

		// Release mutex before the next async task
		// Otherwise, we may miss a cache store request
		cacheStoreScheduled = false;

		// Store cache
		await setCache(key, cache);
	}

	sink.close = async function () {
		clearTimeout(cacheStoreTimeout);
		await reader.close();
	};

	nextEvent();

	return sink;
};
