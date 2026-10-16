// Patch item 5: pilihan toko ambil-di-toko muncul SETELAH "Collect in Store"
// diklik, persis di tempat kotak hijau "Toko pilihan" yang Steven minta dihapus.
//
// Steven 16-10-2026 (gambar 5): "Yang collect in store, setelah itu bawahnya ada
// selected store itu dihapus saya gamau disitu ... saya mau ketika klik Collect
// In Store, maka nanti baru muncul Store yang mereka pilih di situ."
//
// Ibninya: popup `PickupStorePicker` dihapus total, dan pilihannya jadi kartu
// inline seperti zona pengantaran — satu pola untuk dua metode.
import fs from "node:fs";
import path from "node:path";
import { patchFile, eolOf } from "./_patch.mjs";

const FILE = "src/components/customer/OrderFlow.tsx";

/* ---- 1. Potong fungsi `PickupStorePicker` beserta komentarnya ---- */
const abs = path.resolve(process.cwd(), FILE);
const asli = fs.readFileSync(abs, "utf8");
const eol = eolOf(asli);
let teks = asli.split("\r\n").join("\n");

const mulai = '/**\n * Popup PEMILIHAN toko untuk metode "Ambil di toko".';
const selesai = "\n/**\n * Popup detail lokasi pengambilan / pengantaran.";

const a = teks.indexOf(mulai);
const b = teks.indexOf(selesai, a);
if (a < 0 || b < 0) {
  throw new Error("batas fungsi PickupStorePicker tidak ketemu");
}
if (teks.indexOf(mulai, a + 1) !== -1) {
  throw new Error("penanda awal PickupStorePicker muncul lebih dari sekali");
}
teks = teks.slice(0, a) + teks.slice(b + 1);

fs.writeFileSync(abs, eol === "\r\n" ? teks.split("\n").join("\r\n") : teks, "utf8");
console.log("OK  potong PickupStorePicker (" + (b - a) + " karakter)");

