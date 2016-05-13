'use strict';
const namespace = process.argv[2] || 'example';

const dl24client = require('../../dl24client');
const config = require('./config');
const logger = require('../../logger')(namespace, config.loggerPort);
const gridder = require('../../gridder')(namespace, config.gridderPort);
const stateUpdater = require('../../stateUpdater')(namespace, config.stateUpdaterPort);

const range = (numberOfElements) => {
    return Array.apply(null, Array(numberOfElements)).map((_, i) => i);
};

const getRandomInt = (min, max) => (Math.floor(Math.random() * (max - min)) + min);

const map = range(41).map(y => range(41).map(x => {
    const cellDefinition = {x: x, y: y};

    if (x === y || 40 - y === x) {
        cellDefinition.color = 'blue';
    }

    return cellDefinition;
}));

gridder.newGrid({map, styles: {background: 'green', side: 11}}, () => {
    setInterval(() => {
        gridder.updateCell({
            x: getRandomInt(0, 41),
            y: getRandomInt(0, 41),
            color: 'red',
        });
    }, 100);
});

stateUpdater.newState({some: 'state'}, () => console.log('updated state!'));

const gameLoop = (service) => {
    service.nextTurn();
};

const emitter = dl24client(config, gameLoop);
emitter.on('error', error => console.log(error));
// emitter.on('waiting', millisecondsTillNextTurn => console.log('waiting', millisecondsTillNextTurn));
emitter.on('readFromServer', data => console.log('S=>C:', data));
emitter.on('sentToServer', command => console.log('S<=C', command));
emitter.on('debug', data => console.log('DEBUG:', data));
