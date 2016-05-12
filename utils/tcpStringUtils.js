module.exports = () => {
    String.prototype.withTerminator = function withTerminator () {
        return `${this.toString()}\n`;
    };

    String.prototype.sanitized = function sanitized () {
        return this.toString().trim().replace('\r', '');
    };
};
