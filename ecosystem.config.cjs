// PM2 process definition - keeps `next start` alive across crashes and
// server reboots. See DEPLOY.md for how this gets used on the server.
module.exports = {
  apps: [
    {
      name: "gamburg-crm",
      script: "npm",
      args: "start",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "500M",
    },
  ],
};
