'use strict';
const net = require('net');

const config = require('./config');
require('../utils/tcpStringUtils')();

const server = net.createServer();

const state = {
    startedCommunication: false,
    waitingForLogin: true,
    loggedIn: false,
    turn: 0,
    turnEnd: (new Date()).getTime() + config.turnTime * 1000,
    waiting: false,
};

const write = (socket, data, callback) => {
    socket.write(data.withTerminator(), () => {
        console.log(`S=>C: ${data}`);

        if (callback) {
            callback();
        }
    });
};

setInterval(() => {
    state.turn += 1;
    state.turnEnd = (new Date()).getTime() + config.turnTime * 1000;
    state.waiting = false;
}, config.turnTime * 1000);

server.on('connection', socket => {
    console.log('new connection!');

    socket.setEncoding('utf8');

    socket.on('data', data => console.log(`S<=C: ${data.sanitized()}`));

    socket.on('data', data => {
        if (!state.startedCommunication || state.waiting) {
            return;
        }

        if (state.waitingForLogin) {
            const login = data.sanitized();

            if (login === config.login) {
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

            if (pass === config.pass) {
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
                const tillNextTurn = state.turnEnd - (new Date()).getTime();
                state.waiting = true;

                setTimeout(() => {
                    write(socket, 'OK', () => {
                        state.waiting = false;
                    });
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
    console.log(`Server is listening on ${config.port}`);
});

server.on('error', error => {
    console.log(`ERROR: ${error.message}`);
});

server.listen(config.port);
