'use strict';
const namespace = process.argv[2] || 'flood';
const dl24client = require('../../dl24client');
const config = require('./config');
config.port = process.argv[3] || config.port;
const theGameFactory = require('./theGameFactory');
const gridder = require('../../gridder')(namespace, process.argv[4] || config.gridderPort);
const tileTypes = require('./tileTypes');
const _ = require('lodash');
const jkstra = require('jkstra');

const vectors = {
    distance (start, end) {
        console.log('s, e', start, end);
        return Math.abs(end.y - start.y) + Math.abs(end.x - start.x);
    },
    getVector (start, end) {
        return {x: end.x - start.x, y: end.y - start.y};
    },
    normalize (vector) {
        return {
            x: vector.x < 0 ? -1 : (vector.x === 0 ? 0 : 1),
            y: vector.y < 0 ? -1 : (vector.y === 0 ? 0 : 1),
        };
    },
};

const storeFactory = (initialState) => {
    let state = initialState;
    let callback = () => {};

    return {
        getState () {
            return state;
        },
        setState (stateModifier) {
            state = stateModifier(state);
            callback(state);
        },
        onEachStateChange (handler) {
            callback = handler;
        },
    };
};

const findClosest = (start, possibleEndpoints) => {
    const withDistances = possibleEndpoints.map(destination => Object.assign({}, destination, {
        distance: vectors.distance(start, destination),
    }));

    return _.minBy(withDistances, 'distance');
};

const getBorder = object => {
    const tiles = [];
    const leftX = object.x - 1;
    const rightX = object.x + object.size.width;
    const topY = object.y - 1;
    const bottomY = object.y + object.size.height;

    _.range(leftX, rightX + 1).forEach(x => {
        tiles.push({x, y: topY});
        tiles.push({x, y: bottomY});
    });

    _.range(topY, bottomY).forEach(y => {
        tiles.push({x: leftX, y});
        tiles.push({x: rightX, y});
    });

    return tiles;
};

const notObject = tile => tile.type !== tileTypes.magazine && tile.type !== tileTypes.myObject && tile.type !== tileTypes.object;

const store = storeFactory({});

// yup, duplication, we are trying to make things work FAST now
let descriptor = '';
store.onEachStateChange(newState => {
    if (newState.descriptor !== descriptor) {
        descriptor = newState.descriptor;
        gridder.newGrid({
            map: newState.map,
        });
    }
});

const theGame = theGameFactory(store);

const tileOnMap = (tile, dimensions) => tile.x >= 0 && tile.x < dimensions.width && tile.y >= 0 && tile.y < dimensions.height;

const getPath = (start, destination, state, possibleVectors, neighbourFilter) => {
    console.log(start, destination, possibleVectors);
    if (start.x === destination.x && start.y === destination.y) {
        return [start];
    }

    const graph = new jkstra.Graph();

    const vertices = [];
    const vertexIndex = tile => tile.x * state.dimensions.width + tile.y;

    for (let x = 0; x < state.dimensions.width; x++) {
        for (let y = 0; y < state.dimensions.height; y++) {
            vertices.push(graph.addVertex(state.map[y][x]));
        }
    }

    for (let x = 0; x < state.dimensions.width; x++) {
        for (let y = 0; y < state.dimensions.height; y++) {
            const neighbours = possibleVectors.filter(v => neighbourFilter({x: x + v.x, y: y + v.y})).map(v => state.map[y + v.y][x + v.x]);

            const index = x * state.dimensions.width + y;

            neighbours.forEach(neighbour => {
                graph.addEdge(vertices[index], vertices[vertexIndex(neighbour)], 1);
            });
        }
    }

    const dijkstra = new jkstra.algos.Dijkstra(graph);

    const path = dijkstra.shortestPath(vertices[vertexIndex(start)], vertices[vertexIndex(destination)]).map(a => a.to.data);

    const pathSteps = [start, ...path].reduce((steps, step, currentIndex, array) => {
        if (currentIndex === 0) {
            return steps;
        }

        return [...steps, vectors.normalize(vectors.getVector(array[currentIndex - 1], step))];
    }, []);

    return pathSteps;
};

