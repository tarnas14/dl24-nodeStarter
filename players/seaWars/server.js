'use strict';
const namespace = process.argv[2] || 'example';

const dl24client = require('../../dl24client');
const logger = require('../../logger')(namespace);
const gridder = require('../../gridder')(namespace);
const config = require('./config');

let lastWorldDescriptor = '';

const TERRAIN_COLOURS = {
    water: '#89CFF0',
    island: '#009E60',
    port: '#C19A6B',
    tower: '#804000'
};

const LAND = {
    ISLAND: 'island',
    TOWER: 'tower',
    PORT: 'port'
};

const OWNER = {
    ME: 'me',
    ENEMY: 'enemy',
    NOBODY: 'nobody'
};

const range = (numberOfElements) => {
    return Array.apply(null, Array(numberOfElements)).map((_, i) => i);
};

const gameLoop = (service) => {
    service.sendCommandWithSingleLineResponse('DESCRIBE_WORLD', (wolrdDescriptionResponse) => {
        const [mapSide, minArtifacts, turnTime] = wolrdDescriptionResponse.split(' ');
        const worldDescriptor = `${mapSide} ${minArtifacts} ${turnTime}`;

        if (worldDescriptor !== lastWorldDescriptor) {
            console.log('new grid for ', worldDescriptor);
            const map = range(parseInt(mapSide, 10)).map(y => range(parseInt(mapSide, 10)).map(x => {
                return {x: x, y: y};
            }));
            gridder.newGrid({
                map,
                styles: {
                    side: 5,
                    background: TERRAIN_COLOURS.water
                }
            });

            lastWorldDescriptor = worldDescriptor;
        }

        service.sendCommandWithMultipleLineResponse('LIST_LANDS_NEARBY', (nearbyLandsResponse) => {
            const nearbyLands = nearbyLandsResponse.map(landResponseString => {
                const [x, y, type, owner, hp] = landResponseString.split(' ');

                return {
                    type,
                    owner,
                    hp,
                    x: parseInt(x, 10),
                    y: parseInt(y, 10),
                    color: TERRAIN_COLOURS[type]
                };
            });

            service.sendCommandWithMultipleLineResponse('LIST_SHIPS', (shipsResponse) => {
                const ships = shipsResponse.map(shipResponse => {
                    const [id, x, y, type, hp] = shipResponse.split(' ');

                    return {
                        id,
                        type,
                        hp,
                        x: parseInt(x, 10),
                        y: parseInt(y, 10),
                        color: 'black'
                    };
                });

                service.sendCommandWithMultipleLineResponse('LIST_PRIMARY_TARGETS', (primaryTargetsResponse) => {
                    const targets = primaryTargetsResponse.map(targetResponse => {
                        const [x, y, type, hp] = targetResponse.split(' ');

                        return {
                            type,
                            hp,
                            x: parseInt(x, 10),
                            y: parseInt(y, 10),
                            color: 'red'
                        };
                    });

                    nearbyLands.forEach(nearbyLand => {
                        gridder.updateCell(nearbyLand);
                    });

                    ships.forEach(ship => {
                        gridder.updateCell(ship);
                    });

                    targets.forEach(target => {
                        gridder.updateCell(target);
                    });

                    service.nextTurn();
                });
            });
        });
    });
};

const emitter = dl24client(config, gameLoop);
emitter.on('error', error => console.log(error));
emitter.on('error', error => logger.info(error));
emitter.on('waiting', millisecondsTillNextTurn => logger.info('waiting', {millisecondsTillNextTurn}));
emitter.on('receivedFromServer', (data, command) => logger.info('receivedFromServer', {received: data, after: command}));
emitter.on('sentToServer', command => logger.info('sentToServer', command));
emitter.on('rawData', data => logger.info('raw data from server', {data: data}));
emitter.on('debug', data => logger.debug(data));
