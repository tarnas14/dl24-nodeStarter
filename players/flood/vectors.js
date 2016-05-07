module.exports = {
    getVector: (pointFrom, pointTo) => {
        const moveX = pointTo.x - pointFrom.x;
        const moveY = pointTo.y - pointFrom.y;

        return {x: moveX, y: moveY};
    },
    normalize: vector => {
        return {
            x: vector.x < 0 ? -1 : (vector.x ? 1 : 0),
            y: vector.y < 0 ? -1 : (vector.y ? 1 : 0)
        };
    }
};
