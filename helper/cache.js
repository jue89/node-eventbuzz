const fs = require('fs');
const path = require('path');
const util = require('util');
const qsem = require('qsem');
const mkdir = util.promisify(fs.mkdir);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const rename = util.promisify(fs.rename);
const stat = util.promisify(fs.stat);

module.exports = async ({cachePath, deserialize, serialize}) => {
	// Create cacheDir if it is not existing
	try {
		await stat(cachePath);
	} catch (e) {
		await mkdir(cachePath);
	}

	// Protect cache form parallel writes
	const writeSem = qsem(1);

	async function getCache (key) {
		const cacheFile = path.join(cachePath, key);
		try {
			const content = await readFile(cacheFile);
			return deserialize(content);
		} catch (e) {
			return {};
		}
	}

	async function setCache (key, obj) {
		const cacheFile = path.join(cachePath, key);
		const cacheFileTemp = path.join(cachePath, '.' + key);
		const content = serialize(obj);
		await writeSem.limit(async () => {
			await writeFile(cacheFileTemp, content);
			await rename(cacheFileTemp, cacheFile);
		});
	}

	return {getCache, setCache};
};
