'use strict';
const namespace = process.argv[2] || 'example';

const dl24client = require('../../dl24client');
const logger = require('../../logger')(namespace);
const gridder = require('../../gridder')(namespace);
const config = require('./config');

// const range = (numberOfElements) => {
//     return Array.apply(null, Array(numberOfElements)).map((_, i) => i);
// };

// const getRandomInt = (min, max) => (Math.floor(Math.random() * (max - min)) + min);

// const map = range(41).map(y => range(41).map(x => {
//     const cellDefinition = {x: x, y: y};

//     if (x === y || 40 - y === x) {
//         cellDefinition.color = 'blue';
//     }

//     return cellDefinition;
// }));

// gridder.newGrid(map, () => {
//     setInterval(() => {
//         gridder.updateCell({
//             x: getRandomInt(0, 41),
//             y: getRandomInt(0, 41),
//             color: 'red'
//         });
//     }, 100);
// });

const gameLoop = (service) => {
    service.sendCommand({serverCommand: 'DESCRIBE_WORLD', expectedLines: 1}, ([response]) => {
        console.log(response);
        service.nextTurn();
    });
};

const emitter = dl24client(config, gameLoop);
emitter.on('error', (error) => console.log(error));
emitter.on('error', (error) => logger.info(error));
emitter.on('waiting', (millisecondsTillNextTurn) => logger.info('waiting', {millisecondsTillNextTurn}));
emitter.on('receivedFromServer', (data) => logger.info('receivedFromServer', data));
emitter.on('sentToServer', (command) => logger.info('sentToServer', command));
emitter.on('rawData', (data) => logger.info('raw data from server', {data: data}));
