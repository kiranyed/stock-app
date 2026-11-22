#!/usr/bin/env bash

### Build BackEnd ###

# Remove existing production folder
rm -rf ./build/

# Transpile .ts to .js
tsc --sourceMap false

### Bundle FrontEnd ###

# Create the directory for React
mkdir -p ./build/public/react/

# Navigate to the react directory
cd ./src/public/react/stock-app-frontend

# Build React code (webpack writes to dist/)
npm run build

# Copy the bundle to where AppServer serves it from
cp -R dist ../../../../build/public/react/test-prod
