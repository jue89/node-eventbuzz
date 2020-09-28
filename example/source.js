const {openEventstore} = require('..');

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
