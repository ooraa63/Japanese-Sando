const { Client } = require("pg");

function loadEnv() {
  const fs = require("fs");
  const path = require("path");
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  }
}

(async () => {
  loadEnv();
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  // Get a real flavor ID
  const flavorRes = await c.query("SELECT id FROM public.flavors WHERE is_active = true LIMIT 1");
  const flavorId = flavorRes.rows[0].id;
  console.log("Using flavor_id:", flavorId);

  const payload = {
    p_customer_name: "Test User",
    p_customer_email: null,
    p_instagram: "@test",
    p_phone: "081234567890",
    p_payment_method: "qris_midtrans",
    p_delivery_method: "pickup",
    p_delivery_zone: "pickup",
    p_address: null,
    p_address_note: null,
    p_lat: null,
    p_lng: null,
    p_transfer_method: null,
    p_payment_proof: null,
    p_note: null,
    p_language: "id",
    p_items: [{ flavor_id: flavorId, quantity: 1 }],
    p_bundles: [],
    p_user_id: null,
  };

  try {
    const r = await c.query(
      `SELECT public.create_order(
        $1::text, $2::text, $3::text, $4::text,
        $5::text, $6::text, $7::text,
        $8::text, $9::text, $10::double precision, $11::double precision,
        $12::text, $13::text, $14::text,
        $15::text,
        $16::jsonb, $17::jsonb,
        $18::uuid
      ) AS result`,
      [
        payload.p_customer_name,
        payload.p_customer_email,
        payload.p_instagram,
        payload.p_phone,
        payload.p_payment_method,
        payload.p_delivery_method,
        payload.p_delivery_zone,
        payload.p_address,
        payload.p_address_note,
        payload.p_lat,
        payload.p_lng,
        payload.p_transfer_method,
        payload.p_payment_proof,
        payload.p_note,
        payload.p_language,
        JSON.stringify(payload.p_items),
        JSON.stringify(payload.p_bundles),
        payload.p_user_id,
      ]
    );
    console.log("Result:", r.rows[0]);
  } catch (e) {
    console.error("Error code:", e.code);
    console.error("Error message:", e.message);
    console.error("Error detail:", e.detail);
    console.error("Error hint:", e.hint);
    console.error("Full:", JSON.stringify(e, null, 2));
  }

  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });