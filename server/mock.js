'use strict';
const net = require('net');
const EventEmitter = require('events').EventEmitter;
const range = require('../utils/range');

const getTimeMaster = (turnTime) => {
    let turn = 0;
    let turnEnd = null;

    const timeMaster = {
        start () {
            const nextTurn = () => {
                turnEnd = (new Date()).getTime() + turnTime * 1000;
                this.emit('nextTurn', ++turn);
            };

            nextTurn();
            setInterval(() => {
                nextTurn();
            }, turnTime * 1000);
        },
        getTimeTillNextTurn () {
            return turnEnd - (new Date()).getTime();
        },
    };

    return Object.assign(Object.create(EventEmitter.prototype), timeMaster);
};

require('../utils/tcpStringUtils')();

const server = net.createServer();

const write = (socket, data, callback) => {
    socket.write(data.withTerminator(), () => {
        console.log(`S=>C: ${data}`);

        if (callback) {
            callback();
        }
    });
};

const serverSettings = {
    port: 3033,
    login: 'zenek',
    pass: 'gitara',
    turnTime: 5,
};

const getInitialState = () => {
    return {
        startedCommunication: false,
        waitingForLogin: true,
        loggedIn: false,
        waiting: false,
    };
};

let state = getInitialState();

const timeMaster = getTimeMaster(serverSettings.turnTime);
timeMaster.on('nextTurn', (turnNumber) => {
    console.log(`Turn ${turnNumber}`);
});
timeMaster.start();

const game = (function game (turnTime) {
    const mapSide = 40;

    const objects = [
        {
            coordinates: {
                x: 18,
                y: 18,
            },
            size: {
                width: 2,
                height: 2,
            },
            bags: 666,
        },
        {
            coordinates: {
                x: 15,
                y: 15,
            },
            size: {
                width: 1,
                height: 2,
            },
            bags: 'NA',
        },
    ];

    const workers = [
        {
            id: 1,
            x: 18,
            y: 18,
            moving: false,
            capacity: 1,
            status: 0,
        },
    ];

    const bagPiles = [];

    const onObject = (worker, object) => {
        return worker.x >= object.coordinates.x &&
            worker.x < object.coordinates.x + object.size.width &&
            worker.y >= object.coordinates.y &&
            worker.y < object.coordinates.y + object.size.height;
    };

    return {
        handle (commands) {
            return commands.reduce((responseArray, command) => {
                switch (command[0]) {
                case ('DESCRIBE_WORLD'):
                    return [...responseArray, 'OK', `${mapSide}, 15, 7, ${turnTime}, 66, 22`];
                case ('LIST_OBJECTS'):
                    const objectResponses = objects.map(object => `${object.coordinates.x} ${object.coordinates.y} ${object.size.width} ${object.size.height}, 3, ${object.bags}`);
                    return [...responseArray, 'OK', objectResponses.length, ...objectResponses];
                case ('LIST_WORKERS'):
                    const workerResponses = workers.map(worker => `${worker.id} ${worker.x} ${worker.y} ${worker.moving ? 'Y' : 'N'} ${worker.capacity} ${worker.status}`);
                    return [...responseArray, 'OK', workerResponses.length, ...workerResponses];
                case ('FORECAST'):
                    return [...responseArray, 'OK', 0];
                case ('FLOOD_STATUS'):
                    return [...responseArray, 'OK', '0 NA'];
                case ('TAKE'):
                    const [, workerTakinBagsId, bagsToTake] = command;
                    const workerTakingBags = workers.find(w => w.id === parseInt(workerTakinBagsId, 10));

                    const bagsMagazine = objects.find(object => onObject(workerTakingBags, object));

                    bagsMagazine.bags -= bagsToTake;

                    return [...responseArray, 'OK', bagsToTake];
                case ('LEAVE'):
                    const [, workerLeavingBagsId] = command;
                    const bagsToLeave = parseInt(command[2], 10);
                    const workerLeavingBags = workers.find(w => w.id === parseInt(workerLeavingBagsId, 10));
                    const objectWorkerIsOn = objects.find(object => onObject(workerLeavingBags, object));

                    if (objectWorkerIsOn) {
                        objectWorkerIsOn.bags += bagsToLeave;

                        return [...responseArray, 'OK'];
                    }

                    const bagPileWorkerIsOn = bagPiles.find(pile => pile.x === workerLeavingBags.x && pile.y === workerLeavingBags.y);

                    if (bagPileWorkerIsOn) {
                        bagPileWorkerIsOn.bags += bagsToLeave;

                        return [...responseArray, 'OK'];
                    }

                    const freshBagPile = {x: workerLeavingBags.x, y: workerLeavingBags.y, bags: 0};

                    freshBagPile.bags += bagsToLeave;

                    bagPiles.push(freshBagPile);

                    return [...responseArray, 'OK'];
                case ('MOVE'):
                    const [, movingWorkerId, moveX, moveY] = command;
                    const movingWorker = workers.find(w => w.id === parseInt(movingWorkerId, 10));

                    movingWorker.x += parseInt(moveX, 10);
                    movingWorker.y += parseInt(moveY, 10);

                    return [...responseArray, 'OK'];
                default:
                    return responseArray;
                }
            }, []);
        },
    };
}(serverSettings.turnTime));

server.on('connection', socket => {
    console.log('new connection!');

    timeMaster.on('nextTurn', () => {
        state.waiting = false;
    });

    socket.setEncoding('utf8');

    socket.on('data', data => console.log(`S<=C: ${data.sanitized()}`));

    socket.on('data', data => {
        if (!state.startedCommunication || state.waiting) {
            return;
        }

        if (state.waitingForLogin) {
            const login = data.sanitized();

            if (login === serverSettings.login) {
                write(socket, 'PASS');
                state.waitingForLogin = false;

                return;
            }

            write(socket, 'FAILED 1 dunno this login');
            socket.end();
            server.close();

            return;
        }

        if (!state.loggedIn) {
            const pass = data.sanitized();

            if (pass === serverSettings.pass) {
                write(socket, 'OK');
                state.loggedIn = true;

                return;
            }

            write(socket, 'FAILED 2 wrong pass');
            socket.end();
            server.close();

            return;
        }

        let responses = [];
        const commands = data.split('\n').map(command => command.split(' '));

        const waitCommand = commands.find(command => command[0] === 'WAIT');

        if (waitCommand) {
            responses = game.handle(commands.slice(0, commands.indexOf(waitCommand)));

            state.waiting = true;
            const tillNextTurn = timeMaster.getTimeTillNextTurn();

            setTimeout(() => {
                write(socket, 'OK');
            }, tillNextTurn);

            responses.push('OK', `WAITING ${tillNextTurn / 1000}`);
        } else {
            responses = game.handle(commands);
        }

        write(socket, responses.join('\n'));
    });

    socket.on('error', error => {
        console.log('SOCKET ERROR: ', error);
        socket.end();
        state = getInitialState();
    });

    socket.on('end', () => {
        console.log('Socket ended');
    });

    write(socket, 'LOGIN', () => {
        state.startedCommunication = true;
    });
});

server.on('listening', () => {
    console.log(`Server is listening on ${serverSettings.port}`);
});

server.on('error', error => {
    console.log(`ERROR: ${error.message}`);
});

server.listen(serverSettings.port);
