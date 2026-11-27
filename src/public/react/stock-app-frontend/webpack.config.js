const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  devtool: 'source-map',
  entry: './src/index.tsx',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json'],
  },
  module: {
    rules: [
      {
        test: /\.s?css$/,
        use: [
          'style-loader',    // Injects CSS into the DOM
          'css-loader',      // Resolves CSS imports and URLs
          'sass-loader'      // Compiles SCSS to CSS
        ],
      },
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),  // Updated from contentBase to static
    },
    client: {
      logging: 'none',
    },
    hot: true,
    open: true,
    port: 3000,
    allowedHosts: 'all',
    proxy: [
      {
        context: ['/'],
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
  ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
    })
  ]
};
