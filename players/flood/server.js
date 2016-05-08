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
    service.multiWrite(['DESCRIBE_WORLD', 'FLOOD_STATUS', 'FORECAST', 'LIST_OBJECTS', 'LIST_WORKERS'], () => {
    service.fancyRead(1, ([worldResponse]) => {
    service.fancyRead(1, ([floodStatus]) => {
    service.fancyMultipleRead(forecastLines => {
    service.fancyMultipleRead(objectsLines => {
    service.fancyMultipleRead(workersLines => {
        theGame.init(worldResponse);

        theGame.mapObjects(objectsLines);
        theGame.mapWorkers(workersLines);
        theGame.floodStatus(floodStatus);
        theGame.setForecast(forecastLines);

        if (!theGame.getWorkers().length) {
            console.log('no workers, no problem');
            service.simpleNextTurn();

            return;
        }

        if (theGame.isFlooding()) {
            const writes = [];
            theGame.getWorkers().forEach(fleeingWorker => {
                const tile = theGame.getTile(fleeingWorker);

                if (tile.tileType !== tileTypes.magazine) {
                    const vector = theGame.vectorToMagazine(fleeingWorker);

                    writes.push(`MOVE ${fleeingWorker.id} ${vector.x} ${vector.y}`);
                }
            });

            if (!writes.length) {
                service.simpleNextTurn();

                return;
            }

            service.multiWrite(writes, () => {
                service.simpleNextTurn();
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

        const workersThatShouldTakeStuff = theGame.getWorkers().filter(worker => shouldTakeBags(worker));

        const workersThatShouldLeaveStuff = theGame.getWorkers().filter(worker => shouldLeaveBags(worker));

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

        theGame.getWorkers()
            .filter(worker => !shouldLeaveBags(worker) && !shouldTakeBags(worker))
            .forEach(worker => {
                const vector = worker.bags
                    ? theGame.vectorToStack(worker)
                    : theGame.vectorToMagazine(worker);
                vector.workerId = worker.id;

                workerMoves.push(vector);
            });

        logger.debug({
            workersThatShouldLeaveStuff,
            workersThatShouldTakeStuff,
            workerMoves
        });

        let writes = [];
        const scouts = [];
        theGame.getWorkers().forEach(worker => {
            if (!scouts.find(scout => scout.x === worker.x && scout.y === worker.y)) {
                scouts.push(worker);
            }
        });

        writes = [...writes, ...scouts.map(worker => `LOOK_AROUND ${worker.id}`)];
        writes = [...writes, ...workersThatShouldTakeStuff.map(worker => `TAKE ${worker.id} 1`)];
        writes = [...writes, ...workersThatShouldLeaveStuff.map(worker => `LEAVE ${worker.id} 1`)];
        writes = [...writes, ...workerMoves.map(workerMove => `MOVE ${workerMove.workerId} ${workerMove.x} ${workerMove.y}`)];

        service.multiWrite(writes, () => {
            service.read(scouts.length * 15 + workersThatShouldTakeStuff.length * 2 + workersThatShouldLeaveStuff.length + workerMoves.length, (multiRead) => {
                for (let i = 0; i < scouts.length; ++i) {
                    const scout = scouts[i];
                    const scoutReport = [];
                    for (let j = 1; j < 15; ++j) {
                        scoutReport.push(multiRead[i * 15 + j]);
                    }

                    logger.debug({scoutReport, scout});
                    theGame.chartScoutData(scout, scoutReport);
                }
                service.simpleNextTurn();
            });
        });
    });
    });
    });
    });
    });
    });
};

const emitter = dl24client(config, gameLoop, debugState);
emitter.on('error', error => console.log('ERROR', error));
emitter.on('error', error => logger.error(error));
emitter.on('waiting', millisecondsTillNextTurn => {
    logger.info('waiting', {millisecondsTillNextTurn});
    console.log('waiting till next turn', millisecondsTillNextTurn);
});
emitter.on('receivedFromServer', (data, command) => logger.info('receivedFromServer', {received: data, after: command}));
emitter.on('receivedFromServer', (data, command) => console.log(`<== ${data}`));
emitter.on('sentToServer', command => logger.info('sentToServer', command));
//emitter.on('sentToServer', command => console.log(`==> ${command}`));
emitter.on('rawData', data => logger.info('raw data from server', {data: data}));
emitter.on('debug', data => logger.debug(data));
