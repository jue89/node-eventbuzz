module.exports.mkdir = jest.fn((a, cb) => cb(null));
module.exports.readFile = jest.fn((a, cb) => cb(null, Buffer.alloc(0)));
module.exports.writeFile = jest.fn((a, b, cb) => cb(null));
module.exports.rename = jest.fn((a, b, cb) => cb(null));
module.exports.stat = jest.fn((a, cb) => cb(null, {}));
