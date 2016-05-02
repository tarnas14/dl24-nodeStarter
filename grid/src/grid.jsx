import React from 'react';

const Grid = React.createClass({
    propTypes: {
        data: React.PropTypes.object.isRequired,
        styles: React.PropTypes.object,
    },

    getInitialState () {
        return {
            styles: {
                side: 10,
                background: 'grey',
                ...this.props.styles
            }
        };
    },

    render () {
        const {data} = this.props;
        const side = `${this.state.styles.side}px`;
        const {styles} = this.state;

        return (
            <div className="container text-center">
                <h3>{data.name}</h3>
                <div className="grid" style={{display: 'inline-block'}}>
                    {data.gridDefinition.map((row, index) => (
                        <div
                            className="grid-row"
                            key={`row${index}`}
                            style={{height: side}}
                        >
                            {row.map((cell) => (
                                <div
                                    className="cell"
                                    data-point={`col${cell.x}x${cell.y}`}
                                    key={`col${cell.x}x${cell.y}`}
                                    style={{backgroundColor: cell.color || styles.background, display: 'inline-block', width: side, height: '100%'}}
                                ></div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }
});

export default Grid;
