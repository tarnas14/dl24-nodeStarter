'use strict';
const request = require('request');

const port = 3002;

let lastErrorCode = null;

const post = (resource, data, callback) => {
    request.post({
        url: `http://localhost:${port}/${resource}`,
        json: true,
        body: data
    }, (error, response) => {
        if (!error && response.statusCode === 200) {
            if (lastErrorCode) {
                console.log('GRID SERVER back up');
                lastErrorCode = null;
            }
            callback && callback();

            return;
        }

        if (error && lastErrorCode !== error.code) {
            lastErrorCode = error.code;
            console.log(`called GRID SERVER/${resource}`);

            switch (error.code) {
            case ('ECONNREFUSED'):
                console.log('GRID SERVER IS NOT READY');
                break;
            default:
                console.log(`GRIDDER ERROR: ${JSON.stringify(error)}`);
            }
        }
    });
};

const gridderFactory = (gridName) => {
    return {
        newGrid (gridDefinition, callback) {
            post('newGrid', {
                name: gridName,
                gridDefinition
            }, callback);
        },
        updateCell (cellDefinition) {
            post('updatecell', {
                gridName,
                cell: cellDefinition
            });
        }
    };
};

module.exports = gridderFactory;
