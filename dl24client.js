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
            let responseLine = '';
            let waitingTillNextTurn = false;

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

                if (waitingTillNextTurn && saneData === 'ok') {
                    connection.removeListener('data', commandHandler);
                    startGameLoop(service);

                    return;
                }

                if (saneData.startsWith('ok')) {
                    responseLine = saneData.split('\n').map((line) => line.sanitized()).slice(1)[0];
                } else {
                    responseLine = saneData;
                }

                if (responseLine && responseLine.startsWith('waiting')) {
                    emitDebug({d: 'waitingTillNextTurn', responseLine});
                    waitingTillNextTurn = true;
                    const millisecondsTillNextTurn = getMillisecondsTillNextTurnFromServerResponse(responseLine);

                    eventEmitter.emit('waiting', millisecondsTillNextTurn);

                    return;
                }

                if (responseLine) {
                    connection.removeListener('data', commandHandler);
                    eventEmitter.emit('receivedFromServer', responseLine, query);
                    callback(responseLine);

                    return;
                }
            });

            connection.write(query.withTerminator(), () => eventEmitter.emit('sentToServer', query));
        },
        multilineResponseQuery (query, expectedNumberOfLines, callback) {
            let lines = [];

            connection.on('data', function commandHandler (data) {
                if (data === '\n') {
                    return;
                }

                const saneData = data.sanitized();

                if (saneData.startsWith('failed')) {
                    connection.removeListener('data', commandHandler);

                    setTimeout(gameLoop.bind(null, service), 1000);
                    eventEmitter.emit('error', getErrorFromServerResponse(saneData));

                    return;
                }

                if (saneData.startsWith('ok')) {
                    const responseLines = saneData.split('\n').map((line) => line.sanitized()).slice(1);
                    const numberOfExpectedLines = parseInt(
                        expectedNumberOfLines || responseLines[0], 10);
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
                } else {
                    const responseLines = saneData.split('\n').map((line) => line.sanitized());
                    const numberOfExpectedLines = parseInt(
                        expectedNumberOfLines || responseLines[0],
                        10);
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
            let expectedOks = args.length;
            let waitingTillNextTurn = false;

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

                if (waitingTillNextTurn && saneData === 'ok') {
                    connection.removeListener('data', commandHandler);
                    startGameLoop(service);

                    return;
                }

                if (saneData.startsWith('waiting')) {
                    emitDebug({d: 'waitingTillNextTurn', saneData});
                    waitingTillNextTurn = true;
                    const millisecondsTillNextTurn = getMillisecondsTillNextTurnFromServerResponse(saneData);

                    eventEmitter.emit('waiting', millisecondsTillNextTurn);

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
