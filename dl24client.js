'use strict';
const net = require('net');
const EventEmitter = require('events').EventEmitter;

String.prototype.withTerminator = function withTerminator () {
    return `${this.toString()}\n`;
};

String.prototype.sanitized = function sanitized () {
    return this.toString().trim().toLowerCase().replace('\r', '');
};

const getMillisecondsTillNextTurnFromServerResponse = (waitingResponse) => {
    const waitingRegex = /^waiting (.+)$/;
    const [, timeTillNextTurnInSeconds] = waitingRegex.exec(waitingResponse);

    return parseFloat(timeTillNextTurnInSeconds) * 1000;
};

const getErrorFromServerResponse = (errorResponse) => {
    const errorRegex = /^failed (\d+) ([\w|\s]+)$/;
    const [, code, message] = errorRegex.exec(errorResponse);

    return {
        code,
        message
    };
};

let turn = 1;

const dl24client = ({port, host, username, password}, gameLoop) => {
    const eventEmitter = new EventEmitter();
    const waitTillNextTurn = (waitResponse, connection, commandHandler, callback) => {
        connection.removeListener('data', commandHandler);
        const millisecondsTillNextTurn = getMillisecondsTillNextTurnFromServerResponse(waitResponse);

        eventEmitter.emit('waiting', millisecondsTillNextTurn);

        connection.on('data', function waitingHandler (waitingData) {
            if (waitingData === '\n') {
                return;
            }

            connection.removeListener('data', waitingHandler);
            if (waitingData.sanitized() !== 'ok') {
                eventEmitter.emit('error', `was waiting for next turn, got ${waitingData}`);
            }

            callback();
        });

        return;
    };

    const connection = net.createConnection(port, host);
    connection.setEncoding('utf8');

    const emitDebug = (debugData, description) => {
        eventEmitter.emit('debug', {
            description,
            debugData
        });
    };

    const startGameLoop = (service) => {
        console.log(`turn ${turn++}`);
        gameLoop(service);
    };

    const service = {
        singleLineResponseQuery (query, callback) {
            this.multilineResponseQuery(query, 1, arrayResponse => {
                const [response] = arrayResponse;

                callback(response || '');
            });
        },
        multilineResponseQuery (query, expectedNumberOfLines, callback) {
            if (!query.length) {
                callback();

                return;
            }

            connection.on('data', function commandHandler (data) {
                const saneData = data.sanitized();

                if (data === '\n' || saneData === 'ok') {
                    return;
                }

                emitDebug({query, expectedNumberOfLines, data}, 'im going insane, ha ha');

                if (saneData.startsWith('failed')) {
                    connection.removeListener('data', commandHandler);

                    setTimeout(gameLoop.bind(null, service), 1000);
                    eventEmitter.emit('error', getErrorFromServerResponse(saneData));

                    return;
                }

                let responseLines = [];
                if (saneData.startsWith('ok')) {
                    responseLines = saneData.split('\n').map((line) => line.sanitized()).slice(1);
                } else {
                    responseLines = saneData.split('\n').map((line) => line.sanitized());
                }

                if (!expectedNumberOfLines) {
                    responseLines = responseLines.slice(1);
                }

                emitDebug(responseLines, 'handledMultiple lines');
                connection.removeListener('data', commandHandler);
                eventEmitter.emit('receivedFromServer', responseLines, query);

                callback(responseLines);
            });

            connection.write(query.withTerminator(), () => eventEmitter.emit('sentToServer', query));
        },
        nextTurn () {
            connection.on('data', function waitHandler (data) {
                if (data === '\n') {
                    return;
                }

                const saneData = data.sanitized();

                if (saneData.startsWith('waiting')) {
                    const millisecondsTillNextTurn = getMillisecondsTillNextTurnFromServerResponse(saneData);
                    eventEmitter.emit('waiting', millisecondsTillNextTurn);

                    return;
                }

                if (saneData === 'ok') {
                    connection.removeListener('data', waitHandler);
                    startGameLoop(service);

                    return;
                }
            });

            connection.write('WAIT'.withTerminator(), () => {});
        },
        command ({serverCommand, args}, callback) {
            if (!args.length) {
                callback();

                return;
            }

            let expectedOks = args.length;

            connection.on('data', function commandHandler (data) {
                if (data === '\n') {
                    return;
                }

                const saneData = data.sanitized();

                if (saneData.startsWith('failed')) {
                    connection.removeListener('data', commandHandler);

                    // setTimeout(startGameLoop.bind(null, service), 1000);
                    eventEmitter.emit('error', getErrorFromServerResponse(saneData));

                    // return;
                }

                if (saneData.startsWith('waiting')) {
                    waitTillNextTurn(saneData, connection, commandHandler, startGameLoop.bind(null, service));

                    return;
                }

                const oks = saneData.split('\n').map((line) => line.sanitized());

                eventEmitter.emit('receivedFromServer', oks, {serverCommand, args});

                expectedOks -= oks.length;

                if (expectedOks === 0) {
                    connection.removeListener('data', commandHandler);
                    callback();

                    return;
                }
            });

            args.forEach(arg => {
                const commandWithArgs = `${serverCommand} ${arg}`;
                connection.write(commandWithArgs.withTerminator(), () => {
                    eventEmitter.emit('sentToServer', commandWithArgs);
                });
            });
        },
        multipleQueries (queries, callback) {
            const queryStatus = {
                pending: '',
                inProgress: '1',
                done: '2'
            };

            const queryStack = queries.map(query => {
                const queryOnStack = query;
                queryOnStack.queryText = query.queryText;
                queryOnStack.expectedNumberOfLines = query.expectedNumberOfLines;
                queryOnStack.status = queryStatus.pending;

                return queryOnStack;
            });

            const myInterval = setInterval(() => {
                if (!queryStack.find(query => query.status !== queryStatus.done)) {
                    clearInterval(myInterval);

                    callback(queryStack);

                    return;
                }

                if (!queryStack.find(query => query.status === queryStatus.inProgress)) {
                    const queryToDo = queryStack.find(query => query.status === queryStatus.pending);
                    queryToDo.status = queryStatus.inProgress;
                    this.multilineResponseQuery(queryToDo.queryText, queryToDo.expectedNumberOfLines, response => {
                        queryToDo.response = response;
                        queryToDo.status = queryStatus.done;
                    });
                }
            }, 50);
        }
    };

    connection.on('data', function loginHandler (data) {
        if (data.sanitized() === 'login') {
            connection.write(username.withTerminator(), () => eventEmitter.emit('sentToServer', username));

            return;
        }

        if (data.sanitized() === 'pass') {
            connection.write(password.withTerminator(), () => eventEmitter.emit('sentToServer', password));

            return;
        }

        if (data.sanitized() === 'ok') {
            connection.removeListener('data', loginHandler);
            startGameLoop(service);
        }
    });

    connection.on('data', (data) => {
        eventEmitter.emit('rawData', {rawData: data, sanitized: data.sanitized()});
    });

    connection.on('error', (error) => {
        console.log('error', error);
    });

    connection.on('close', () => {
        console.log('connection closed wtf');
    });

    return eventEmitter;
};

module.exports = dl24client;
