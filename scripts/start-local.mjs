import { spawn } from "node:child_process";

const server = spawn(
  process.execPath,
  ["--enable-source-maps", "artifacts/api-server/dist/index.mjs"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: process.env.PORT || "5000",
      HOST: process.env.HOST || "127.0.0.1",
    },
  },
);

server.on("error", (error) => {
  process.stderr.write(`Could not start the local MED-A server: ${error.message}\n`);
  process.exit(1);
});

server.on("exit", (code) => {
  process.exit(code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.kill(signal);
  });
}
