const _ = require('lodash');

const tileTypes = require('./tileTypes');

const workerStatuses = {
    d: 'd',
    p: 'p',
    withBags: 'b',
};

const initialState = {
    dimensions: {
        width: 0,
        height: 0,
    },
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
    plan: [],
};

const getTile = (x, y, type) => {
    return {
        x,
        y,
        type,
        bags: 0,
    };
};

const getObjectTiles = object => {
    const tiles = [];

    _.range(object.size.width).forEach(x => _.range(object.size.height).forEach(y => {
        tiles.push({
            x: object.x + x,
            y: object.y + y,
            type: object.type,
        });
    }));

    return tiles;
};

const theGameFactory = (store) => {
    return {
        setWorld (worldResponse) {
            const [side, wheelBarrowPrice, goodPrognosis, turnTime, commandLimit] = worldResponse.split(' ');

            const worldDescriptor = `${side} ${wheelBarrowPrice} ${goodPrognosis} ${turnTime} ${commandLimit}`;

            if (worldDescriptor === store.getState().worldDescriptor) {
                return;
            }

            const sideInt = parseInt(side, 10);
            store.setState(() => {
                return Object.assign({}, initialState, {
                    worldDescriptor: worldDescriptor,
                    dimensions: {
                        width: sideInt,
                        height: sideInt,
                    },
                    wheelBarrowPrice: parseInt(wheelBarrowPrice, 10),
                    goodPrognosis: parseInt(goodPrognosis, 10),
                    turnTime: parseInt(turnTime, 10),
                    commandLimit: parseInt(commandLimit, 10),
                    map: _.range(sideInt).map(y => _.range(sideInt).map(x => getTile(x, y, tileTypes.land))),
                });
            });
        },
        setFloodStatus (floodStatusResponse) {
            const [height, tillEnd] = floodStatusResponse;

            store.setState(oldState => {
                return Object.assign({}, oldState, {
                    floodStatus: {
                        height: parseInt(height, 10),
                        tillEnd: parseInt(tillEnd, 10),
                    },
                });
            });
        },
        setForecast (response) {
            store.setState(oldState => {
                return Object.assign({}, oldState,
                    {
                        forecast: response.map(singleForecast => {
                            const [age, pMin, pMax, hMin, hMax] = singleForecast.split(' ');

                            return {
                                age: parseInt(age, 10),
                                pMin: parseInt(pMin, 10),
                                pMax: parseInt(pMax, 10),
                                hMin: parseInt(hMin, 10),
                                hMax: parseInt(hMax, 10),
                            };
                        }),
                    });
            });
        },
        chartObjects (objectsResponse) {
            const objects = objectsResponse.map(objectResponse => {
                const [xCoordinate, yCoordinate, width, height, value, bags] = objectResponse.split(' ');

                return {
                    type: bags.toLowerCase() !== 'na' ? tileTypes.magazine : tileTypes.myObject,
                    x: parseInt(xCoordinate, 10),
                    y: parseInt(yCoordinate, 10),
                    size: {
                        width: parseInt(width, 10),
                        height: parseInt(height, 10),
                    },
                    value: parseInt(value, 10),
                    bags: parseInt(bags, 10),
                };
            });

            store.setState(oldState => {
                const newState = Object.assign({}, oldState);

                newState.magazines = objects.filter(object => object.type === tileTypes.magazine);
                newState.objects = objects.filter(object => object.type !== tileTypes.magazine);

                newState.magazines.concat(newState.objects).forEach(object => {
                    const tiles = getObjectTiles(object);

                    tiles.forEach(tile => {
                        newState.map[tile.y][tile.x].type = tile.type;
                    });
                });

                return newState;
            });
        },
        chartWorkers (workersResponse) {
            const workers = workersResponse.map(workerResponse => {
                const [id, x, y, moving, capacity, status] = workerResponse.split(' ');

                return {
                    id: parseInt(id, 10),
                    x: parseInt(x, 10),
                    y: parseInt(y, 10),
                    moving: moving.toLowerCase() === 'y',
                    capacity: parseInt(capacity, 10),
                    status: status.toLowerCase() === 'd' || status.toLowerCase() === 'p' ? workerStatuses[status] : workerStatuses.withBags,
                    bags: parseInt(status, 10),
                };
            });

            store.setState(oldState => {
                const newWorkers = _.differenceBy(workers, oldState.workers, 'id');
                const oldWorkers = _.intersectionBy(workers, oldState.workers, 'id').map(newOldWorker => {
                    const oldStateWorker = _.find(oldState.workers, {id: newOldWorker.id});

                    return Object.assign({}, oldStateWorker, newOldWorker);
                });

                return Object.assign({}, oldState, {
                    workers: [...newWorkers, ...oldWorkers],
                });
            });
        },
    };
};

module.exports = theGameFactory;
