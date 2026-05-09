import assert from "node:assert/strict";

import { DatabaseStorage } from "../storage";

const storage = new DatabaseStorage();

assert.equal(typeof storage.getMessage, "function");
assert.equal(typeof storage.updateMessage, "function");

console.log("databaseStorage.contract.test.ts ok");
