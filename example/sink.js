const {openEventstore} = require('..');

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
	sink.on('cached', () => console.log('Cached to disk'));
	process.on('SIGINT', () => sink.close());
	console.log(`Get current count: kill -USR1 ${process.pid}`);
	process.on('SIGUSR1', () => console.log('Current counter value:', sink.state.getCounter()));
});
