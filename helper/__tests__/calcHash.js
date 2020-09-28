const calcHash = require('../calcHash.js');

test('ensure strings', () => {
	const h0 = calcHash(['ab', 'c']);
	expect(typeof h0).toEqual('string');
	const h1 = calcHash(['a', 'bc']);
	expect(h0).not.toEqual(h1);
});