const getPathAroundObjects = (start, destination, state) => {
    const moveVectors = [{x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}, {x: 0, y: -1}];

    const isNeighbourOnMap = neighbour => {
        return tileOnMap(neighbour, state.dimensions) && notObject(state.map[neighbour.y][neighbour.x]);
    };

    return getPath(start, destination, state, moveVectors, isNeighbourOnMap);
};

const getDirectPath = (start, destination, state) => {
    const moveVectors = [{x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}, {x: 0, y: -1}, {x: 1, y: 1}, {x: -1, y: -1}, {x: -1, y: 1}, {x: 1, y: -1}];

    const isNeighbourOnMap = neighbour => tileOnMap(neighbour, state.dimensions);

    return getPath(start, destination, state, moveVectors, isNeighbourOnMap);
};

const differentTile = (a, b) => a.x !== b.x || a.y !== b.y;

const gameLoop = (service) => {
    service.multiWrite(['DESCRIBE_WORLD', 'FLOOD_STATUS', 'FORECAST', 'LIST_OBJECTS', 'LIST_WORKERS'])
    .then(() => service.fancyRead(1))
    .then(([worldResponse]) => theGame.setWorld(worldResponse))
    .then(() => service.fancyRead(1))
    .then(([floodStatus]) => theGame.setFloodStatus(floodStatus))
    .then(() => service.fancyMultipleRead())
    .then(forecastLines => theGame.setForecast(forecastLines))
    .then(() => service.fancyMultipleRead())
    .then(objectsLines => theGame.chartObjects(objectsLines))
    .then(() => service.fancyMultipleRead())
    .then(workersLines => theGame.chartWorkers(workersLines))
    .then(() => {
        if (!store.getState().plan.length) {
            const magazine = store.getState().magazines[0];

            const targetObject = findClosest(magazine, store.getState().objects);
            const border = getBorder(targetObject);

            const targetBorder = findClosest(magazine, border);

            const pathToObject = getPathAroundObjects(magazine, targetBorder, store.getState());

            store.setState(oldState => {
                return Object.assign({}, oldState, {
                    plan: [...border, ...pathToObject],
                });
            });
        }
    })
    .then(() => {
        return store.getState().workers.reduce((promise, worker) => {
            return promise.then(() => {

                const elementsInPlanBelowThreshold = store.getState().plan.filter(element => store.getState().map[element.y][element.x].bags < 13);

                if (worker.bags && _.find(elementsInPlanBelowThreshold, {x: worker.x, y: worker.y})) {
                    service.write(`LEAVE ${worker.id} 1`)
                        .then(() => service.read(2))
                        .then((data) => {
                            if (data[0] === 'OK') {
                                this.getState().map[worker.y][worker.x].bags += parseInt(data[1], 10);
                                worker.bags -= 1;
                            }
                        });
                }

                return Promise.resolve();

                // if (!worker.bags && store.getState().map[worker.y][worker.x].type === tileTypes.magazine) {
                //     const closestBagPlace = findClosest(worker, store.getState().plan);

                //     let nextStepWithBags = {x: 0, y: 0};
                //     if (closestBagPlace.distance !== 1) {
                //         nextStepWithBags = vectors.normalize(vectors.getVector(worker, getPathAroundObjects(worker, closestBagPlace, store.getState())[0]));
                //     } else {
                //         nextStepWithBags = vectors.normalize(vectors.getVector(worker, closestBagPlace));
                //     }

                //     console.log('take', worker, nextStepWithBags);
                //     return service.write(`TAKE ${worker.id} 1`).then(() => service.read(2)).then(service.write(`MOVE ${worker.id} ${nextStepWithBags.x} ${nextStepWithBags.y}`)).then(() => service.read(1));
                // }

                // const magazine = store.getState().magazines[0];

                // if (!worker.bags) {
                //     let nextStepTowardsMagazine = {x: 0, y: 0};
                //     if (nextStepTowardsMagazine.distance !== 1) {
                //         nextStepTowardsMagazine = vectors.normalize(vectors.getVector(worker, getPathAroundObjects(worker, magazine, store.getState())[0]));
                //     } else {
                //         nextStepTowardsMagazine = vectors.normalize(vectors.getVector(worker, magazine));
                //     }

                //     console.log('move to magazine', worker, nextStepTowardsMagazine);
                //     return service.write(`MOVE ${worker.id} ${nextStepTowardsMagazine.x} ${nextStepTowardsMagazine.y}`).then(() => service.read(1));
                // }

                // const elementInPlanBelowThreshold = store.getState().plan.filter(element => store.getState().map[element.y][element.x].bags < 13);

                // if (_.find(elementInPlanBelowThreshold, worker)) {
                //     let nextStepTowardsMagazine = {x: 0, y: 0};
                //     if (nextStepTowardsMagazine.distance !== 1) {
                //         nextStepTowardsMagazine = vectors.normalize(vectors.getVector(worker, getPathAroundObjects(worker, magazine, store.getState())[0]));
                //     } else {
                //         nextStepTowardsMagazine = vectors.normalize(vectors.getVector(worker, magazine));
                //     }

                //     console.log('leave and go towards magazine', worker, nextStepTowardsMagazine);

                //     return service.write(`LEAVE ${worker.id} 1`)
                //         .then(() => service.read(2))
                //         .then((data) => {
                //             if (data[0] === 'OK') {
                //                 this.getState().map[worker.y][worker.x].bags += parseInt(data[1], 10);
                //             }
                //         })
                //         .then(service.write(`MOVE ${worker.id} ${nextStepTowardsMagazine.x} ${nextStepTowardsMagazine.y}`))
                //         .then(() => service.read(1));
                // }

                // const closestBagPlace = findClosest(worker, store.getState().plan);

                // let nextStepWithBags = {x: 0, y: 0};
                // if (closestBagPlace.distance !== 1) {
                //     nextStepWithBags = vectors.normalize(vectors.getVector(worker, getPathAroundObjects(worker, closestBagPlace, store.getState())[0]));
                // } else {
                //     nextStepWithBags = vectors.normalize(vectors.getVector(worker, closestBagPlace));
                // }

                // console.log('move to bags', worker, nextStepWithBags);

                // return service.write(`MOVE ${worker.id} ${nextStepWithBags.x} ${nextStepWithBags.y}`).then(() => service.read(1));
            }).then(() => {
                if (!worker.destination || differentTile(worker, worker.destination)) {
                    const destination = worker.bags ? findClosest(worker, store.getState().plan) : store.getState().magazines[0];

                    const step = getPathAroundObjects(worker, findClosest(worker, destination), store.getSate())[0];

                    return service.write(`MOVE ${worker.id} ${step.x} ${step.y}`).then(() => service.read(1));
                }

                return Promise.resolve();
            });
        }, Promise.resolve());
    })
    .then(() => {
        [...store.getState().objects, ...store.getState().magazines].forEach(object => {
            for (let x = 0; x < object.size.width; x++) {
                for (let y = 0; y < object.size.height; y++) {
                    gridder.updateCell({
                        x: object.x + x,
                        y: object.y + y,
                        type: object.type,
                    });
                }
            }
        });

        store.getState().plan.forEach(planElement => {
            gridder.updateCell({
                x: planElement.x,
                y: planElement.y,
                type: tileTypes.dam,
            });
        });

        store.getState().workers.forEach(worker => {
            gridder.updateCell({
                x: worker.x,
                y: worker.y,
                type: worker.status,
            });
        });
    })
    .then(() => service.nextTurn())
    .catch(error => {
        console.log(`PROMISE CHAIN ERROR: ${JSON.stringify(error)}`);
        service.nextTurn();
    });
};

const emitter = dl24client(config, gameLoop);
emitter.on('error', error => console.log(`error: ${JSON.stringify(error)}`));
emitter.on('waiting', millisecondsTillNextTurn => console.log(`WAITING ====${millisecondsTillNextTurn}====>`));
emitter.on('readFromServer', data => console.log(`READ ${data}`));
emitter.on('sentToServer', command => console.log(`SENT ${command}`));
emitter.on('rawData', data => console.log(`raw: ${data}`));
