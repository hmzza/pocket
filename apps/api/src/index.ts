import { createApp } from "./app.js";
import { env } from "./config.js";
import { ensureBootstrapAdmin } from "./lib/bootstrap.js";

const app = createApp();

ensureBootstrapAdmin()
  .then(() => {
    app.listen(env.API_PORT, () => {
      console.log(`Pocket API listening on port ${env.API_PORT}`);
    });
  })
  .catch((error) => {
    console.error("Unable to initialize Pocket API:", error);
    process.exitCode = 1;
  });
