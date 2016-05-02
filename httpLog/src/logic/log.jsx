import React from 'react';

const Log = React.createClass({
    propTypes: {
        entries: React.PropTypes.array.isRequired
    },

    getInitialState () {
        return {
            selected: null,
            displayedEntries: this.props.entries.slice(0, 50)
        };
    },

    componentWillReceiveProps (nextProps) {
        if (nextProps.entries !== this.state.entries) {
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


    render () {
        let entriesToDisplay = [...this.state.displayedEntries];
        entriesToDisplay.reverse();
        return (
            <div className="panel-group">
                {this.state.displayedEntries.length}<br />
                <button onClick={this.loadPrevious}>previous</button>
                <button onClick={this.reset}>reset to real time</button>
                {entriesToDisplay.map(logEntry => (
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
    }
});

export default Log;
