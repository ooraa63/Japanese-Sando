// Cek apakah extension pg_cron tersedia di project Supabase ini.
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows } = await client.query(
  `select name, default_version, installed_version from pg_available_extensions where name in ('pg_cron','pg_net','pgmq')`
);
console.table(rows);

const { rows: installed } = await client.query(
  `select extname, extversion from pg_extension where extname in ('pg_cron','pg_net')`
);
console.log("sudah ter-install:");
console.table(installed);

const { rows: jobs } = await client.query(
  `select jobid, schedule, jobname, active from cron.job order by jobid`
);
console.log("cron job yang ada:");
console.table(jobs);

await client.end();