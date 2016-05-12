'use strict';
require('./utils/tcpStringUtils')();

const net = require('net');
const EventEmitter = require('events').EventEmitter;

const lockedArrayFactory = () => {
    let array = [];
    let locked = false;

    return {
        whenUnlocked (callback) {
            if (!locked) {
                locked = true;
                const newArray = callback(() => array);
                if (newArray) {
                    array = newArray;
                }
                locked = false;

                return;
            }

            const interval = setInterval(() => {
                this.whenUnlocked(getUnlockedArray => {
                    clearInterval(interval);
                    callback(getUnlockedArray);
                });
            }, 100);
        },
        reset () {
            this.whenUnlocked(() => []);
        },
    };
};

const emitDebug = (emitter, debugData, description) => {
    emitter.emit('debug', {
        description,
        debugData,
    });
};

const getMillisecondsTillNextTurnFromServerResponse = (waitingResponse) => {
    const waitingRegex = /^waiting (.+)$/;
    const [, timeTillNextTurnInSeconds] = waitingRegex.exec(waitingResponse.toLowerCase());

    return parseFloat(timeTillNextTurnInSeconds) * 1000;
};

const getErrorFromServerResponse = (errorResponse) => {
    const errorRegex = /^failed (\d+) (.+)/;
    try {
        const [, code, message] = errorRegex.exec(errorResponse);

        return {
            code,
            message,
        };
    } catch (error) {
        return {
            code: 'error with regex lol',
            mesage: error.toString(),
        };
    }
};

let turn = 1;

const dl24client = ({port, host, username, password}, gameLoop) => {
    const lockedArray = lockedArrayFactory();
    const eventEmitter = new EventEmitter();
    const connection = net.createConnection(port, host);
    connection.setEncoding('utf8');

    const startGameLoop = (service) => {
        console.log(`turn ${turn++}`);
        lockedArray.reset();
        gameLoop(service);
    };

    connection.on('data', (data) => {
        lockedArray.whenUnlocked(getSafeArray => {
            const lines = data.sanitized().split('\n').map((line) => line.sanitized()).filter(line => line);

            eventEmitter.emit('rawData', data);

            return [...getSafeArray(), ...lines];
        });
    });

    const promisingService = {
        multiWrite (multipleData) {
            return new Promise((resolve) => {
                const data = multipleData.join('\n').withTerminator();
                connection.write(data, () => {
                    eventEmitter.emit('sentToServer', multipleData);
                    resolve();
                });
            });
        },
        write (data) {
            return new Promise((resolve) => {
                connection.write(data.withTerminator(), () => {
                    eventEmitter.emit('sentToServer', data);
                    resolve();
                });
            });
        },
        read (lines) {
            return new Promise((resolve, reject) => {
                lockedArray.whenUnlocked(getSafeArray => {
                    const doRead = () => {
                        const readLines = [];
                        for (let i = 0; i < lines; ++i) {
                            readLines.push(getSafeArray().shift());
                        }

                        const error = readLines.find(readLine => readLine.toLowerCase().startsWith('failed'));
                        if (error) {
                            eventEmitter.emit('error', getErrorFromServerResponse(error));
                            reject(promisingService);

                            return;
                        }

                        eventEmitter.emit('readFromServer', readLines);
                        resolve(readLines);
                    };

                    if (lines <= getSafeArray().length) {
                        doRead();

                        return;
                    }

                    const interval = setInterval(() => {
                        if (lines <= getSafeArray().length) {
                            clearInterval(interval);
                            doRead();

                            return;
                        }
                    }, 100);
                });
            });
        },
        fancyRead (linesAfterOk) {
            return new Promise((resolve, reject) => {
                this.read(linesAfterOk + 1)
                .then(results => resolve(results.slice(1)))
                .catch(reject);
            });
        },
        fancyMultipleRead () {
            return new Promise((resolve, reject) => {
                this.fancyRead(1)
                .then(expectedResultCount => this.read(parseInt(expectedResultCount, 10)))
                .then(resolve)
                .catch(reject);
            });
        },
        nextTurn () {
            this.write('WAIT')
            .then(() => this.read(2))
            .then(([, data]) => {
                if (!data.toLowerCase().startsWith('waiting')) {
                    return Promise.reject(`expected waiting response, got '${data}'`);
                }

                const millisecondsTillNextTurn = getMillisecondsTillNextTurnFromServerResponse(data);
                eventEmitter.emit('waiting', millisecondsTillNextTurn);

                return this.read(1);
            })
            .then(() => {
                startGameLoop(promisingService);
            })
            .catch(rejectReason => {
                eventEmitter.emit('error', rejectReason);
            });
        },
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
            lockedArray.reset();
            startGameLoop(promisingService);
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
