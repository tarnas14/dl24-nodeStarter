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

app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
    console.log('listening on port ', PORT);
});

const lameSocket = {
    connect (serv) {
        const io = socketIo.listen(serv);

        io.on('connect', (socket) => {
            console.log('lol connection!');

            io.emit('fromServer', 'aha!');

            socket.on('fromClient', (data) => {
                console.log(data);
            });
        });
    }
};

lameSocket.connect(server);
