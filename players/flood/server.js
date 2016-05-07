'use strict';
const theGameFactory = require('./theGameFactory');
const tileTypes = require('./tileTypes');

const namespace = process.argv[2] || 'flood';
const dl24client = require('../../dl24client');
const config = require('./config');
config.port = process.argv[3] || config.port;
config.loggerPort = process.argv[4] || config.loggerPort;
const logger = require('../../logger')(namespace, config.loggerPort);
const gridder = require('../../gridder')(namespace, config.gridderPort);
const stateUpdater = require('../../stateUpdater')(namespace, config.stateUpdaterPort);
const debugState = require('../../stateUpdater')('debug', config.stateUpdaterPort);

let lastWorldDescriptor = '';
let theGame = theGameFactory(gridder, logger, stateUpdater, debugState);

const getRandomInt = (min, max) => (Math.floor(Math.random() * (max - min)) + min);

const gameLoop = (service) => {
    service.singleLineResponseQuery('DESCRIBE_WORLD', (worldDescriptionResponse) => {
    service.multilineResponseQuery('LIST_OBJECTS', null, (objectsResponse) => {
    service.multilineResponseQuery('LIST_WORKERS', null, (workersResponse) => {
    service.singleLineResponseQuery('FLOOD_STATUS', (floodDescription) => {
    service.multilineResponseQuery('FORECAST', null, (forecastResponse) => {

        const [side, wheelBarrowPrice, goodPrognosis, turnTime, commandLimit] = worldDescriptionResponse.split(' ');

        const worldDescriptor = `${side} ${wheelBarrowPrice} ${goodPrognosis} ${turnTime} ${commandLimit}`;

        if (worldDescriptor !== lastWorldDescriptor) {
            theGame.init(worldDescriptionResponse);

            lastWorldDescriptor = worldDescriptor;
        }

        theGame.mapObjects(objectsResponse);
        theGame.mapWorkers(workersResponse);
        theGame.floodStatus(floodDescription);
        theGame.setForecast(forecastResponse);

        //move

        if (!theGame.getWorkers().length) {
            console.log('no workers, no problem');
            service.nextTurn();

            return;
        }

        if (theGame.isFlooding()) {
            const args = [];
            theGame.getWorkers().forEach(fleeingWorker => {
                const tile = theGame.getTile(fleeingWorker);

                if (tile.tileType !== tileTypes.magazine) {
                    const vector = theGame.vectorToMagazine(fleeingWorker);

                    args.push(`${fleeingWorker.id} ${vector.x} ${vector.y}`);
                }
            });

            if (!args.length) {
                service.nextTurn();

                return;
            }

            service.command({serverCommand: 'MOVE', args}, () => {
                service.nextTurn();
            });

            return;
        }

        const shouldTakeBags = worker => {
            const tile = theGame.getTile(worker);
            return !worker.bags && tile.tileType === tileTypes.magazine;
        };

        const shouldLeaveBags = worker => {
            const tile = theGame.getTile(worker);
            if (!tile) {
                return false;
            }
            return worker.bags && theGame.isStack(tile);
        };

        const scout = theGame.getScout();
        const workersWithoutScout = scout ? theGame.getWorkers().filter(worker => worker.id !== scout.id) : theGame.getWorkers();

        const workersThatShouldTakeStuff = workersWithoutScout.filter(worker => shouldTakeBags(worker));

        const workersThatShouldLeaveStuff = workersWithoutScout.filter(worker => shouldLeaveBags(worker));

        const workerMoves = [];
        workersThatShouldTakeStuff.forEach(worker => {
            const vector = theGame.vectorToStack(worker);
            vector.workerId = worker.id;

            workerMoves.push(vector);
        });

        workersThatShouldLeaveStuff.forEach(worker => {
            const vector = theGame.vectorToMagazine(worker);
            vector.workerId = worker.id;

            workerMoves.push(vector);
        });

        workersWithoutScout
            .filter(worker => !shouldLeaveBags(worker) && !shouldTakeBags(worker))
            .forEach(worker => {
                const vector = worker.bags
                    ? theGame.vectorToStack(worker)
                    : theGame.vectorToMagazine(worker);
                vector.workerId = worker.id;

                workerMoves.push(vector);
            });

        // look around with scout
        service.multilineResponseQuery(scout ? `LOOK_AROUND ${scout.id}` : '', 14, scoutResponse => {
            if (scoutResponse) {
                theGame.chartScoutData(scout, scoutResponse);
            }

            const vector = theGame.vectorToClosestObject(scout);
            const scoutDestinationReached = vector.x === 0 && vector.y === 0;
            // move toward the closest object
            service.command({
                serverCommand: 'MOVE',
                args: scoutDestinationReached ? [] : [`${scout.id} ${vector.x} ${vector.y}`]
            }, () => {
                // take
                service.multipleQueries(
                    workersThatShouldTakeStuff.map(workerThatShouldTakeStuff => {
                        return {
                            queryText: `TAKE ${workerThatShouldTakeStuff.id} 1`,
                            expectedNumberOfLines: 1
                        };
                    }),
                    () => {
                        // leave
                        service.command({
                            serverCommand: 'LEAVE',
                            args: workersThatShouldLeaveStuff.map(worker => `${worker.id} 1`)
                        }, () => {
                            // move
                            service.command({
                                serverCommand: 'MOVE',
                                args: workerMoves.map(workerMove => `${workerMove.workerId} ${workerMove.x} ${workerMove.y}`)
                            }, () => {
                                service.nextTurn();
                            });
                        });
                    }
                );
            });
        });

        // if (!scout) {
        //     service.nextTurn();

        //     return;
        // }

        // if (!scout.shouldMove) {
        //     service.multilineResponseQuery(`LOOK_AROUND ${scout.id}`, 14, (response) => {
        //         scout.shouldMove = true;

        //         theGame.chartScoutData(scout, response);

        //         logger.debug(response);

        //         service.nextTurn();
        //     });
        //     return;
        // }

        // if (scout.shouldMove) {
        //     service.command({serverCommand: 'MOVE', args: [`${scout.id}`]}, () => {
        //         scout.shouldMove = false;

        //         service.nextTurn();
        //     });

        //     return;
        // }
    });
    });
    });
    });
    });
};

const emitter = dl24client(config, gameLoop);
emitter.on('error', error => console.log('ERROR', error));
emitter.on('error', error => logger.error(error));
emitter.on('waiting', millisecondsTillNextTurn => logger.info('waiting', {millisecondsTillNextTurn}));
emitter.on('receivedFromServer', (data, command) => logger.info('receivedFromServer', {received: data, after: command}));
emitter.on('sentToServer', command => logger.info('sentToServer', command));
emitter.on('rawData', data => logger.info('raw data from server', {data: data}));
emitter.on('debug', data => logger.debug(data));
