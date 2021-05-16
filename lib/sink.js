const {EventEmitter} = require('events');
const clone = require('clone');
const qsem = require('qsem');

module.exports = ({db, calcHash, getCache, setCache}) => async ({name, init, handler, observer, storeInterval = 2000}) => {
	const sink = new EventEmitter();
	const stateSem = qsem(1);
	sink.state = await init();

	// Calc key
	const eventNames = Object.entries(handler).reduce((eventNames, [src, events]) => {
		return eventNames.concat(Object.keys(events).map((e) => `${src}/${e}`));
	}, []).sort();
	const c = sink.state.constructor;
	if (c) {
		eventNames.push(c.name);
		if (c.getSchemaVersion) eventNames.push(c.getSchemaVersion().toString());
	}
	if (name) eventNames.push(name);
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

	// Fire observer with the current state
	if (observer) await observer(sink.state);

	// Create event reader
	const ptrs = cache.ptr || {};
	const opts = Object.keys(handler).map((src) => [src, {ptr: ptrs[src] || -1}]);
	const reader = await db.createReader(opts);

	async function nextEvent () {
		const record = await reader.read();
		if (record === null) return;
		const src = record.series;
		const timestamp = record.timestamp;
		const ptr = record.ptr;
		const event = record.value[0];
		const payload = record.value[1];

		// Only handle events that have a handler!
		if (handler[src][event]) {
			await stateSem.limit(async () => {
				const arg = {timestamp, src, event, payload, ptr};
				await handler[src][event](sink.state, arg);
				if (observer) await observer(sink.state, arg);
				sink.emit('change', sink.state, arg);
				ptrs[src] = ptr;
				scheduleCacheStore();
			}).catch((err) => sink.emit('error', err));
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

		// Release mutex before the next async task
		// Otherwise, we may miss a cache store request
		cacheStoreScheduled = false;

		await cacheStore();
	}

	async function cacheStore () {
		// Copy over state to cache
		await stateSem.enter();
		const cache = {
			state: clone((sink.state.toObject) ? sink.state.toObject() : sink.state),
			ptr: clone(ptrs)
		};
		stateSem.leave();

		// Store state to cache
		await setCache(key, cache);

		sink.emit('cached');
	}

	sink.close = async function () {
		clearTimeout(cacheStoreTimeout);
		await reader.close();
		await cacheStore();
	};

	nextEvent();

	return sink;
};
