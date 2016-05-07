'use strict';

const tileTypes = require('./tileTypes');

const COLOURS = require('./colours');

const workerStatuses = require('./workerStatuses');

const range = (numberOfElements) => {
    return Array.apply(null, Array(numberOfElements)).map((_, i) => i);
};

const theGameFactory = (gridder, logger, stateUpdater, debugState) => {
    const getInitialState = () => {
        return {
            side: 0,
            wheelBarrowPrice: 0,
            goodPrognosis: 0,
            turnTime: 0,
            commandLimit: 0,
            workersCount: 0,
            stackCoordinates: null,
            scoutId: '',
            map: [],
            magazines: [],
            objects: [],
            workers: []
        };
    };

    let state = null;

    const getLandTile = (x, y) => {
        return {
            x: x,
            y: y,
            tileType: tileTypes.land
        };
    };

    const updateTile = tile => {
        tile.color = COLOURS[tile.tileType];
        state.map[tile.y][tile.x] = tile;

        if (!state.workers.find(worker => worker.x === tile.x && worker.y === tile.y)) {
            gridder.updateCell(tile);
        }
    };

    const updateStateLog = () => {
        stateUpdater.newState(Object.assign({}, state, {
            workersCount: state.workers.length,
            map: []
        }));
    };

    const markWorkerOnMap = worker => {
        gridder.updateCell(worker);
        state.workers.push(worker);
    };

    const removeWorkerFromMap = workerInState => {
        const workerIndex = state.workers.indexOf(workerInState);
        if (workerIndex === -1) {
            console.log('trying to remove worker not on the map', workerInState);
            return;
        }

        gridder.updateCell(state.map[workerInState.y][workerInState.x]);
        state.workers = [...state.workers.slice(0, workerIndex), ...state.workers.slice(workerIndex + 1)];
    };

    const getVector = (pointFrom, pointTo) => {
        const moveX = pointTo.x - pointFrom.x;
        const moveY = pointTo.y - pointFrom.y;

        return {x: moveX, y: moveY};
    };

    const normalize = vector => {
        return {
            x: vector.x < 0 ? -1 : (vector.x ? 1 : 0),
            y: vector.y < 0 ? -1 : (vector.y ? 1 : 0)
        };
    };

    const closestObject = (pointFrom, objects) => {
        let minDistance = 99999;
        let closest = null;

        objects.forEach(object => {
            const vector = getVector(pointFrom, object.coordinates);

            const distance = Math.abs(vector.x) + Math.abs(vector.y);
            if (distance < minDistance) {
                minDistance = distance;
                closest = object;
            }
        });

        return closest;
    };

    return {
        init (worldDescriptionResponse) {
            const [side, wheelBarrowPrice, goodPrognosis, turnTime, commandLimit] = worldDescriptionResponse.split(' ');

            state = Object.assign({}, getInitialState(), {
                side: parseInt(side, 10),
                wheelBarrowPrice: parseInt(wheelBarrowPrice, 10),
                goodPrognosis: parseInt(goodPrognosis, 10),
                turnTime: parseInt(turnTime, 10),
                commandLimit: parseInt(commandLimit, 10)
            });

            state.map = range(state.side).map(y => range(state.side).map(x => {
                return getLandTile(x, y);
            }));

            gridder.newGrid({
                map: state.map,
                styles: {
                    side: 8,
                    background: COLOURS[tileTypes.land]
                }
            });

            updateStateLog();
        },
        mapObjects (objectsResponse) {
            const objects = objectsResponse.map(objectResponse => {
                const [xCoordinate, yCoordinate, width, height, value, bags] = objectResponse.split(' ');

                return {
                    magazine: bags !== 'na',
                    coordinates: {
                        x: parseInt(xCoordinate, 10),
                        y: parseInt(yCoordinate, 10)
                    },
                    size: {
                        width: parseInt(width, 10),
                        height: parseInt(height, 10)
                    },
                    value: parseInt(value, 10),
                    bags: parseInt(bags, 10)
                };
            });

            state.magazines = objects.filter(object => object.magazine);
            state.objects = objects.filter(object => !object.magazine);

            objects.forEach(object => {
                for (let y = 0; y < object.size.height; y++) {
                    for (let x = 0; x < object.size.width; x++) {
                        const type = object.magazine ? tileTypes.magazine : tileTypes.myObject;

                        const tile = {
                            x: object.coordinates.x + x,
                            y: object.coordinates.y + y,
                            value: object.value,
                            bags: object.bags,
                            fullObject: object,
                            tileType: type
                        };

                        updateTile(tile);
                    }
                }
            });

            if (!state.stackCoordinates) {
                state.stackCoordinates = {x: state.magazines[0].coordinates.x, y: state.magazines[0].coordinates.y - 1};
            }

            updateStateLog();
        },
        mapWorkers (workersResponse) {
            const workers = workersResponse.map(workerResponse => {
                const [id, x, y, moving, capacity, status] = workerResponse.split(' ');

                const worker = {
                    id: parseInt(id, 10),
                    x: parseInt(x, 10),
                    y: parseInt(y, 10),
                    moving: moving === 'y',
                    capacity: parseInt(capacity, 10),
                    status: status === 'd' || status === 'p' ? workerStatuses[status] : workerStatuses.withBags,
                    bags: parseInt(status, 10),
                    color: COLOURS[tileTypes.worker]
                };

                return worker;
            });

            workers.forEach(worker => {
                const workerInState = state.workers.find(w => w.id === worker.id);

                if (!workerInState) {
                    markWorkerOnMap(worker);

                    return;
                }

                const workerMoved = worker.x !== workerInState.x || worker.y !== workerInState.y;

                if (workerMoved) {
                    removeWorkerFromMap(workerInState);
                    markWorkerOnMap(worker);
                }
            });

            const deadWorkers = state.workers.filter(workerInState => !workers.find(w => w.id === workerInState.id));
            deadWorkers.forEach(deadWorker => removeWorkerFromMap(deadWorker));

            updateStateLog();
        },
        getWorkers () {
            return [...state.workers];
        },
        getTile ({x, y}) {
            return state.map[y][x];
        },
        vectorToStack (pointFrom) {
            const vector = normalize(getVector(pointFrom, state.stackCoordinates));

            if (isObject(pointFrom.x + vector.x, pointFrom.y + vector.y)) {
                return {
                    x: vector.x < 1 ? vector.x + 1 : (vector.x > -1) ? vector.x - 1 : 0,
                    y: vector.y
                }
            }
        },
        vectorToMagazine (pointFrom) {
            return normalize(getVector(pointFrom, state.magazines[0].coordinates));
        },
        isStack ({x, y}) {
            return x === state.stackCoordinates.x && y === state.stackCoordinates.y;
        },
        getScout () {
            const newScout = () => {
                if (!state.workers.length) {
                    return null;
                }

                const withoutBags = state.workers.find(worker => worker.status === workerStatuses.withBags && worker.bags === 0);
                return withoutBags || state.workers[0];
            };

            if (!state.scoutId) {
                const scout = newScout();
                state.scoutId = scout ? scout.id : '';

                return scout;
            }

            const scout = state.workers.find(worker => worker.id === state.scoutId);
            state.scoutId = scout ? scout.id : '';

            return scout;
        },
        chartScoutData (scout, scoutResponse) {
            debugState.newState(scoutResponse);
            for (let y = 1; y < 8; ++y) {
                const yLine = scoutResponse[y - 1];
                for (let x = 1; x < 8; ++x) {
                    const tileType = yLine[x - 1];
                    const tile = {
                        x: scout.x + x - 4,
                        y: scout.y + y - 4
                    };

                    switch (tileType) {
                    case '.':
                        break;
                    case '#':
                        break;
                    case 'w':
                        tile.tileType = tileTypes.magazine;
                        updateTile(tile);
                        break;
                    case 'x':
                        tile.tileType = state.map[tile.y][tile.x].tileType === tileTypes.myObject
                            ? tileTypes.myObject
                            : tileTypes.object;
                        updateTile(tile);
                        break;
                    default:
                        tile.tileType = tileTypes.sandBags;
                        tile.sandBags = tileType;
                        updateTile(tile);
                        break;
                    }
                }
            }
        },
        floodStatus (response) {
            const [height, tillEnd] = response;

            state.floodStatus = {
                height: parseInt(height, 10),
                tillEnd: parseInt(tillEnd, 10)
            };

            updateStateLog();
        },
        isFlooding () {
            return state.floodStatus.height;
        },
        vectorToClosestObject (pointFrom) {
            return normalize(getVector(pointFrom, closestObject(pointFrom, state.objects).coordinates));
        }
    };
};

module.exports = theGameFactory;
