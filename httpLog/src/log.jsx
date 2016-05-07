import React from 'react';

const Log = React.createClass({
    propTypes: {
        entries: React.PropTypes.array.isRequired
    },

    getInitialState () {
        return {
            selected: [],
            displayedEntries: this.props.entries.slice(0, 50),
            typesToHide: [],
            stopped: false
        };
    },

    componentWillReceiveProps (nextProps) {
        if (this.state.stopped) {
            return;
        }

        if (nextProps.entries !== this.props.entries) {
            if (this.state.selected.length) {
                const lastDisplayedIndex = nextProps.entries.indexOf(this.state.displayedEntries[0]);

                this.setState({
                    displayedEntries: nextProps.entries.slice(0, this.state.displayedEntries.length + lastDisplayedIndex)
                });

                return;
            }

            this.setState({
                displayedEntries: nextProps.entries.slice(0, this.state.displayedEntries.length > 50 ? this.state.displayedEntries.length : 50)
            });
        }
    },

    toggleEntry (entryGuid) {
        if (this.state.selected.indexOf(entryGuid) === -1) {
            this.setState(oldState => {
                return {
                    selected: [...oldState.selected, entryGuid]
                };
            });

            return;
        }

        this.setState(oldState => {
            const entryIndex = oldState.selected.indexOf(entryGuid);
            return {
                selected: [...oldState.selected.slice(0, entryIndex), ...oldState.selected.slice(entryIndex + 1)] || []
            };
        });
    },

    loadPrevious () {
        this.setState(oldState => {
            const lastDisplayedIndex = this.props.entries.indexOf(oldState.displayedEntries[oldState.displayedEntries.length - 1]);

            return {
                displayedEntries: this.props.entries.slice(0, lastDisplayedIndex + 51)
            };
        });
    },

    reset () {
        this.setState({
            displayedEntries: this.props.entries.slice(0, 50),
            selected: []
        }, () => {
            const selectedElement = document.querySelector('.collapse.in');
            if (selectedElement) {
                const elementClass = selectedElement.className;
                selectedElement.className = elementClass.replace(' in', '');
            }
        });
    },

    getTypes () {
        const types = this.props.entries.map(entry => entry.type).sort();

        return types.filter((value, index, array) => {
            return array.indexOf(value) === index;
        });
    },

    renderFilters () {
        return (
            <div>
                {
                    this.getTypes().map(type => (
                        <div className="checkbox" key={type}>
                            <label>
                                <input
                                    defaultChecked
                                    onChange={this.setFilter.bind(null, type)}
                                    type="checkbox"
                                />
                                {type}
                            </label>
                        </div>
                    ))
                }
            </div>
        );
    },

    typeIsVisible (type) {
        return this.state.typesToHide.indexOf(type) === -1;
    },

    setFilter (type) {
        if (this.typeIsVisible(type)) {
            this.hideType(type);

            return;
        }

        this.showType(type);
    },

    hideType (type) {
        this.setState(oldState => {
            return {
                typesToHide: [...oldState.typesToHide, type]
            };
        });
    },

    showType (type) {
        this.setState(oldState => {
            const typeIndex = oldState.typesToHide.indexOf(type);

            return {
                typesToHide: [...oldState.typesToHide.slice(0, typeIndex), ...oldState.typesToHide.slice(typeIndex + 1)]
            };
        });
    },

    toggleStop () {
        this.setState(oldState => {
            return {
                stopped: !oldState.stopped,
                displayedEntries: oldState.stopped ? [] : oldState.displayedEntries
            };
        });
    },

    render () {
        let entriesToDisplay = this.state.displayedEntries.filter(entry => this.typeIsVisible(entry.type));
        entriesToDisplay.reverse();
        return (
            <div className="panel-group">
                <div className="clearfix">
                    <div className="pull-left">
                        {this.state.displayedEntries.length}<br />
                        <button onClick={this.loadPrevious}>previous</button>
                        <button onClick={this.reset}>reset to real time</button>
                        <button onClick={this.toggleStop}>{this.state.stopped ? 'resume' : 'STAHP'}</button>
                    </div>
                    <div className="pull-right">
                        {this.renderFilters()}
                    </div>
                </div>
                {entriesToDisplay.map(logEntry => (
                    <div className="panel panel-default">
                        <div className="panel-heading" style={{backgroundColor: logEntry.type === 'error' ? '#f2dede' : '#f5f5f5'}}>
                            <h4 className="panel-title">
                                <a
                                    data-target={`#${logEntry.guid}`}
                                    data-toggle="collapse"
                                    href="#"
                                    onClick={this.toggleEntry.bind(null, logEntry.guid)}
                                >
                                    {logEntry.timestamp} {logEntry.type} {logEntry.data.toString()}
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
    }
});

export default Log;
