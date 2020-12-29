# Eventbuzz

A tiny event-sourcing framework.

## Concept

* *Eventbuzz* is a store for *events*. Every *event* has the following properties:
   * `src`: The source of the event.
   * `event`: The event's name.
   * `timestamp`: The Unix timestamp in milliseconds when the event occurred.
   * `payload`: An object attached to the event.
* *Events* are created by an *event source*. Every *event source* writes to eventstore stating its name, which is referred to the event's `src` property, the event's name `event` and a `payload`. The timestamp is added by *Eventbuzz*.
* *Events* are consumed by an *event sink*. The *event sink* holds a state which is mutated with every incoming *event*. An *event sink* may listens to more than one *event source*.

## API

```js
const {openEventstore} = require('eventbuzz');
openEventstore(dir).then((eventstore) => {...});
```

Opens an eventstore located in the directory `dir`. `eventstore` is an instance of **Eventstore**

### Class: Eventstore

#### Method: source()

```js
eventstore.source(src).then((source) => { ... });
```

Opens the event stream for the *event source* `src` with write access. `source` is an instance of **Source**.

#### Method: sink()

```js
eventstore.sink(opts).then((source) => { ... });
```

Listens to the event streams of one or many *event sources*. `sink` is an instance of **Sink**. `opts` is an object with the following properties:

* `init`: A function returning a freshly initialized state: `() => new MyState()`. `MyState` is a class which may implement the following methods:
   * `static getSchemeVersion()`: Returns a version number for the scheme of the sink. This ensures that a cached state must be invalidized. Default: `return undefined;`.
   * `toObject()`: Returns an object that represents the current state. Default: `return this;`
   * `fromObject(obj)`: Restores the state from `obj`. Default: `Object.assign(this, obj);`
* `handler`: An Object indicating which sources and which events to listen to. (See the example down below for further information.)
* `observer`: A function that is called in every sink's state (include the initial, resp. cached): `(state) => {...}`. May return a promise to throttle event processing.
* `storeInterval`: An interval in milliseconds. If the state changes, it will be cached on disk after the given time. Default: `2000`.

An example for the `handler` property:

```js
{
	handler: {
		'srcA': {
			'eventA': (state, {timestamp, src, event, payload}) => {...},
			'eventB': (state, {timestamp, src, event, payload}) => {...}
		},
		'srcB': {
			'eventA': (state, {timestamp, src, event, payload}) => {...},
		}
	}
}
```

This configuration will listen to the *event sources* `'srcA'` and `'srcB'`. For every event, the sink is interested in, an event handler is installed: `(state, {timestamp, src, event, payload}) => {...}`. This handler should modify `state`. Events will fire ordered by their timestamp. (Exception: if two different *event sources* fire at the same time, i.e. the event's timestamps are close to each other, the strict order is not guaranteed.)

### Class: Source

#### Method: emit()

```js
source.emit(event[, payload]).then(() => {...});
```

Stores an *event* with the name `event`. The optional `payload` is stored along with the event. Returns a promise that is resolved once the event has been written into the store.

#### Method: close()

```js
source.close().then(() => {...});
```

Closes the event stream. Resolves once it has been closed.

### Class: Sink

#### Property: state

An object containing the current state.

#### Event: change

```js
sink.on('change', (state, {timestamp, src, event, payload}) => {...});
```

Fired after an event changed the sink's state.

#### Event: cached

```js
sink.on('cached', () => {...});
```

Fired after an the state has been written to disk.

#### Event: error

```js
sink.on('error', (err) => {...});
```

Fired if one of the event handlers or observer throw an error.


## Example

This is a hand counter that can be controlled by signals sent to the process.

### Source

Listens to signals sent to the process:
* `SIGUSR1` increments the count
* `SIGUSR2` decrements the count

```js
const {openEventstore} = require('eventbuzz');

openEventstore('events').then(async (eventstore) => {
	const source = await eventstore.source('transactions');

	// Listen for signals
	process.on('SIGUSR1', () => source.emit('inc', 1));
	process.on('SIGUSR2', () => source.emit('dec', 1));
	console.log(`Increment: kill -USR1 ${process.pid}`);
	console.log(`Decrement: kill -USR2 ${process.pid}`);

	// NOOP interval to keep the process running
	const interval = setInterval(() => {}, 100000);
	process.on('SIGINT', () => {
		clearInterval(interval);
		source.close();
	});
});
```

### Sink

```js
const {openEventstore} = require('eventbuzz');

class Counter {
	static getSchemeVersion () { return 1; }
	constructor () { this.counter = 0; }
	inc (cnt) { this.counter += cnt; }
	dec (cnt) { this.counter -= cnt; }
	getCounter () { return this.counter; }
}

openEventstore('events').then(async (eventstore) => {
	const sink = await eventstore.sink({
		init: () => new Counter(),
		handler: {
			'transactions': {
				'inc': (state, {payload}) => state.inc(payload),
				'dec': (state, {payload}) => state.dec(payload)
			}
		}
	});
	sink.on('change', (state) => console.log('New counter value:', state.getCounter()));
	process.on('SIGINT', () => sink.close());
	console.log(`Get current count: kill -USR1 ${process.pid}`);
	process.on('SIGUSR1', () => console.log('Current counter value:', sink.state.getCounter()));
});
```
