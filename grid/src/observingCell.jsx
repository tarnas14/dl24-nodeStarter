import React from 'react';

import eventTypes from './eventTypes';

const ObservingCell = React.createClass({
    propTypes: {
        cellDefinition: React.PropTypes.object.isRequired,
        cellStyles: React.PropTypes.object.isRequired,
        gridChangeStream: React.PropTypes.object.isRequired
    },

    getInitialState () {
        const cell = this.props.cellDefinition;

        return {
            cell,
            cellId: `cell${cell.x}x${cell.y}`
        };
    },

    componentWillMount () {
        const subscription = this.props.gridChangeStream.subscribe(event => {
            switch (event.type) {
            case (eventTypes.update):
                this.update(event.cell);
                break;
            case (eventTypes.clear):
                this.clear();
                break;
            }
        });

        this.setState({subscription});
    },

    componentWillUnmount () {
        this.state.subscription.unsubscribe();
    },

    update (cell) {
        if (cell.x !== this.state.cell.x || cell.y !== this.state.cell.y) {
            return;
        }
        this.setState({
            cell
        });
    },

    clear () {
        this.setState({
            cell: {
                ...this.state.cell,
                color: this.props.cellStyles.background
            }
        });
    },

    showCell () {
        console.log(this.state.cell);
    },

    render () {
        const {cellStyles} = this.props;
        const {cell} = this.state;
        const side = `${cellStyles.side}px`;

        return (
            <div
                data-point={this.state.cellId}
                onClick={this.showCell}
                style={{
                    backgroundColor: cell.color || cellStyles.background,
                    display: 'inline-block',
                    width: side,
                    height: '100%',
                    borderRight: '1px solid #eaeaea',
                    borderBottom: '1px solid #eaeaea'
                }}
            ></div>
        );
    }
});

export default ObservingCell;
