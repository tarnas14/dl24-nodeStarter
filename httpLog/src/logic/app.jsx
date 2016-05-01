'use strict';

import React from 'react';
import DOM from 'react-dom';
import io from 'socket.io-client';

const App = React.createClass({
    componentDidMount () {
        const socket = io();
        socket.on('connect', () => {
            socket.emit('fromClient', 'hello');
        });
        socket.on('newLogEntry', (data) => {
            console.log(data);
        });
    },

    render () {
        return <div>Hello world</div>;
    }
});

window.onload = () => {
    DOM.render(<App />, document.getElementById('main-container'));
};
