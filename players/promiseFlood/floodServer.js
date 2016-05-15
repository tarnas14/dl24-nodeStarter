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

const minimumWallHeight = 5;

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

    const forEachCell = (object, callback) => {
        _.range(object.size.width).forEach(x => _.range(object.size.height).forEach(y => {
            callback({
                x: object.x + x,
                y: object.y + y,
                type: object.type,
            });
        }));
    };

    [...newState.objects, ...newState.magazines].forEach(object => forEachCell(object, gridder.updateCell));

    newState.plan.forEach(planElement => {
        gridder.updateCell({
            x: planElement.x,
            y: planElement.y,
            type: tileTypes.dam,
        });
    });

    newState.workers.forEach(worker => gridder.updateCell({x: worker.x, y: worker.y, type: worker.status}));

    console.log(newState.workers);
});

const theGame = theGameFactory(store);

const tileOnMap = (tile, dimensions) => tile.x >= 0 && tile.x < dimensions.width && tile.y >= 0 && tile.y < dimensions.height;

const getPath = (start, destination, state, possibleVectors, neighbourFilter) => {
    if (start.x === destination.x && start.y === destination.y) {
        return [];
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

    return dijkstra.shortestPath(vertices[vertexIndex(start)], vertices[vertexIndex(destination)]).map(a => a.to.data);
};

const getPathAroundObjects = (start, destination, state) => {
    const moveVectors = [{x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}, {x: 0, y: -1}];

    const isNeighbourNotAnObject = neighbour => {
        return tileOnMap(neighbour, state.dimensions) && notObject(state.map[neighbour.y][neighbour.x]);
    };

    return getPath(start, destination, state, moveVectors, isNeighbourNotAnObject);
};

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
                    plan: [...border.map(borderTile => store.getState().map[borderTile.y][borderTile.x]), ...pathToObject.map(pathTile => store.getState().map[pathTile.y][pathTile.x])],
                });
            });
        }
    })
    .then(() => {
        const isOnMagazine = ({x, y}) => store.getState().map[y][x].type === tileTypes.magazine;
        const onDropPoint = ({x, y}) => store.getState().plan.find(planTile => planTile.x === x && planTile.y === y && planTile.bags < minimumWallHeight);

        const shouldTakeBags = store.getState().workers.filter(worker => !worker.bags && isOnMagazine(worker));

        const onDropPointWithBags = store.getState().workers.filter(worker => worker.bags && onDropPoint(worker));

        const shouldGoForBags = [...onDropPointWithBags, ...store.getState().workers.filter(worker => !worker.bags && !isOnMagazine(worker) && !onDropPointWithBags.indexOf(worker))];

        const goingWithBagsToDropPoint = [...shouldTakeBags, ...store.getState().workers.filter(worker => worker.bags && !onDropPoint(worker) && !shouldTakeBags.indexOf(worker))];

        console.log('plan: ', store.getState().plan);
        console.log('workers: ', store.getState().workers);
        console.log('taking the bags: ', shouldTakeBags);
        console.log('dropping the bags: ', onDropPointWithBags);
        console.log('going for bags: ', shouldGoForBags);
        console.log('going to drop bags: ', goingWithBagsToDropPoint);

        const workerToMove = store.getState().workers[0];
        return service.write(`MOVE ${workerToMove.id} 0 1`).then(() => service.read(1)).then(() => gridder.updateCell(store.getState().map[workerToMove.y][workerToMove.x]));
    })
    .then(() => {
        service.nextTurn();
    })
    .catch(error => {
        console.log(`PROMISE CHAIN ERROR: ${error}`);
        service.nextTurn();
    });
};

const emitter = dl24client(config, gameLoop);
emitter.on('error', error => console.log(`error: ${JSON.stringify(error)}`));
emitter.on('waiting', millisecondsTillNextTurn => console.log(`WAITING ====${millisecondsTillNextTurn}====>`));
emitter.on('readFromServer', data => console.log(`READ ${data}`));
emitter.on('sentToServer', command => console.log(`SENT ${command}`));
emitter.on('rawData', data => console.log(`raw: ${data}`));
