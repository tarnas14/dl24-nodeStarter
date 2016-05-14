'use strict';
const net = require('net');

const EventEmitter = require('events').EventEmitter;

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

const state = {
    startedCommunication: false,
    waitingForLogin: true,
    loggedIn: false,
    waiting: false,
};

const timeMaster = getTimeMaster(serverSettings.turnTime);
timeMaster.on('nextTurn', (turnNumber) => {
    console.log(`Turn ${turnNumber}`);
});
timeMaster.start();

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

        let commands = data.split('\n').map(command => command.split(' '));

        const waitCommand = commands.find(command => command[0] === 'WAIT');

        if (waitCommand) {
            commands = commands.slice(0, commands.indexOf(waitCommand) + 1);
        }

        const responses = commands.reduce((responseArray, command) => {
            if (command[0] === 'WAIT') {
                state.waiting = true;
                const tillNextTurn = timeMaster.getTimeTillNextTurn();

                setTimeout(() => {
                    write(socket, 'OK');
                }, tillNextTurn);

                return [...responseArray, 'OK', `WAITING ${tillNextTurn / 1000}`];
            }

            return responseArray;
        }, []);

        write(socket, responses.join('\n'));
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
