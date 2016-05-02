'use strict';

import React from 'react';
import DOM from 'react-dom';
import io from 'socket.io-client';

import guid from './guid';

const App = React.createClass({
    getInitialState () {
        return {
            entries: [],
            displayedEntries: [],
            selected: null
        };
    },

    componentDidMount () {
        const socket = io();
        socket.on('newLogEntry', (newEntry) => {
            console.log(newEntry);
            this.setState(oldState => {
                if (!oldState.selected && oldState.displayedEntries.length >= 50) {
                    oldState.displayedEntries.shift();
                }

                const entryWithGuid = {
                    ...newEntry,
                    guid: guid()
                };

                return {
                    entries: [...oldState.entries, entryWithGuid],
                    displayedEntries: [...oldState.displayedEntries, entryWithGuid]
                };
            });
        });
    },

    getNamespaces () {
        const namespaces = this.state.entries.map(entry => entry.namespace);
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
                        {this.renderLog(namespace)}
                    </div>
                ))}
            </div>
        );
    },

    toggleSelected (logEntry) {
        if (!this.state.selected) {
            this.setState({
                selected: logEntry
            });

            return;
        }

        this.setState({
            selected: null
        });
    },

    renderLog () {
        return (
            <div className="panel-group">
                {this.state.displayedEntries.length}<br />
                <button onClick={this.loadPrevious}>previous</button>
                <button onClick={this.reset}>reset to real time</button>
                {this.state.displayedEntries.map(logEntry => (
                    <div className="panel panel-default">
                        <div className="panel-heading">
                            <h4 className="panel-title">
                                <a
                                    data-target={`#${logEntry.guid}`}
                                    data-toggle="collapse"
                                    href="#"
                                    onClick={this.toggleSelected.bind(null, logEntry)}
                                >
                                    {logEntry.timestamp} {logEntry.type}
                                </a>
                            </h4>
                        </div>
                        <div className="panel-collapse collapse" id={`${logEntry.guid}`}>
                            <div className="panel-body">
                                <pre>{JSON.stringify(logEntry, null, 4)}</pre>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    },

    loadPrevious () {
        this.setState(oldState => {
            const firstDisplayedIndex = oldState.entries.indexOf(oldState.displayedEntries[0]);
            const firstPreviousIndex = firstDisplayedIndex - 50 > 0 ? firstDisplayedIndex - 50 : 0;
            const previousCount = firstDisplayedIndex - 50 > 0 ? 50 : firstDisplayedIndex - 50;
            const previousEntries = oldState.entries.slice(firstPreviousIndex, previousCount);

            return {
                displayedEntries: [...previousEntries, oldState.displayedEntries]
            };
        });
    },

    reset () {
        this.setState(oldState => {
            console.log(oldState.entries.slice(-50));
            return {
                displayedEntries: oldState.entries.slice(-50),
                selected: null
            };
        });
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
