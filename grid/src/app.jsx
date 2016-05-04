import React from 'react';
import DOM from 'react-dom';
import io from 'socket.io-client';
import Rx from 'rxjs/Rx';

import Grid from './grid';
import eventTypes from './eventTypes';

const App = React.createClass({
    getInitialState () {
        return {
            grids: []
        };
    },

    componentDidMount () {
        const socket = io();

        socket.on('newGrid', (gridDefinition) => {
            this.setGrid(gridDefinition);
        });

        socket.on('updateCell', (data) => {
            const grid = this.state.grids.find(existingGrid => existingGrid.name === data.gridName);
            if (!grid) {
                console.error(`tried to update cell on grid ${data.gridName}, which does not exist`);

                return;
            }

            grid.gridChangeStream.next({type: eventTypes.update, cell: data.cell});
        });
    },

    setGrid (gridDefinition) {
        const mapSize = gridDefinition.gridDefinition.map.length;
        console.log(`new grid '${gridDefinition.name}' ${mapSize}x${mapSize}`);

        const start = (new Date()).getTime();

        const gridToUpdate = this.state.grids.find(grid => grid.name === gridDefinition.name);

        if (gridToUpdate) {
            const gridToUpdateIndex = this.state.grids.indexOf(gridToUpdate);

            this.setState({
                grids: [...this.state.grids.slice(0, gridToUpdateIndex), {...gridToUpdate, ...gridDefinition}, ...this.state.grids.slice(gridToUpdateIndex + 1)]
            }, () => gridToUpdate.gridChangeStream.next({type: eventTypes.clear}));

            return;
        }

        this.setState({
            grids: [...this.state.grids, {...gridDefinition, gridChangeStream: new Rx.Subject()}]
        }, () => console.log(`phew, that took ${(new Date()).getTime() - start}ms`));
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
