import React from 'react';

import ObservingCell from './observingCell';

const Grid = React.createClass({
    propTypes: {
        data: React.PropTypes.object.isRequired,
    },

    getInitialState () {
        return {
            styles: {
                side: 10,
                background: 'grey',
                ...this.props.data.styles
            }
        };
    },

    render () {
        const {data} = this.props;
        const {styles} = this.state;
        const side = `${styles.side}px`;

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
                                <ObservingCell cellDefinition={cell} gridChangeStream={data.gridChangeStream} key={`col${cell.x}x${cell.y}`} styles={styles} />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }
});

export default Grid;
