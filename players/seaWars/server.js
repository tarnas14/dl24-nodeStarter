'use strict';
const tileTypes = {
    water: 'water',
    enemyShip: 'enemyShip',
    land: 'land',
    myShip: 'myShip'
};

const shipTypes = ['CRUISER', 'DESTROYER', 'PATROL'];

const TERRAIN_COLOURS = {
    water: '#89CFF0',
    island: '#009E60',
    port: '#C19A6B',
    tower: '#804000'
};

const theGameFactory = (gridder, logger) => {
    let state = {};

    const range = numberOfElements => {
        return Array.apply(null, Array(numberOfElements)).map((_, i) => i);
    };

    const markShipOnMap = ship => {
        gridder.updateCell(ship);
        state.map[ship.y][ship.x] = ship;
        state.ships.push(ship);
    };

    const removeShipFromMap = ship => {
        const waterTile = {x: ship.x, y: ship.y, tileType: tileTypes.water};
        gridder.updateCell(waterTile);
        state.map[waterTile.y][waterTile.x] = waterTile;

        const shipIndex = state.ships.indexOf(ship);
        if (shipIndex === -1) {
            return;
        }
        state.ships = [...state.ships.slice(0, shipIndex), ...state.ships.slice(shipIndex + 1)];
    };

    return {
        init (mapSide, minArtifacts, turnTime) {
            state = {
                mapSide: parseInt(mapSide, 10),
                minArtifacts: parseInt(minArtifacts, 10),
                turnTime,
                map: [],
                ships: []
            };

            state.map = range(state.mapSide).map(y => range(state.mapSide).map(x => {
                return {x: x, y: y, tileType: tileTypes.water};
            }));

            logger.debug(state);

            gridder.newGrid({
                map: state.map,
                styles: {
                    side: 5,
                    background: TERRAIN_COLOURS.water
                }
            });
        },
        chartLands (nearbyLandsResponse) {
            nearbyLandsResponse.forEach(landResponseString => {
                const [x, y, type, owner, hp] = landResponseString.split(' ');

                const nearbyLand = {
                    tileType: tileTypes.land,
                    type,
                    owner,
                    hp,
                    x: parseInt(x, 10),
                    y: parseInt(y, 10),
                    color: TERRAIN_COLOURS[type]
                };

                state.map[nearbyLand.y][nearbyLand.x] = nearbyLand;

                gridder.updateCell(nearbyLand);
            });
        },
        markTargets (primaryTargetsResponse) {
            primaryTargetsResponse.forEach(targetResponse => {
                const [x, y, type, hp] = targetResponse.split(' ');

                if (shipTypes.indexOf(type) === -1) {
                    return;
                }

                const target = {
                    tileType: tileTypes.enemyShip,
                    type,
                    hp,
                    x: parseInt(x, 10),
                    y: parseInt(y, 10),
                    color: 'red'
                };

                state.map[target.y][target.x] = target;

                gridder.updateCell(target);
            });
        },
        markShips (shipsResponse) {
            const ships = shipsResponse.map(shipResponse => {
                const [id, x, y, type, hp] = shipResponse.split(' ');

                return {
                    tileType: tileTypes.myShip,
                    id,
                    type,
                    hp,
                    x: parseInt(x, 10),
                    y: parseInt(y, 10),
                    color: 'black'
                };
            });

            ships.forEach(ship => {
                const shipInState = state.ships.find(s => s.id === ship.id);

                if (!shipInState) {
                    markShipOnMap(ship);

                    return;
                }

                const shipCoordinatesChanged = ship.x !== shipInState.x || ship.y !== shipInState.y;
                if (shipCoordinatesChanged) {
                    removeShipFromMap(shipInState);
                    markShipOnMap(ship);
                }
            });

            const destroyedShips = state.ships.filter(shipInState => !ships.find(s => s.id === shipInState.id));
            destroyedShips.forEach(destroyedShip => removeShipFromMap(destroyedShip));
        },
        getShips () {
            return state.ships;
        }
    };
};

const namespace = process.argv[2] || 'example';

const dl24client = require('../../dl24client');
const logger = require('../../logger')(namespace);
const gridder = require('../../gridder')(namespace);
const config = require('./config');

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

let lastWorldDescriptor = '';
let theGame = theGameFactory(gridder, logger);

const gameLoop = (service) => {
    service.singleLineResponseQuery('DESCRIBE_WORLD', (wolrdDescriptionResponse) => {
        const [mapSide, minArtifacts, turnTime] = wolrdDescriptionResponse.split(' ');
        const worldDescriptor = `${mapSide} ${minArtifacts} ${turnTime}`;

        if (worldDescriptor !== lastWorldDescriptor) {
            console.log('new grid for ', worldDescriptor);

            theGame.init(mapSide, minArtifacts, turnTime);

            lastWorldDescriptor = worldDescriptor;
        }

        service.multilineResponseQuery('LIST_LANDS_NEARBY', (nearbyLandsResponse) => {
            theGame.chartLands(nearbyLandsResponse);

            service.multilineResponseQuery('LIST_PRIMARY_TARGETS', (primaryTargetsResponse) => {
                theGame.markTargets(primaryTargetsResponse);

                service.multilineResponseQuery('LIST_SHIPS', (shipsResponse) => {
                    theGame.markShips(shipsResponse);

                    const moveCommandArgs = theGame.getShips().map(ship => {
                        return `${ship.id} 0 -1`;
                    });

                    service.command({serverCommand: 'MOVE', args: moveCommandArgs}, () => service.nextTurn());
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
