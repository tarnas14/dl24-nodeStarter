'use strict';
const dl24client = require('./dl24client');

const gameLoop = (service) => {
    service.nextTurn();
};

const emitter = dl24client({username: 'zenek', password: 'gitara'}, gameLoop);
emitter.on('error', (error) => console.log('error', error));
emitter.on('waiting', (millisecondsTillNextTurn) => console.log('waiting for next turn', millisecondsTillNextTurn));
emitter.on('receivedFromServer', (data) => console.log('received', data));
emitter.on('sentToServer', (command) => console.log('sentToServer', command));
