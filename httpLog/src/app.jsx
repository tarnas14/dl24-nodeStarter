'use strict';

import React from 'react';
import DOM from 'react-dom';
import io from 'socket.io-client';

import Log from './log';
import guid from './guid';

const App = React.createClass({
    getInitialState () {
        return {
            entries: []
        };
    },

    componentDidMount () {
        const socket = io();
        socket.on('newLogEntry', (newEntry) => {
            this.setState(oldState => {
                const entryWithGuid = {
                    ...newEntry,
                    guid: guid()
                };

                return {
                    entries: [entryWithGuid, ...oldState.entries.slice(0, 300)]
                };
            });
        });
    },

    getNamespaces () {
        const namespaces = this.state.entries.map(entry => entry.namespace).sort();
        return namespaces.filter((value, index, array) => {
            return array.indexOf(value) === index;
        });
    },

    renderTabs (namespaces) {
        return (
            <ul className="nav nav-tabs" role="tablist">
                {namespaces.map((namespace, index) => (
                    <li
                        className={index === 0 ? 'active' : ''}
                        key={namespace}
                        role="presentation"
                    >
                        <a
                            data-toggle="tab"
                            href={`#${namespace}`}
                            role="tab"
                        >
                            {namespace}
                        </a>
                    </li>
                ))}
            </ul>
        );
    },

    renderTabPanes (namespaces) {
        return (
            <div className="tab-content">
                {name}
                {namespaces.map((namespace, index) => (
                    <div
                        className={index === 0 ? 'tab-pane active' : 'tab-pane'}
                        id={namespace}
                        key={namespace}
                        role="tabpanel"
                    >
                        <Log entries={this.state.entries.filter(entry => entry.namespace === namespace)} />
                    </div>
                ))}
            </div>
        );
    },

    render () {
        const namespaces = this.getNamespaces();

        return (
            <div style={{height: '1000px', overflow: 'scroll'}}>
                {this.renderTabs(namespaces)}
                {this.renderTabPanes(namespaces)}
            </div>
        );
    }
});

window.onload = () => {
    DOM.render(<App />, document.getElementById('main-container'));
};
