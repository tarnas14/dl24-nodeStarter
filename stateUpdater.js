'use strict';
const request = require('request');

let lastErrorCode = null;

const post = (port, resource, data, callback) => {
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

const stateUpdaterFactory = (namespace, port) => {
    const defaultPort = 3003;
    port = port || defaultPort;

    return {
        newState (state, callback) {
            state.namespace = namespace;
            post(port, 'newState', state, callback);
        }
    };
};

module.exports = stateUpdaterFactory;
