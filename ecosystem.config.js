// PM2 process definitions for the Pocket production servers.
// Each Lightsail box runs ONE app; deploys scope with `--only <name>`:
//   backend  (api.pocketpakistan.com):  pm2 startOrReload ecosystem.config.js --only pocket-api
//   frontend (pocketpakistan.com):      pm2 startOrReload ecosystem.config.js --only pocket-web
// This mirrors the existing manual setup (npm workspace start scripts, fork mode).
module.exports = {
  apps: [
    {
      name: "pocket-api",
      cwd: "/home/ubuntu/pocket",
      script: "npm",
      args: "run start --workspace @pocket/api",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "pocket-web",
      cwd: "/home/ubuntu/pocket",
      script: "npm",
      args: "run start --workspace @pocket/web",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
