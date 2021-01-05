const {Encoder, Decoder} = require('borc');

const TAG = 32899;

module.exports = ({customTypes} = {}) => {
	if (!customTypes) customTypes = [];
	const genTypes = customTypes.map((cls) => [cls, (gen, obj) => {
		// Get instance data
		let objData = obj.toObject ? obj.toObject() : Object.assign({}, obj);
		// Make sure data is class-less. Otherwise this results in a endless-loop.
		if (objData instanceof cls) objData = Object.assign({}, objData);
		// Push data into CBOR stream
		return gen._pushTag(TAG) && gen.pushAny([cls.name, objData]);
	}]);
	const clsByName = Object.fromEntries(customTypes.map((cls) => [cls.name, cls]));
	const tags = Object.fromEntries([[TAG, ([name, objData]) => {
		// Create new instance
		const obj = new clsByName[name]();
		// Assign data from CBOR object
		if (obj.fromObject) obj.fromObject(objData);
		else Object.assign(obj, objData);
		return obj;
	}]]);

	function serialize (data) {
		const bin = new Encoder({genTypes});
		bin.pushAny(data);
		return bin.finalize();
	}

	function deserialize (bin) {
		const data = new Decoder({tags, size: bin.length});
		return data.decodeFirst(bin);
	}

	return {serialize, deserialize};
};
