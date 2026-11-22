# stock-app
Stock trading application


node 19.7.0
npm 9.5.0
mysql 8.0.19

https://www.npmjs.com/package/liquibase
-to get liquibase working. in the node-liquibase command set --classpath='./db/<mysql connector jar file name>'
and make sure the mysql connector jar is in the root folder.  download from
https://downloads.mysql.com/archives/c-j/

then run "npm run liquibase-scorch-and-update"

running in dev mode: npm run start:dev
to run the UI

cd to src/public/react/stock-app-frontend
npm start


running chrome in debug mode (on aws instance):

google-chrome --remote-debugging-port=9222 --no-sandbox --disable-dev-shm-usage --disable-gpu &

on mac:
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-profile"




mysql connector jar needs to be in the db folder
download link:
https://repo1.maven.org/maven2/mysql/mysql-connector-java/8.0.19/mysql-connector-java-8.0.19.jar

PM2

npm install -g pm2

pm2 start util/pm2.json --only stock-app
pm2 start npm --name "frontend" -- start --prefix ./src/public/react/stock-app-frontend
