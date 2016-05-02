import React from 'react';

const ObservingCell = React.createClass({
    propTypes: {
        cellDefinition: React.PropTypes.object.isRequired,
        gridChangeStream: React.PropTypes.object.isRequired,
        styles: React.PropTypes.object.isRequired,
    },

    getInitialState () {
        return {
            cell: this.props.cellDefinition
        };
    },

    componentDidMount () {
        this.props.gridChangeStream.subscribe(cell => {
            if (cell.x !== this.state.cell.x || cell.y !== this.state.cell.y) {
                return;
            }
            this.setState({
                cell
            });
        });
    },

    render () {
        const {styles} = this.props;
        const {cell} = this.state;
        const side = `${styles.side}px`;

        return (
            <div
                className="cell"
                data-point={`col${cell.x}x${cell.y}`}
                style={{backgroundColor: cell.color || styles.background, display: 'inline-block', width: side, height: '100%'}}
            ></div>
        );
    }
});

export default ObservingCell;
