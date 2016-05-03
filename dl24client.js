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

const dl24client = ({port, host, username, password}, gameLoop) => {
    const eventEmitter = new EventEmitter();
    const connection = net.createConnection(port, host);
    connection.setEncoding('utf8');

    const service = {
        sendCommand (command, callback) {
            if (command.expectedLines !== 0) {
                let serverResponseLineCounter = command.expectedLines;
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

                    if (saneData.startsWith('waiting')) {
                        connection.removeListener('data', commandHandler);
                        const millisecondsTillNextTurn = getMillisecondsTillNextTurnFromServerResponse(saneData);

                        setTimeout(gameLoop.bind(null, service), millisecondsTillNextTurn);
                        eventEmitter.emit('waiting', millisecondsTillNextTurn);

                        return;
                    }

                    if (saneData.startsWith('ok')) {
                        lines = saneData.split('\n').map((line) => line.sanitized());
                        lines.splice(lines.indexOf('ok'), 1);
                        serverResponseLineCounter -= lines.length;
                    } else {
                        lines.push(saneData);
                        serverResponseLineCounter -= 1;
                    }

                    if (serverResponseLineCounter === 0) {
                        connection.removeListener('data', commandHandler);
                        eventEmitter.emit('receivedFromServer', lines, command);
                        callback(lines);

                        return;
                    }
                });
            }

            connection.write(command.serverCommand.withTerminator(), () => eventEmitter.emit('sentToServer', command));
        },
        nextTurn () {
            this.sendCommand({serverCommand: 'wait', expectedLines: 1}, () => {});
        }
    };

    connection.on('data', function loginHandler (data) {
        if (data.sanitized() === 'login') {
            connection.write(username.withTerminator());

            return;
        }

        if (data.sanitized() === 'pass') {
            connection.write(password);

            return;
        }

        if (data.sanitized() === 'ok') {
            connection.removeListener('data', loginHandler);
            gameLoop(service);
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
