'use strict';
const net = require('net');
const EventEmitter = require('events').EventEmitter;

String.prototype.withTerminator = function withTerminator () {
    return `${this.toString()}\n`;
};

String.prototype.sanitized = function sanitized () {
    return this.toString().trim().replace('\r', '');
};

const getMillisecondsTillNextTurnFromServerResponse = (waitingResponse) => {
    const waitingRegex = /^waiting (.+)$/;
    console.log('WAITING ====> ',waitingResponse.toLowerCase());
    const [, timeTillNextTurnInSeconds] = waitingRegex.exec(waitingResponse.toLowerCase());

    return parseFloat(timeTillNextTurnInSeconds) * 1000;
};

const getErrorFromServerResponse = (errorResponse) => {
    const errorRegex = /^failed (\d+) (.+)/;
    const [, code, message] = errorRegex.exec(errorResponse);

    return {
        code,
        message
    };
};

let turn = 1;

const lockerFactory = () => {
    let locked = false;

    return {
        whenUnlocked (callback) {
            if (!locked) {
                locked = true;
                callback();
                locked = false;

                return;
            }

            const interval = setInterval(() => {
                this.whenUnlocked(() => {
                    clearInterval(interval);
                    callback();
                });
            }, 100);
        }
    };
};

const dl24client = ({port, host, username, password}, gameLoop) => {
    const eventEmitter = new EventEmitter();
    const connection = net.createConnection(port, host);
    connection.setEncoding('utf8');

    let something = [];
    const lock = lockerFactory();
    connection.on('data', (data) => {
        lock.whenUnlocked(() => {
            const lines = data.sanitized().split('\n').map((line) => line.sanitized()).filter(line => line);
            something = [...something, ...lines];

            eventEmitter.emit('receivedFromServer', lines);
            eventEmitter.emit('rawData', {rawData: data, sanitized: data.sanitized()});
        });
    });

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
        multiWrite (queries, callback) {
            const query = queries.join('\n').withTerminator();
            connection.write(query, () => {
                eventEmitter.emit('sentToServer', query);
                callback();
            });
        },
        fancyRead (linesAfterOk, callback) {
            this.read(linesAfterOk + 1, (lines) => {
                callback(lines.slice(1));
            });
        },
        fancyMultipleRead (callback) {
            this.fancyRead(1, (countString) => {
                this.read(parseInt(countString, 10), callback);
            });
        },
        write (query, callback) {
            connection.write(query.withTerminator(), () => {
                eventEmitter.emit('sentToServer', query);
                callback();
            });
        },
        read (lines, callback) {
            lock.whenUnlocked(() => {
                const doRead = () => {
                    const readLines = [];
                    for (let i = 0; i < lines; ++i) {
                        readLines.push(something.shift());
                    }

                    const error = readLines.find(readLine => readLine.toLowerCase().startsWith('failed'));
                    if (error) {
                        eventEmitter.emit('error', getErrorFromServerResponse(error));
                    }

                    callback(readLines);
                };

                if (lines <= something.length) {
                    doRead();
                    return;
                }

                const interval = setInterval(() => {
                    if (lines <= something.length) {
                        clearInterval(interval);
                        doRead();

                        return;
                    }
                }, 100);
            });
        },
        simpleNextTurn () {
            this.write('WAIT', () => {
                this.fancyRead(1, ([data]) => {
                    const millisecondsTillNextTurn = getMillisecondsTillNextTurnFromServerResponse(data);
                    eventEmitter.emit('waiting', millisecondsTillNextTurn);

                    this.read(1, () => {
                        startGameLoop(service);
                    });
                });
            });
        }
    };

    connection.on('data', function loginHandler (data) {
        if (data.sanitized().toLowerCase() === 'login') {
            connection.write(username.withTerminator(), () => eventEmitter.emit('sentToServer', username));

            return;
        }

        if (data.sanitized().toLowerCase() === 'pass') {
            connection.write(password.withTerminator(), () => eventEmitter.emit('sentToServer', password));

            return;
        }

        if (data.sanitized().toLowerCase() === 'ok') {
            connection.removeListener('data', loginHandler);
            something = [];
            startGameLoop(service);
        }
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