/* ---- 2. Sisa perubahan ---- */
const edits = [
  // Import WhatsAppLink sekarang tidak terpakai (semua tombol WA pindah ke
  // WhatsAppFab).
  [
    `import { WhatsAppLink } from "@/components/customer/WhatsAppLink";
`,
    ``,
  ],

  // State popup dibuang.
  [
    `  const [pickupPickerOpen, setPickupPickerOpen] = useState(false);
`,
    ``,
  ],

  // onPickupClick: tidak lagi membuka popup, hanya menyalakan metode pickup
  // supaya grid toko langsung muncul di bawahnya.
  [
    `  const onPickupClick = () => {
    updateDraft({ deliveryMethod: "pickup", address: "", addressNote: "", lat: null, lng: null });
    // Kalau cuma ada satu titik pengambilan, langsung dipakai supaya pembeli
    // tidak perlu popup untuk pilihan yang tidak ada artinya. Kalau ada
    // beberapa, popup pilihannya yang muncul.
    const zones = deliveryZones.filter((z) => z.kind === "pickup");
    if (zones.length === 1) {
      updateDraft({ deliveryZone: zones[0].id });
      setPickupPickerOpen(false);
      return;
    }
    setPickupPickerOpen(true);
  };`,
    `  const onPickupClick = () => {
    updateDraft({ deliveryMethod: "pickup", address: "", addressNote: "", lat: null, lng: null });
    /* Satu titik pengambilan tidak perlu DIPILIH: langsung dipakai supaya
       pembeli tidak melihat daftar pilihan yang tidak ada artinya. Dua titik
       atau lebih = pembeli yang memilih, lewat kartu yang muncul di bawah tiga
       tombol metode. */
    const zones = deliveryZones.filter((z) => z.kind === "pickup");
    if (zones.length === 1) {
      updateDraft({ deliveryZone: zones[0].id });
    }
  };`,
  ],

  // Validasi: tidak lagi membuka popup, hanya menahan dengan pesan.
  [
    `    /* Steven 14-10-2026: sekarang toko dipilih lewat popup. Kalau pembeli
       menutup popup tanpa memilih, \`deliveryZone\` masih nilai lama
       ("pickup" bawaan) yang TIDAK ada di tabel — \`create_order\` akan
       menolaknya dengan error yang membingungkan. Jadi:tahan di sini
       dengan pesan yang jelas, dan buka lagi popupnya. */
    if (draft.deliveryMethod === "pickup") {
      const validPickup = pickupZones.some((z) => z.id === draft.deliveryZone);
      if (!validPickup) {
        toast.warning(
          pickupZones.length > 0
            ? t.order.payment.pickupChooseTitle
            : t.order.payment.pickupEmpty
        );
        if (pickupZones.length > 0) setPickupPickerOpen(true);
        return false;
      }
    }`,
    `    /* Steven 16-10-2026: toko diambil lewat kartu yang muncul DI BAWAH
       tombol "Ambil di toko", jadi pembeli tidak perlu popup terpisah. Kalau
       dia lanjut tanpa memilih, \`deliveryZone\` masih nilai bawaan ("pickup")
       yang tidak ada di tabel \`delivery_zones\` — \`create_order\` menolaknya
       dengan error yang membingungkan. Jadi tahan di sini dengan pesan jelas.
       Kartu pilihannya sudah terlihat di layar, jadi tidak perlu membuka
       apa pun lagi. */
    if (draft.deliveryMethod === "pickup") {
      const validPickup = pickupZones.some((z) => z.id === draft.deliveryZone);
      if (!validPickup) {
        toast.warning(
          pickupZones.length > 0
            ? t.order.payment.pickupChooseTitle
            : t.order.payment.pickupEmpty
        );
        return false;
      }
    }`,
  ],

  // Kartu "Ambil di toko": catatan statis dilepas, nama toko kini tampil
  // sebagai pilihan di bawah.
  [
    `                  title={t.order.payment.pickup}
                  desc={t.order.payment.pickupDesc}
                  note={pickupNote}
                />`,
    `                  title={t.order.payment.pickup}
                  desc={t.order.payment.pickupDesc}
                />`,
  ],

  // const pickupNote jadi tidak terpakai.
  [
    `  const pickupNote = lang === "en" ? settings.pickup_note_en : settings.pickup_note_id;

`,
    ``,
  ],

  // Kotak hijau "Toko pilihan / Ganti toko" diganti grid kartu yang sama
  // seperti zona pengantaran.
  [
    `              {/* Toko pilihan (metode "Ambil di toko"). Steven 14-10-2026:
                  grid kartu toko yang panjang DIHAPUS dan diganti ringkasan
                  satu baris + tombol "Ganti toko". Alasannya: grid itu bikin
                  halaman panjang, dan tombol "Lihat lokasi" di bawahnya
                  membuka popup DETAIL — bukan popup pilihan. Sekarang ada
                  satu cara saja memilih, lewat popup, dan tempat ini hanya
                  menampilkan hasil pilihannya. */}
              {draft.deliveryMethod === "pickup" && pickupZones.length > 0 ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-matcha-300 bg-matcha-50 p-4">
                  <Store className="size-5 shrink-0 text-matcha-700" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold tracking-wide text-matcha-700 uppercase">
                      {t.order.payment.pickupSelectedStore}
                    </p>
                    <p className="mt-0.5 truncate text-sm font-bold text-cocoa-800">
                      {chosenPickup
                        ? lang === "en"
                          ? chosenPickup.name_en
                          : chosenPickup.name_id
                        : lang === "en"
                          ? "Not selected yet"
                          : "Belum dipilih"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickupPickerOpen(true)}
                    className="shrink-0 rounded-xl border border-cocoa-200 bg-white px-3.5 py-2.5 text-sm font-bold text-cocoa-700 transition hover:bg-cocoa-50"
                  >
                    {t.order.payment.pickupChangeStore}
                  </button>
                </div>
              ) : null}`,
    `              {/* Toko pengambilan. Steven 16-10-2026 (gambar 5): kotak hijau
                  "Toko pilihan / Belum dipilih / Ganti toko" DIHAPUS. Sekarang
                  pilihannya muncul sebagai kartu di bawah, sama persis dengan
                  zona pengantaran di atas — jadi pembeli memilih TOKO-nya sendiri
                  tepat setelah menekan "Ambil di toko", bukan lewat popup lain.

                  Sumber data tetap \`delivery_zones\` dengan kind 'pickup'
                  (Rumah Sushi, UVERS), jadi tidak ada tabel toko baru. */}
              {draft.deliveryMethod === "pickup" ? (
                pickupZones.length === 0 ? (
                  <p className="mt-4 rounded-2xl bg-honey-50 px-4 py-3 text-[13px] font-semibold text-honey-500">
                    {t.order.payment.pickupEmpty}
                  </p>
                ) : (
                  <div className="mt-4" data-pickup-store-list>
                    <p className="text-[11px] font-bold tracking-wide text-cocoa-500 uppercase">
                      {t.order.payment.pickupChooseTitle}
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {pickupZones.map((z) => {
                        const zName = lang === "en" ? z.name_en : z.name_id;
                        const zNote = (lang === "en" ? z.note_en : z.note_id) ?? "";
                        return (
                          <ChoiceCard
                            key={z.id}
                            selected={draft.deliveryZone === z.id}
                            onClick={() => updateDraft({ deliveryZone: z.id })}
                            icon={<Store className="size-5" />}
                            title={zName}
                            note={zNote}
                          />
                        );
                      })}
                    </div>
                  </div>
                )
              ) : null}`,
  ],

  // Pemanggilan popup dihapus.
  [
    `      <PickupStorePicker
        open={pickupPickerOpen}
        zones={pickupZones}
        selectedId={draft.deliveryZone}
        onPick={(z) => {
          updateDraft({ deliveryZone: z.id });
          setPickupPickerOpen(false);
        }}
        onClose={() => setPickupPickerOpen(false)}
      />

`,
    ``,
  ],

  // chosenPickup tidak terpakai lagi.
  [
    `  const pickupZones = deliveryZones.filter((z) => z.kind === "pickup");
  const chosenPickup = pickupZones.find((z) => z.id === draft.deliveryZone) ?? null;
`,
    `  const pickupZones = deliveryZones.filter((z) => z.kind === "pickup");
`,
  ],
];

console.log("OK  " + JSON.stringify(patchFile(FILE, edits)));