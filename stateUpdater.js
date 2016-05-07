'use strict';
const request = require('request');

const port = 3003;

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
            console.log(`called STATE SERVER/${resource}`);

            switch (error.code) {
            case ('ECONNREFUSED'):
                console.log('STATE SERVER IS NOT READY');
                break;
            default:
                console.log(`STATE UPDATER ERROR: ${JSON.stringify(error)}`);
            }
        }
    });
};

const stateUpdaterFactory = (namespace) => {
    return {
        newState (state, callback) {
            post('newState', {
                namespace: namespace,
                ...state
            }, callback);
        }
    };
};

module.exports = stateUpdaterFactory;
