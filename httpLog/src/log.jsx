import React from 'react';

const Log = React.createClass({
    propTypes: {
        entries: React.PropTypes.array.isRequired
    },

    getInitialState () {
        return {
            selected: null,
            displayedEntries: this.props.entries.slice(0, 50),
            typesToHide: []
        };
    },

    componentWillReceiveProps (nextProps) {
        if (nextProps.entries !== this.props.entries) {
            if (this.state.selected) {
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
            selected: null
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
    }
});

export default Log;
