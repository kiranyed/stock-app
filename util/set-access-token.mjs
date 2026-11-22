import { By, Builder, until } from 'selenium-webdriver';
import assert from 'assert';
import axios from 'axios';
import chrome from 'selenium-webdriver/chrome.js';
import dotenv from 'dotenv';
import http from 'http';

dotenv.config();


const { SCHWAB_USER, SCHWAB_PASSWORD, CLIENT_ID, REDIRECT_URI, APP_KEY, REFRESH_TOKEN, ACCESS_TOKEN } = process.env;

const userName = SCHWAB_USER;
const password = SCHWAB_PASSWORD;

const clientId = CLIENT_ID
const redirectUri = REDIRECT_URI
const appKey = APP_KEY

let accessToken = ACCESS_TOKEN
let refreshToken = REFRESH_TOKEN;
let refreshTime = 0;

let interval = null;

const PORT = 2000;

const ONE_WEEK_IN_MILLISECONDS = 604800000;
const THIRTY_MINUTES_IN_MILLISECONDS = 1800000;
//https://gist.github.com/bobdobbalina/64450fb391dab3863e047295cb155410
//https://learn-automation.com/how-to-execute-selenium-scripts-on-already-opened-browser/

// below command didn't work v
// open -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-profile"

// this one checks if chrome debug mode is on port 9222
// lsof -i :9222

// this one actually starts it in debugging mode
// /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-profile"


