var path = require('path');
var webpack = require('webpack');

module.exports = {
    entry: {
        app: ['./src/logic/app.js'],
        vendor: ['socket.io-client']
    },

    output: {
        filename: './src/public/[name].js'
    },

    module: {
        loaders: [
            {
                loader: 'babel-loader',

                include: [
                    path.resolve(__dirname, 'src/logic')
                ],

                test: [/\.js$/]
            }
        ]
    },

    resolve: {
        extensions: ['', '.js']
    },

    plugins: [
        new webpack.optimize.CommonsChunkPlugin({
            name: 'vendor',
            filename: './src/public/vendor.js'
        })
    ],

    devtool: 'source-map'
};
