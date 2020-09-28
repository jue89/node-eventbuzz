const path = require('path');
const tsfoo = require('tsfoo');
const borc = require('borc');
const sourceFactory = require('./lib/source.js');
const sinkFactory = require('./lib/sink.js');
const calcHash = require('./helper/calcHash.js');
const cacheFactory = require('./helper/cache.js');

async function openEventstore (storePath) {
	// Open database
	const db = await tsfoo.openDB(storePath);

	// Setup cache helper
	const {getCache, setCache} = await cacheFactory({
		cachePath: path.join(storePath, 'cache'),
		serialize: borc.encode,
		deserialize: borc.decodeFirst
	});

	const source = await sourceFactory({db});
	const sink = await sinkFactory({db, calcHash, getCache, setCache});

	return {source, sink};
}

module.exports = {openEventstore};
