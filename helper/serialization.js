const {Encoder, Decoder} = require('borc');

const TAG = 32899;

module.exports = ({customTypes} = {}) => {
	if (!customTypes) customTypes = [];
	const genTypes = customTypes.map((Cls) => [Cls, (gen, obj) => {
		// Get instance data
		let objData;
		if (Cls.toObject) {
			objData = Cls.toObject(obj);
		} else if (obj.toObject) {
			objData = obj.toObject();
		} else {
			objData = obj;
		}
		// Make sure data is class-less. Otherwise this results in a endless-loop.
		if (objData instanceof Cls) objData = Object.assign({}, objData);
		// Push data into CBOR stream
		return gen._pushTag(TAG) && gen.pushAny([Cls.name, objData]);
	}]);
	const clsByName = Object.fromEntries(customTypes.map((Cls) => [Cls.name, Cls]));
	const tags = Object.fromEntries([[TAG, ([name, objData]) => {
		const Cls = clsByName[name];
		if (Cls.fromObject) {
			// Let the static fromObject helper create the class
			return Cls.fromObject(objData);
		}

		// Create new instance
		const obj = new Cls();
		// Assign data from CBOR object
		if (obj.fromObject) {
			obj.fromObject(objData);
		} else {
			Object.assign(obj, objData);
		}
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
