import { createApp } from "./app.js";
import { env } from "./config.js";

const app = createApp();

app.listen(env.API_PORT, () => {
  console.log(`Pocket API listening on port ${env.API_PORT}`);
});
