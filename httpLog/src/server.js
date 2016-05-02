'use strict';

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const socketIo = require('socket.io');

const PORT = process.argv[2] || 3001;
const PUBLIC_PATH = path.resolve(__dirname, 'public');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

app.use('/public', express.static(PUBLIC_PATH));

app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
    console.log('listening on port ', PORT);
});

const io = socketIo.listen(server);

app.post('/log', (req, res) => {
    const logEntry = req.body;

    io.emit('newLogEntry', logEntry);

    res.sendStatus(200);
});
