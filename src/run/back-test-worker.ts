// Entry point of a back-test worker thread (started by BackTestPool). Runs one task at a time.

import { parentPort } from "worker_threads";
import { SchwabAuth } from "../providers/schwab/schwab-auth";
import { FromWorker, ToWorker, fromWire, runBackTestTask, toWire } from "./back-test-task";

if (!parentPort) throw new Error("back-test-worker must run as a worker thread");
const port = parentPort;
const send = (message: FromWorker) => port.postMessage(message);

// The main thread owns the Schwab sign-in, so there is one access token and one refresh.
let nextTokenRequest = 0;
const tokenRequests = new Map<number, { resolve: (token: string) => void; reject: (err: Error) => void }>();
const askForToken = (force: boolean) =>
  new Promise<string>((resolve, reject) => {
    const id = ++nextTokenRequest;
    tokenRequests.set(id, { resolve, reject });
    send({ type: "token", id, force });
  });
SchwabAuth.delegateTo({ get: () => askForToken(false), refresh: () => askForToken(true) });

port.on("message", (message: ToWorker) => {
  if (message.type === "token") {
    const request = tokenRequests.get(message.id);
    tokenRequests.delete(message.id);
    if (message.error) request?.reject(fromWire(message.error));
    else request?.resolve(message.token ?? "");
    return;
  }
  const started = Date.now();
  runBackTestTask(message.task).then(
    (results) => send({ type: "done", results, runtimeMs: Date.now() - started }),
    (err) => send({ type: "failed", error: toWire(err) }),
  );
});
