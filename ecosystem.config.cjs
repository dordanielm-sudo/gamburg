// PM2 process definition - keeps `next start` alive across crashes and
// server reboots. See DEPLOY.md for how this gets used on the server.
const fs = require("fs");
const os = require("os");
const path = require("path");

const cloudflaredBin = path.join(__dirname, "cloudflared");

const apps = [
  {
    name: "gamburg-crm",
    script: "npm",
    args: "start",
    cwd: __dirname,
    env: {
      NODE_ENV: "production",
      PORT: 3000,
    },
    // one worker per core. Next renders on the server, so a single worker
    // meant two people opening a heavy screen at the same moment queued
    // behind each other. "max" rather than a number so this follows the
    // server it is on instead of having to be edited after every resize.
    instances: "max",
    autorestart: true,
    max_memory_restart: "500M",
  },
];

// The Cloudflare tunnel is what actually puts the site on the internet -
// nginx only listens locally, and without this process the domain answers
// with Cloudflare error 1033.
//
// It used to be started by hand, outside this file, and that is exactly how
// it got lost: deploy.sh ends with `pm2 save`, which writes down whatever is
// running at that moment. The tunnel died when the server restarted for a
// resize, the next deploy saved a list without it, and from then on even
// `pm2 resurrect` could not bring it back.
//
// Declared here, it is started and reloaded with everything else and cannot
// fall out of the saved list again.
//
// Guarded on the binary being present so that a checkout without it - a dev
// machine, a fresh clone - still starts the app instead of failing the whole
// deploy on a missing file.
if (fs.existsSync(cloudflaredBin)) {
  apps.push({
    name: "cloudflared",
    script: cloudflaredBin,
    // a compiled binary, not a script: without this PM2 tries to run it
    // through Node and it exits immediately
    interpreter: "none",
    args: `tunnel --config ${path.join(os.homedir(), ".cloudflared", "config.yml")} run`,
    cwd: __dirname,
    instances: 1,
    autorestart: true,
  });
}

module.exports = { apps };
