import { LiquibaseConfig, Liquibase } from "node-liquibase";

import dotenv from "dotenv";
dotenv.config();
const { DB_USER, DB_PASSWORD } = process.env;

const myConfig: LiquibaseConfig = {
  changeLogFile: "db/changelog.xml",
  url: "jdbc:mysql://localhost:3306/new_schema?serverTimezone=UTC",
  username: DB_USER ?? "",
  password: DB_PASSWORD ?? "",
  classpath: "db/mysql-connector-j-8.0.33.jar",
};
const instance = new Liquibase(myConfig);

async function update() {
  await instance.update({});
}

async function scorch() {
  await instance.dropAll();
}

async function clearCheckSums() {
  await instance.clearCheckSums();
}
if (process.argv[2] === "scorch") {
  scorch();
} else if (process.argv[2] === "update") {
  update();
} else if (process.argv[2] === "clearCheckSums") {
  clearCheckSums();
}
