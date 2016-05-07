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

                callback(response);
            });
        },
        multilineResponseQuery (query, expectedNumberOfLines, callback) {
            let lines = [];

            connection.on('data', function commandHandler (data) {
                if (data === '\n') {
                    return;
                }

                const saneData = data.sanitized();

                if (saneData.startsWith('waiting')) {
                    waitTillNextTurn(saneData, connection, commandHandler, startGameLoop.bind(null, service));

                    return;
                }

                if (saneData.startsWith('failed')) {
                    connection.removeListener('data', commandHandler);

                    setTimeout(gameLoop.bind(null, service), 1000);
                    eventEmitter.emit('error', getErrorFromServerResponse(saneData));

                    return;
                }

                const handleMultipleLines = (responseLines) => {
                    const waitResponse = responseLines.find(line => line.startsWith('waiting'));

                    if (waitResponse) {
                        waitTillNextTurn(waitResponse, connection, commandHandler, startGameLoop.bind(null, service));
                    }

                    const numberOfExpectedLines = parseInt(expectedNumberOfLines || responseLines[0], 10);
                    if (numberOfExpectedLines === 0) {
                        connection.removeListener('data', commandHandler);
                        eventEmitter.emit('receivedFromServer', lines, query);
                        callback(lines);
                    }
                    if (!expectedNumberOfLines) {
                        lines = responseLines.slice(1);
                    } else {
                        lines = responseLines;
                    }
                };

                if (saneData.startsWith('ok')) {
                    handleMultipleLines(
                        saneData.split('\n').map((line) => line.sanitized()).slice(1)
                    );
                } else {
                    handleMultipleLines(
                        saneData.split('\n').map((line) => line.sanitized())
                    );
                }

                if (lines.length) {
                    connection.removeListener('data', commandHandler);
                    eventEmitter.emit('receivedFromServer', lines, query);
                    callback(lines);

                    return;
                }
            });

            connection.write(query.withTerminator(), () => eventEmitter.emit('sentToServer', query));
        },
        nextTurn () {
            this.singleLineResponseQuery('wait', () => {});
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

                    setTimeout(startGameLoop.bind(null, service), 1000);
                    eventEmitter.emit('error', getErrorFromServerResponse(saneData));

                    return;
                }

                if (saneData.startsWith('waiting')) {
                    waitTillNextTurn(saneData, connection, commandHandler, startGameLoop.bind(null, service));
                    return;
                }

                const oks = saneData.split('\n').map((line) => line.sanitized());

                if (oks.find(ok => ok !== 'ok')) {
                    eventEmitter.emit('error', {description: 'expected only oks after command wtf, fuck that, starting next turn immediately xD', oks});

                    connection.removeListener('data', commandHandler);
                    startGameLoop(service);
                }

                expectedOks -= oks.length;

                if (expectedOks === 0) {
                    connection.removeListener('data', commandHandler);
                    callback();

                    return;
                }
            });

            args.forEach(arg => {
                const commandWithArgs = `${serverCommand} ${arg}`;
                connection.write(commandWithArgs.withTerminator(), () => eventEmitter.emit('sentToServer', commandWithArgs));
            });
        },
        weirdShit ({serverCommand, args, expectedNumberOfLines}, callback) {

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
