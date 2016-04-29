'use strict';

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const socketIo = require('socket.io');

const PORT = process.env.PORT || 3001;
const PUBLIC_PATH = path.resolve(__dirname, 'public');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

app.use('/public', express.static(PUBLIC_PATH));

app.get('/log', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'public', 'log.html'));
});

const server = app.listen(PORT, () => {
    console.log('listening on port ', PORT);
});

const lameSocket = {
    connect (serv) {
        const io = socketIo.listen(serv);

        io.on('connect', (socket) => {
            console.log('lol connection!');

            socket.on('fromClient', (data) => {
                console.log(data);
            });
        });

        return io;
    }
};

const o = lameSocket.connect(server);
let i = 0;
setInterval(() => {
    o.emit('fromServer', i++);
}, 500);
