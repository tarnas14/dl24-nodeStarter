'uset strict';
const request = require('request');

const post = (port, data) => {
    request.post({
        url: `http://localhost:${port}/log`,
        json: true,
        body: data
    }, (error) => {
        if (error) {
            console.log(`LOGGER ERROR: ${JSON.stringify(error)}`);
        }
    });
};

const loggerFactory = (namespace, port) => {
    const defaultPort = 3001;
    port = port || defaultPort;

    return {
        info (type, logEntry) {
            post(port, {
                timestamp: new Date(),
                namespace,
                type,
                data: logEntry
            });
        },
        error (errorEntry) {
            this.info('error', errorEntry);
        },
        debug (debugEntry) {
            post(port, Object.assign({}, {
                timestamp: new Date(),
                namespace,
                type: 'debug'
            }, debugEntry));
        }
    };
};

module.exports = loggerFactory;
