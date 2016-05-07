'use strict';

import React from 'react';
import DOM from 'react-dom';
import io from 'socket.io-client';

const App = React.createClass({
    getInitialState () {
        return {
            states: []
        };
    },

    componentDidMount () {
        const socket = io();
        socket.on('newState', (newState) => {
            this.setState(oldState => {
                const stateAlreadyInState = oldState.states.find(state => state.namespace === newState.namespace);
                const stateIndex = oldState.states.indexOf(stateAlreadyInState);

                if (stateIndex === -1) {
                    return {
                        states: [...oldState.states, newState]
                    };
                }

                return {
                    states: [...oldState.states.slice(0, stateIndex), newState, ...oldState.states.slice(stateIndex + 1)]
                };
            });
        });
    },

    renderStates () {
        return this.state.states.map(state => (
            <div key={state.namespace}>
                <h2>{state.namespace}</h2>
                <pre>{JSON.stringify(state, null, 4)}</pre>
            </div>
        ));
    },

    render () {
        return (
            <div>
                {this.renderStates()}
            </div>
        );
    }
});

window.onload = () => {
    DOM.render(<App />, document.getElementById('main-container'));
};
