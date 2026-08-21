import { createAuth } from "./auth.mjs";

const stdinChunks = [];
for await (const chunk of process.stdin) stdinChunks.push(chunk);
const [email, password] = Buffer.concat(stdinChunks).toString("utf8").split("\n").map((value) => value.replace(/\r$/, ""));
if (!email || !password) {
  console.error("Administrator credentials must be supplied through standard input.");
  process.exit(64);
}
const auth = createAuth();
const admin = await auth.createOrUpdateAdmin(email, password);
console.log(`Admin account ready for ${admin.email}`);
