const crypto = require('crypto');

const NULLBYTE = Buffer.alloc(1);

module.exports = (items) => {
	const hash = crypto.createHash('md5');
	items.forEach((i) => {
		hash.update(Buffer.from(i));
		hash.update(NULLBYTE);
	});
	return hash.digest('hex');
}
