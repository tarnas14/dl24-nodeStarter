const io = require('socket.io-client');

console.log('asdf');

const socket = io();
socket.on('connect', () => {
    socket.emit('fromClient', 'hello');
});
socket.on('fromServer', (data) => {
    console.log('fromServer', data);
});
