import path from "path";
import express, { Express } from "express";
import cors from "cors";

import appRouter from "../routers/app-router"; // Central router for all other routers
import userRouter from "../routers/user-router";
import { localTokenHandler } from "../routers/schwab-router";
import { errorCatcher, errorMiddleware } from "../middleware/error-middleware";

class AppServer {
  private readonly SERVER_START_MSG = "Server started on port: ";
  public app: Express;

  constructor() {
    this.app = express();
    this.configureMiddleware();
    this.setupRoutes();

    if (process.env.NODE_ENV !== "production") {
      this.app.get(/.*/, (_, res) => {
        res.status(404).send("Page or resource not found");
      });
    } else {
      this.serveFrontEndProd();
    }
  }

  private configureMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes(): void {
    this.app.use("/api", appRouter); // Attach all routers under '/api'
    this.app.use("/user", userRouter);
    this.app.get("/schwab-token", localTokenHandler); // other local tools; loopback only
    this.app.use(errorCatcher, errorMiddleware); // e.g. malformed JSON bodies, which fail before any router
  }

  private serveFrontEndProd(): void {
    const dir = path.join(__dirname, "../public/react/test-prod/");
    this.app.set("views", dir);
    this.app.use(express.static(dir));

    this.app.get(/.*/, (_, res) => {
      res.sendFile("index.html", { root: dir });
    });
  }

  public start(port: number): void {
    this.app.listen(port, () => {
      console.log(this.SERVER_START_MSG + port);
    });
  }

  public getExpressInstance() {
    return this.app;
  }
}

export default AppServer;
