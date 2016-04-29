'use strict';

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const socketIo = require('socket.io');

const PORT = 3001;
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

const io = socketIo.listen(server);

app.post('/log', (req, res) => {
    const logEntry = req.body;
    console.log('post', logEntry);

    io.emit('newLogEntry', logEntry);

    res.sendStatus(200);
});
