const range = (numberOfElements) => {
    return Array.apply(null, Array(numberOfElements)).map((_, i) => i);
};

module.exports = range;
