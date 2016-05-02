import React from 'react';
import DOM from 'react-dom';
import io from 'socket.io-client';

import Grid from './grid';

const App = React.createClass({
    getInitialState () {
        return {
            grids: []
        };
    },

    componentDidMount () {
        const socket = io();
        socket.on('grid', (gridDefinition) => {
            console.log('grid update', gridDefinition);

            this.setState(oldState => {
                const gridToUpdate = oldState.grids.find(grid => grid.name === gridDefinition.name);
                if (gridToUpdate) {
                    const gridToUpdateIndex = oldState.grids.indexOf(gridToUpdate);

                    return {
                        grids: [...oldState.grids.slice(0, gridToUpdateIndex), gridDefinition, ...oldState.grids.slice(gridToUpdateIndex + 1)]
                    };
                }

                return {
                    grids: [...oldState.grids, gridDefinition]
                };
            });
        });
    },

    render () {
        return (<div>
            {this.state.grids.map(grid => <Grid data={grid} key={grid.name} />)}
        </div>);
    }
});

window.onload = () => {
    DOM.render(<App />, document.getElementById('main-container'));
};