async function firstTest() {
  let driver;
    console.log('running firstTest');
  try {
    const options = new chrome.Options();
    options.debuggerAddress('localhost:9222'); // Use the correct method

    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    console.log("Connected to existing Chrome instance");


    await driver.get(`https://api.schwabapi.com/v1/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}`);
    await driver.manage().setTimeouts({implicit: 1000});

    await driver.wait(async () => {
      let title = await driver.getTitle();
      return title.trim().length > 0; // Ensure title is loaded
    }, 10000); // 10 seconds max wait
    let title = await driver.getTitle();
    assert.equal(title, "Charles Schwab Log In Help");

    let idTextBox = await driver.wait(until.elementLocated(By.id('loginIdInput')), 10000);
    await driver.wait(until.elementIsVisible(idTextBox), 5000);
    await driver.wait(until.elementIsEnabled(idTextBox), 5000);
    await idTextBox.clear(); // Clear any pre-existing text
    await driver.sleep(1000); // Wait 2 seconds for the form to process
    console.log('sending keys to idTextBox');
    console.log(userName);
    await idTextBox.sendKeys(userName);
    
    await idTextBox.clear(); // Clear any pre-existing text
    await driver.sleep(500); // Wait 2 seconds for the form to process
    await idTextBox.sendKeys(userName);

    let passwordTextBox = await driver.wait(until.elementLocated(By.id('passwordInput')), 10000);
    await driver.wait(until.elementIsVisible(passwordTextBox), 5000);
    await driver.wait(until.elementIsEnabled(passwordTextBox), 5000);
    await passwordTextBox.clear(); // Clear any pre-existing text
    await passwordTextBox.sendKeys(password);
    await driver.sleep(1000); // Wait 2 seconds for the form to process

    await passwordTextBox.clear(); // Clear any pre-existing text
    await driver.sleep(1000); // Wait 2 seconds for the form to process

    await passwordTextBox.sendKeys(password);


    console.log('clicking submit button on first page');
    
    let submitButton = await driver.wait(
      until.elementLocated(By.id('btnLogin')), 
      10000
    );
    await driver.wait(until.elementIsVisible(submitButton), 5000);
    await driver.wait(until.elementIsEnabled(submitButton), 5000);
    await driver.sleep(2000); // Wait 2 seconds for the form to process

    await submitButton.click();
    await driver.manage().setTimeouts({implicit: 4000});

let checkbox = await driver.wait(until.elementLocated(By.id('acceptTerms')), 10000);
await driver.wait(until.elementIsVisible(checkbox), 5000);
console.log('accepting terms and clicking submit button on second page');
await checkbox.click();
     let submitButton2 = await driver.findElement(By.id('submit-btn'));
     await submitButton2.click();
    await driver.manage().setTimeouts({implicit: 1500});
    console.log('clicking agree button on third page');
    let agreeModalButton = await driver.findElement(By.id('agree-modal-btn-'));
    await agreeModalButton.click();
    await driver.manage().setTimeouts({implicit: 1500});

    await driver.wait(until.urlContains('https://sws-gateway.schwab.com/ui/host/#/third-party-auth/account'), 10000);

    await driver.wait(until.titleContains("Consent and Grant | Charles Schwab"), 10000); // or use any other wait co
    let newTitle = await driver.getTitle();
    assert.equal(newTitle, "Consent and Grant | Charles Schwab");
    // Now re-locate the submit button and click
let submitButton3 = await driver.wait(until.elementLocated(By.id('submit-btn')), 10000);
await submitButton3.click();

//     let submitButton3 = await driver.wait(until.elementLocated(By.id('submit-btn')), 10000);
// await driver.executeScript("arguments[0].click();", submitButton3);
    await driver.manage().setTimeouts({implicit: 1500});
    console.log('clicking submit button on fourth page');
    await driver.wait(until.urlContains('https://sws-gateway.schwab.com/ui/host/#/third-party-auth/confirmation'), 10000);

     const submitButton4 = await driver.findElement(By.id('cancel-btn'));
     await submitButton4.click();
    await driver.manage().setTimeouts({implicit: 15000});

    await driver.wait(until.urlContains('127.0.0.1'), 10000);

    let currentUrl = await driver.getCurrentUrl();
    console.log(`currentUrl: ${currentUrl}`);
    const startIndex = currentUrl.indexOf('code=') + 5;
    const endIndex = currentUrl.indexOf('&session');
    const rawCode = currentUrl.substring(startIndex, endIndex);
    console.log(`rawCode: ${rawCode}`);
    const code = decodeURIComponent(rawCode);
    console.log(`decodedCode: ${code}`);

    const config = {
      headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${appKey}`
      }
  };

    axios.post('https://api.schwabapi.com/v1/oauth/token', {
      code: code,
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri
    }, config)
    .then((response) => {
      console.log(`new access token: ${response?.data?.access_token} at UTC time: ${new Date().toUTCString()}`)
      console.log(`new refresh token: ${response?.data?.refresh_token} at UTC time: ${new Date().toUTCString()}`)

      accessToken = response.data.access_token;
      refreshToken = response.data.refresh_token;
      if (!interval) {
        createAccessTokenInterval();
      }
    }).catch(e => {
      console.log(`error getting new refresh token: ${e}`);
    }
    );

  } catch (e) {
    console.log(`error running selenium test: ` + e)
  } finally {
    await driver.quit();
  }
}

/* the selenium script is not working right now.  Schwab seems to know how to detect it */
// setInterval(() => {
//     firstTest();
// }, ONE_WEEK_IN_MILLISECONDS);

const createAccessToken = () => {
  const currentDateTime = Date.now();
  axios.post('https://api.schwabapi.com/v1/oauth/token', {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    redirect_uri: redirectUri
  }, {
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${appKey}`
    }}).then((response) => {
    console.log(`new access token: ${response?.data?.access_token} at UTC time: ${new Date().toUTCString()}`);
    accessToken = response.data.access_token;
    // expires_in is in seconds, convert to milliseconds and add to current time to get refresh time
    refreshTime = currentDateTime + response.data.expires_in * 1000;
    console.log('reset the access token: ' + accessToken);
    }).catch(e => {
      console.log(`error getting new access token: ${e.message}`);
      console.log(`error getting new access token: ${e.response?.data}`);
      console.log(e);
    }
  );
}

const createAccessTokenInterval = () => {
  createAccessToken();
  console.log(`creating access token interval, runs ever ${THIRTY_MINUTES_IN_MILLISECONDS / (1000 * 60)} minutes`);
  interval = setInterval(createAccessToken, THIRTY_MINUTES_IN_MILLISECONDS);
}


const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/get-token') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ refreshTime, token: accessToken }));
  } else if (req.method === 'GET' && req.url === '/hello') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'sample response' }));
  } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

createAccessTokenInterval();
