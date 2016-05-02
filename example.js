'use strict';
const namespace = process.argv[2] || 'example';

const dl24client = require('./dl24client');
const logger = require('./logger')(namespace);

const gameLoop = (service) => {
    service.nextTurn();
};

const emitter = dl24client({username: 'zenek', password: 'gitara'}, gameLoop);
emitter.on('error', (error) => logger.info(error));
emitter.on('waiting', (millisecondsTillNextTurn) => logger.info('waiting', {millisecondsTillNextTurn}));
emitter.on('receivedFromServer', (data) => logger.info('receivedFromServer', data));
emitter.on('sentToServer', (command) => logger.info('sentToServer', command));
