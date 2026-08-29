/*
 * Run the demo service without the Electron shell (development / debugging):
 *   npm run service
 * SEs never use this — the Electron app starts the service automatically.
 */
require("./server").start();
