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

# Build React code
npm run build

# Rename the folder
mv build test-prod

# Move the contents to the build/ dir
mv test-prod ../../../../build/public/react/