import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const directory = fileURLToPath(root);
const container = "merch-legacy-check-" + process.pid;
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: directory,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(cmd + " exited " + code)),
    );
  });
}
let started = false;
try {
  await run(process.execPath, ["--test", "tests/condition.test.mjs"]);
  await mkdir(new URL("output/", root), { recursive: true });
  const jar = new URL("output/firestore.jar", root);
  const expected =
    "9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c";
  let bytes;
  try {
    bytes = await readFile(jar);
  } catch {}
  if (!bytes || createHash("sha256").update(bytes).digest("hex") !== expected) {
    const response = await fetch(
      "https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar",
    );
    if (!response.ok) throw new Error("Emulator download failed");
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash("sha256").update(bytes).digest("hex") !== expected)
    throw new Error("Emulator checksum mismatch");
  await writeFile(jar, bytes);
  await run("docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    container,
    "--publish",
    "127.0.0.1:18080:8080",
    "--mount",
    "type=bind,source=" +
      fileURLToPath(jar) +
      ",target=/work/firestore.jar,readonly",
    "--mount",
    "type=bind,source=" +
      fileURLToPath(new URL("tests/emulator.rules", root)) +
      ",target=/work/firestore.rules,readonly",
    "eclipse-temurin:21-jre",
    "java",
    "-jar",
    "/work/firestore.jar",
    "--host",
    "0.0.0.0",
    "--port",
    "8080",
    "--project_id",
    "demo-merch-stock-tests",
    "--single_project_mode",
    "--single_project_mode_error",
    "--rules",
    "/work/firestore.rules",
  ]);
  started = true;
  let ready = false;
  for (let n = 0; n < 45; n++) {
    try {
      await fetch("http://127.0.0.1:18080", {
        signal: AbortSignal.timeout(1000),
      });
      ready = true;
      break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("Firestore emulator did not start");
  if (!process.argv.includes("--stock-only"))
    await run(process.execPath, ["tests/condition-browser.mjs"]);
  if (!process.argv.includes("--condition-only"))
    await run(process.execPath, ["tests/stock-regression.mjs"]);
} finally {
  if (started) await run("docker", ["stop", container]);
}
