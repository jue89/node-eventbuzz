const {inspect} = require('util');
const serializationFactory = require('../serialization.js');

test('serialize and deserialize objects', () => {
	const obj = {
		a: {b: true, i: false, j: 1, k: null, l: undefined},
		c: {d: new Date(123456789000)},
		e: new RegExp('abc'),
		h: Buffer.alloc(0)
	};
	const {serialize, deserialize} = serializationFactory();
	const bin = serialize(obj);
	expect(bin).toBeInstanceOf(Buffer);
	expect(deserialize(bin)).toMatchObject(obj);
});

test('serialize and deserialize custom types', () => {
	class A { constructor (data) { Object.assign(this, data); } };
	class B { constructor (data) { Object.assign(this, data); } };
	const obj = {a: new A({x: 1}), b: [new B({y: -1}), new B({z: 0})]};
	const customTypes = [A, B];
	const {serialize, deserialize} = serializationFactory({customTypes});
	expect(inspect(deserialize(serialize(obj)))).toEqual(inspect(obj));
});

test('serialize and deserialize custom types with converter methods', () => {
	class A {
		constructor (data) { Object.assign(this, data); }
		toObject () { return this.a; }
		fromObject (obj) { this.b = obj; }
	};
	const obj = new A({a: 1, b: 2});
	const customTypes = [A];
	const {serialize, deserialize} = serializationFactory({customTypes});
	const obj2 = deserialize(serialize(obj));
	expect(obj2).toBeInstanceOf(A);
	expect(obj2.a).toBeUndefined();
	expect(obj2.b).toBe(1);
});

test('serialize custom types even if the converter method returns the class itself', () => {
	class A {
		toObject () { return this; }
	};
	const obj = new A();
	const customTypes = [A];
	const {serialize} = serializationFactory({customTypes});
	expect(serialize(obj)).toBeInstanceOf(Buffer);
});

test('serialize and deserialize custom types with static converter methods', () => {
	class A {
		constructor (data) { Object.assign(this, data); }
		static toObject (inst) { return inst.a; }
		static fromObject (obj) { return new A({b: obj}); }
	};
	const obj = new A({a: 1, b: 2});
	const customTypes = [A];
	const {serialize, deserialize} = serializationFactory({customTypes});
	const obj2 = deserialize(serialize(obj));
	expect(obj2).toBeInstanceOf(A);
	expect(obj2.b).toBe(1);
	expect(obj2.a).toBeUndefined();
});
