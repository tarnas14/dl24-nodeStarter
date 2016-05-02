import React from 'react';
import DOM from 'react-dom';
import io from 'socket.io-client';

import Grid from './grid';

const range = (numberOfElements) => {
    return Array.apply(null, Array(numberOfElements)).map((_, i) => i);
};

const App = React.createClass({
    getInitialState () {
        return {
            data: range(41).map(y => range(41).map(x => {
                const cellDefinition = {x: x, y: y};

                if (x === y || 40 - y === x) {
                    cellDefinition.color = 'blue';
                }

                return cellDefinition;
            }))
        };
    },

    componentDidMount () {
        const socket = io();
        socket.on('newGrid', (gridDefinition) => console.log('new grid!', gridDefinition));
    },

    render () {
        return <Grid data={this.state.data} />;
    }
});

window.onload = () => {
    DOM.render(<App />, document.getElementById('main-container'));
};
