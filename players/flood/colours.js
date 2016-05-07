const tileTypes = require('./tileTypes');

module.exports = {
    [tileTypes.land]: 'grey',
    [tileTypes.object]: 'brown',
    [tileTypes.magazine]: 'green',
    [tileTypes.worker]: 'blue',
    [tileTypes.sandBags]: 'yellow'
};
