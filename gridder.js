'uset strict';
const request = require('request');

const port = 3002;

const post = (resource, data) => {
    request.post({
        url: `http://localhost:${port}/${resource}`,
        json: true,
        body: data
    }, (error) => {
        if (error) {
            console.log(`GRIDDER ERROR: ${JSON.stringify(error)}`);
        }
    });
};

const gridderFactory = (gridName) => {
    return {
        grid (gridDefinition) {
            post('grid', {
                name: gridName,
                gridDefinition
            });
        }
    };
};

module.exports = gridderFactory;
