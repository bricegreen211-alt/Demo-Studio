/*
 * Create the double-click launchers. Runs automatically from postinstall, so
 * an SE gets them as a side effect of the `npm install` they already run — and
 * gets fresh ones on every update, which is what keeps the baked-in paths
 * correct.
 *
 * Manually:  npm run setup
 *
 * Never exits non-zero: a launcher that could not be written must not fail
 * `npm install` and leave the SE with a half-installed app.
 */
const launcher = require("../apps/studio/launcher");

if (!launcher.supported) {
  console.log("[setup] launchers are only generated on macOS and Windows — skipping");
  process.exit(0);
}

const { made, failed } = launcher.create();

made.forEach((p) => console.log("[setup] created " + p));
failed.forEach((f) => console.warn("[setup] could not create " + f));

if (made.length) {
  console.log('[setup] Double-click "' + launcher.APP_NAME + '" to start. No terminal needed from here on.');
} else {
  console.warn("[setup] No launchers were created. You can still start the app with: npm start");
}
