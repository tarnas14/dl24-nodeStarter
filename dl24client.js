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
        sendCommandWithSingleLineResponse (command, callback) {
            if (command.expectedLines !== 0) {
                let responseLine = '';
                let waitingTillNextTurn = false;

                connection.on('data', function commandHandler (data) {
                    if (data === '\n') {
                        return;
                    }

                    const saneData = data.sanitized();

                    if (saneData.startsWith('failed')) {
                        connection.removeListener('data', commandHandler);

                        setTimeout(startGameLoop.bnd(null, this), 1000);
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
                        eventEmitter.emit('receivedFromServer', responseLine, command);
                        callback(responseLine);

                        return;
                    }
                });
            }

            connection.write(command.withTerminator(), () => eventEmitter.emit('sentToServer', command));
        },
        sendCommandWithMultipleLineResponse (command, callback) {
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
                    const numberOfExpectedLiens = parseInt(responseLines[0], 10);
                    if (numberOfExpectedLiens === 0) {
                        connection.removeListener('data', commandHandler);
                        eventEmitter.emit('receivedFromServer', lines, command);
                        callback(lines);
                    }
                    lines = responseLines.slice(1);
                } else {
                    const responseLines = saneData.split('\n').map((line) => line.sanitized());
                    const numberOfExpectedLiens = parseInt(responseLines[0], 10);
                    if (numberOfExpectedLiens === 0) {
                        connection.removeListener('data', commandHandler);
                        eventEmitter.emit('receivedFromServer', lines, command);
                        callback(lines);
                    }
                    lines = responseLines.slice(1);
                }

                if (lines.length) {
                    connection.removeListener('data', commandHandler);
                    eventEmitter.emit('receivedFromServer', lines, command);
                    callback(lines);

                    return;
                }
            });

            connection.write(command.withTerminator(), () => eventEmitter.emit('sentToServer', command));
        },
        nextTurn () {
            this.sendCommandWithSingleLineResponse('wait', () => {});
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
