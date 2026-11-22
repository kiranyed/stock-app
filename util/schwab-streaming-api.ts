import { StreamingApiClient } from "schwab-client-js";
import * as dotenv from "dotenv";
dotenv.config();

// Create your streaming client object
const streamclient = new StreamingApiClient();
async function doStuff() {
  // streamclient.checkAccessToken({ appKey: CLIENT_ID!,
  //    appSecret: APP_SECRET!, appRefresh: REFRESH_TOKEN!,
  //    access_token: ACCESS_TOKEN!, access_exp: 0 });
  streamclient.streamListen("open", () => {
    console.log("WebSocket connection opened.");
  });

  // Listen for messages from Schwab (your streaming data arrives here)
  streamclient.streamListen("message", (message) => {
    console.log("Received data message:", message);
  });

  // Listen for close
  streamclient.streamListen("close", (code, reason) => {
    console.log(`Connection closed: Code=${code}, Reason=${reason}`);
  });

  // Listen for errors
  streamclient.streamListen("error", (error) => {
    console.error("Received error message:", error);
  });

  // Initialize the stream
  await streamclient.streamInit();

  // Login to the Schwab stream
  await streamclient.streamSchwabLogin();

  // Subscribe to real-time quotes for specific symbols
  const params = { keys: "AMD,TSLA,GOOG", fields: "0,1,2,3,4,5" };
  await streamclient.streamSchwabRequest("ADD", "LEVELONE_EQUITIES", params);

  // ...streaming data will now arrive in your 'message' handler...

  // When done, log out and close the stream
  await streamclient.streamSchwabLogout();
  streamclient.streamClose();
}

doStuff();
// Listen for the "open" event
