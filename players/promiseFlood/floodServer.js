'use strict';
const dl24client = require('../../dl24client');
const config = require('./config');

const gameLoop = (service) => {
    const nextTurn = () => service.nextTurn();

    service.write('MY_STAT')
    .then(() => {
        console.log('after write');
        return service.read(2);
    })
    .then(([, myStats]) => console.log('promise result', myStats))
    .then(() => nextTurn())
    .catch(errr => {
        console.log(`error: ${errr}`);
        nextTurn();
    });
};

const emitter = dl24client(config, gameLoop);
emitter.on('error', error => console.log(`error: ${error}`));
emitter.on('waiting', millisecondsTillNextTurn => console.log(`waiting ${millisecondsTillNextTurn}`));
emitter.on('receivedFromServer', data => console.log(`received ${data}`));
emitter.on('sentToServer', command => console.log(`sent ${command}`));
// emitter.on('rawData', data => console.log(`raw: ${data}`));
