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

const LEVELS = {
    INFO: 'info'
};

const loggerFactory = (namespace) => {
    return {
        info (logEntry) {
            post({
                timestamp: new Date(),
                namespace: namespace,
                level: LEVELS.INFO,
                logEntry: logEntry
            });
        }
    };
};

module.exports = loggerFactory;
