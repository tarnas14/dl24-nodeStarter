'uset strict';
const request = require('request');

const port = 3001;

const post = (data) => {
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

const loggerFactory = (namespace) => {
    return {
        info (type, logEntry) {
            post({
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
            this.info('debug', debugEntry);
        }
    };
};

module.exports = loggerFactory;
