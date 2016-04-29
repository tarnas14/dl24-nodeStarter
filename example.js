'use strict';
const request = require('request');

const dl24client = require('./dl24client');

const gameLoop = (service) => {
    service.nextTurn();
};

const post = (data) => {
    request.post({
        url: 'http://localhost:3001/log',
        json: true,
        body: data
    }, (error, incomingMessage, body) => {
        console.log(body);
    });
};

const emitter = dl24client({username: 'zenek', password: 'gitara'}, gameLoop);
emitter.on('error', (error) => post(JSON.stringify(error)));
emitter.on('waiting', (millisecondsTillNextTurn) => post({millisecondsTillNextTurn}));
emitter.on('receivedFromServer', (data) => post(data));
emitter.on('sentToServer', (command) => post(command));
