'use strict';
const dl24client = require('../../dl24client');
const config = require('./config');

const gameLoop = (service) => {
    const nextTurn = () => service.nextTurn();

    service.multiWrite(['DESCRIBE_WORLD', 'FLOOD_STATUS', 'FORECAST', 'LIST_OBJECTS', 'LIST_WORKERS'])
    .then(() => service.fancyRead(1))
    .then(([worldResponse]) => console.log('setting world: ', worldResponse))
    .then(() => service.fancyRead(1))
    .then(([floodStatus]) => console.log('FLOOD STATUS: ', floodStatus))
    .then(() => service.fancyMultipleRead())
    .then(forecastLines => console.log('FORECAST: ', forecastLines))
    .then(() => service.fancyMultipleRead())
    .then(objectsLines => console.log('OBJECTS: ', objectsLines))
    .then(() => service.fancyMultipleRead())
    .then(workersLines => console.log('WORKERS: ', workersLines))
    .then(() => nextTurn());
};

const emitter = dl24client(config, gameLoop);
emitter.on('error', error => console.log(`error: ${error}`));
emitter.on('waiting', millisecondsTillNextTurn => console.log(`waiting ${millisecondsTillNextTurn}`));
// emitter.on('receivedFromServer', data => console.log(`received ${data}`));
// emitter.on('sentToServer', command => console.log(`sent ${command}`));
// emitter.on('rawData', data => console.log(`raw: ${data}`));
