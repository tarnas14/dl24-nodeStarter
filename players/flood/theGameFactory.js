'use strict';

const tileTypes = require('./tileTypes');
const {getVector, normalize} = require('./vectors');

const COLOURS = require('./colours');

const workerStatuses = require('./workerStatuses');

const range = (numberOfElements) => {
    return Array.apply(null, Array(numberOfElements)).map((_, i) => i);
};

const average = elements => {
    let sum = 0;
    elements.forEach(el => {
        sum += el;
    });

    return Math.floor(sum / elements.length + 1);
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
            stack: null,
            stackBorderCoordinates: null,
            scoutId: '',
            floodStatus: {},
            forecast: null,
            workers: [],
            magazines: [],
            objects: [],
            map: [],
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

    const isObject = (x, y) => {
        const type = (state.map[y][x] && state.map[y][x].tileType) || tileTypes.magazine;
        const objectTypes = [tileTypes.myObject, tileTypes.object, tileTypes.magazine, tileTypes.dudeWithSandBags];

        const result = objectTypes.indexOf(type);
        //console.log('is object?!', type, result);

        return result !== -1;
    };

    const getVectorAroundObjects = (pointFrom, pointTo) => {
        const vectors = [
            {x: 0, y: 1},
            {x: 0, y: -1},
            {x: 1, y: 0},
            {x: 1, y: 1},
            {x: 1, y: -1},
            {x: -1, y: 0},
            {x: -1, y: 1},
            {x: -1, y: -1}
        ];

        const withDistances = vectors.map(v => {
            const nextPointFrom = {x: pointFrom.x + v.x, y: pointFrom.y + v.y};

            if (isObject(nextPointFrom.x, nextPointFrom.y)) {
                return {distance: 9999999};
            }

            const possibleVector = getVector(nextPointFrom, pointTo);
            const possibleDistance = Math.abs(possibleVector.x) + Math.abs(possibleVector.y);

            return {
                normalized: v,
                distance: possibleDistance
            };
        });

        let distance = 9999;
        let normalized = null;
        withDistances.forEach(v => {
            if (v.distance < distance) {
                distance = v.distance;
                normalized = v.normalized;
            }
        });

        return normalized;
    };

    const getObjectCoordinates = object => {
        const origin = object.coordinates;

        const maxY = object.size.height;
        const maxX = object.size.width;

        const coordinates = [];

        for (let y = 0; y < maxY; y++) {
            for (let x = 0; x < maxX; x++) {
                coordinates.push({
                    x: origin.x + x,
                    y: origin.y + y
                });
            }
        }

        return coordinates;
    };

    const max = numbers => {
        let maxNr = -99999;

        numbers.forEach(number => {
            if (number > maxNr) {
                maxNr = number;
            }
        });

        return maxNr;
    };

    const getMinFenceHeight = () => {
        return Math.floor((state.forecast && max(state.forecast.map(f => f.hMax) || [21]))) + 1;
    };

    const tileWithNotEnoughBags = stackBorder => {
        const sandBags = (state.map[stackBorder.y][stackBorder.x] && state.map[stackBorder.y][stackBorder.x].bags) || 0;

        const fenceHeight = getMinFenceHeight();
        // console.log('fence height', fenceHeight);

        return sandBags < fenceHeight;
    };

    const getBorders = object => {
        const borders = [];
        const maxY = object.size.height + 2;
        const maxX = object.size.width + 2;
        for (let y = 0; y < maxY; y++) {
            for (let x = 0; x < maxX; x++) {
                const edge =
                    ((y === 0) && (x === 0)) ||
                    ((y === 0) && (x === (maxX - 1))) ||
                    ((y === (maxY - 1)) && (x === 0)) ||
                    ((y === (maxY - 1)) && (x === (maxX - 1)));

                if (!edge && !isObject(object.coordinates.x - 1 + x, object.coordinates.y - 1 + y)) {
                    borders.push({
                        x: object.coordinates.x - 1 + x,
                        y: object.coordinates.y - 1 + y
                    });
                }
            }
        }

        return borders;
    };

    const notSurrounded = object => {
        const borders = getBorders(object);

        return borders.find(border => tileWithNotEnoughBags(border));
    };

    const setNewStackBorderCoordinates = () => {
        const stack = closestObject(state.magazines[0].coordinates, state.objects.filter(object => notSurrounded(object)));
        const stackBorderCoordinates = getBorders(stack);

        state.stack = stack;
        state.stackBorderCoordinates = stackBorderCoordinates;
    };

    const findClosestTileTo = (pointFrom, predicate, backupCallback) => {
        const vectors = [{y: -1, x: 0}, {x: 1, y: 0}, {y: 1, x: 0}, {x: -1, y: 0}];

        let point = pointFrom;

        let jumpCount = 1;
        let jumpsInJumpCount = 0;
        let vectorId = 0;
        for (let checks = 0; checks < 100; checks++) {
            if (checks % 2 === 0 && checks !== 0) {
                jumpCount += 1;
                jumpsInJumpCount = 0;
            }

            // jump
            const vector = vectors[vectorId];
            point = {x: point.x + vector.x, y: point.y + vector.y};

            if (predicate(point)) {
                console.log('found closest', point);
                return state.map[point.y][point.x];
            }

            jumpsInJumpCount += 1;
            if (jumpsInJumpCount % jumpCount === 0) {
                vectorId = vectorId + 1 < vectors.length ? vectorId + 1 : 0;
            }
        }

        return backupCallback();
    };

    let lastWorldDescriptor = '';
    return {
        init (worldDescriptorResponse) {
            const [side, wheelBarrowPrice, goodPrognosis, turnTime, commandLimit] = worldDescriptorResponse.split(' ');

            const worldDescriptor = `${side} ${wheelBarrowPrice} ${goodPrognosis} ${turnTime} ${commandLimit}`;

            if (worldDescriptor === lastWorldDescriptor) {
                return;
            }

            lastWorldDescriptor = worldDescriptor;

            state = Object.assign({}, getInitialState(), {
                side: parseInt(side, 10),
                wheelBarrowPrice: parseInt(wheelBarrowPrice, 10),
                goodPrognosis: parseInt(goodPrognosis, 10),
                turnTime: parseInt(turnTime, 10),
                commandLimit: parseInt(commandLimit, 10)
            });

            console.log('initing', side, state.side);

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
        getWheelBarrowPrice () {
            return state.wheelBarrowPrice;
        },
        mapObjects (objectsResponse) {
            const objects = objectsResponse.map(objectResponse => {
                const [xCoordinate, yCoordinate, width, height, value, bags] = objectResponse.split(' ');

                return {
                    magazine: bags.toLowerCase() !== 'na',
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
                const coordinates = getObjectCoordinates(object);
                coordinates.forEach(objectCoordinate => {
                    const type = object.magazine ? tileTypes.magazine : tileTypes.myObject;

                    updateTile({
                        x: objectCoordinate.x,
                        y: objectCoordinate.y,
                        value: object.value,
                        bags: object.bags,
                        fullObject: object,
                        tileType: type
                    });
                });
            });

            if (!state.stackBorderCoordinates) {
                setNewStackBorderCoordinates();
            }

            updateStateLog();
        },
        tileHasMoreThanEnoughBags (tileInQuestion) {
            const tile = this.getTile(tileInQuestion);

            if (tile.tileType === tileTypes.magazine) {
                return tile.bags || 0;
            }

            return ((tile && tile.bags) || 0) > getMinFenceHeight();
        },
        mapWorkers (workersResponse) {
            const workers = workersResponse.map(workerResponse => {
                const [id, x, y, moving, capacity, status] = workerResponse.split(' ');

                const worker = {
                    id: parseInt(id, 10),
                    x: parseInt(x, 10),
                    y: parseInt(y, 10),
                    moving: moving.toLowerCase() === 'y',
                    capacity: parseInt(capacity, 10),
                    status: status.toLowerCase() === 'd' || status.toLowerCase() === 'p' ? workerStatuses[status] : workerStatuses.withBags,
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
            const getNext = () => state.stackBorderCoordinates.find(stackBorder => tileWithNotEnoughBags(stackBorder));

            let nextBorderWithoutSandbags = getNext();

            console.log("REALLY?!", state.stackBorderCoordinates.map(border => this.getTile(border)));
            logger.debug({data: 'really no next?', borderTiles: state.stackBorderCoordinates.map(border => this.getTile(border)), fence: getMinFenceHeight()});

            if (!nextBorderWithoutSandbags) {
                console.log('whole border filled?', state.stackBorderCoordinates);
                setNewStackBorderCoordinates();

                nextBorderWithoutSandbags = getNext();
            }

            const closestBorderWithoutEnoughSandbags = findClosestTileTo(
                pointFrom,
                (tile) => state.stackBorderCoordinates.find(border => border.x === tile.x && border.y === tile.y && tileWithNotEnoughBags(tile)),
                () => nextBorderWithoutSandbags);

            console.log('GOING TO ==> ', closestBorderWithoutEnoughSandbags.x, closestBorderWithoutEnoughSandbags.y);

            return getVectorAroundObjects(pointFrom, closestBorderWithoutEnoughSandbags);
        },
        vectorToMagazine (pointFrom) {
            const magazineCoordinates = state.magazines[0].coordinates;
            const closestTileWithBagsToTake = findClosestTileTo(pointFrom, (tile) => {
                const fenceTile = this.getTile(tile);
                return ((fenceTile && fenceTile.bags) || 0) > getMinFenceHeight();
            }, () => magazineCoordinates);

            return normalize(getVector(pointFrom, closestTileWithBagsToTake));
        },
        isStack ({x, y}) {
            const result = state.stackBorderCoordinates.find(borderCoordinates =>
                borderCoordinates.x === x &&
                borderCoordinates.y === y &&
                tileWithNotEnoughBags(borderCoordinates));
            //console.log(x, y, state.stackBorderCoordinates);

            return result;
        },
        chartScoutData (scout, scoutResponse) {
            const sandBagsToInt = (sandbagString, tile) => {
                const showResult = result => {
                    //console.log(`${sandbagString} => ${result}`);
                };

                if (sandbagString.toLowerCase() === 'z') {
                    const more = (state.map[tile.y][tile.x].bags || 30) + 1;

                    showResult(more);

                    return more;
                }

                const parsed = parseInt(sandbagString, 10);
                if (!isNaN(parsed)) {
                    showResult(parsed);

                    return parsed;
                }

                const sigh = {'a': 10, 'b': 11, 'c': 12, 'd': 13, 'e': 14, 'f': 15, 'g': 16, 'h': 17, 'i': 18, 'j': 19, 'k': 20, 'l': 21, 'm': 22, 'n': 23, 'o': 24, 'p': 25, 'q': 26, 'r': 27, 's': 28, 't': 29, 'u': 30};

                showResult(sigh[sandbagString]);

                return sigh[sandbagString];
            };

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
                    case 'W':
                        tile.tileType = tileTypes.magazine;
                        updateTile(tile);
                        break;
                    case 'X':
                        tile.tileType = state.map[tile.y][tile.x].tileType === tileTypes.myObject
                            ? tileTypes.myObject
                            : tileTypes.object;
                        updateTile(tile);
                        break;
                    default:
                        tile.tileType = tileTypes.sandBags;
                        tile.bags = sandBagsToInt(tileType.toLowerCase(), tile);
                        updateTile(tile);
                        break;
                    }
                }
            }

            // for (let y = 8; y < 15; ++y) {
            //     const yLine = scoutResponse[y - 1];
            //     for (let x = 1; x < 8; ++x) {
            //         const tileType = yLine[x - 1];
            //         const tile = {
            //             x: scout.x + x - 4,
            //             y: scout.y + y - 7 - 4
            //         };

            //         switch (tileType) {
            //         case '.':
            //             break;
            //         case '#':
            //             break;
            //         case 'b':
            //             break;
            //         case 'B':
            //             tile.tileType = tileTypes.dudeWithSandBags;
            //             updateTile(tile);
            //             break;
            //         default:
            //             tile.tileType = tileTypes.sandBags;
            //             tile.sandBags = sandBagsToInt(tileType.toLowerCase(), tile);
            //             updateTile(tile);
            //             break;
            //         }
            //     }
            // }
        },
        floodStatus (response) {
            const [height, tillEnd] = response;

            state.floodStatus = {
                height: parseInt(height, 10),
                tillEnd: parseInt(tillEnd, 10)
            };

            updateStateLog();
        },
        setForecast (response) {
            state.forecast = response.map(singleForecast => {
                const [age, pMin, pMax, hMin, hMax] = singleForecast.split(' ');

                return {
                    age: parseInt(age, 10),
                    pMin: parseInt(pMin, 10),
                    pMax: parseInt(pMax, 10),
                    hMin: parseInt(hMin, 10),
                    hMax: parseInt(hMax, 10)
                };
            });

            updateStateLog();
        },
        isFlooding () {
            const sureAsFuckFlood = state.forecast.find(forecast => forecast.pMin === forecast.pMax);

            return sureAsFuckFlood && (sureAsFuckFlood.pMin - sureAsFuckFlood.age <= 10);
        },
        vectorToClosestObject (pointFrom) {
            const startingPoint = pointFrom || state.magazines[0].coordinates;
            return normalize(getVector(startingPoint, closestObject(startingPoint, state.objects).coordinates));
        }
    };
};

module.exports = theGameFactory;
