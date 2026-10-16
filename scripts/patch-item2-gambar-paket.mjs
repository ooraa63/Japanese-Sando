// Patch item 2: mode paket terkunci (combo/fixed) harus menampilkan gambar
// makanannya.
//
// Steven 16-10-2026 (gambar 2): "walaupun sudah fix oleh Penjual tapi tetap
// harus ada gambar makannya". Sebelumnya tiap baris isi paket cuma nomor +
// teks nama, jadi pembeli tidak pernah melihat makanan yang dibelinya.
import { patchFile } from "./_patch.mjs";

const edits = [
  // Ikon untuk rasa tanpa foto.
  [
    `  MessageSquare,
  PackageX,
} from "lucide-react";`,
    `  MessageSquare,
  PackageX,
  ShoppingBag,
} from "lucide-react";`,
  ],

  // Baris isi paket: foto rasa di kiri, nomor di kanan.
  [
    `            {fixedContents.map((f, idx) => (
              <li
                key={\`\${f.id}-\${idx}\`}
                className="flex items-center gap-3 rounded-2xl border border-cocoa-200 bg-cream-50 px-4 py-3"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-cocoa-800 text-[12px] font-bold text-cream-50 tabular">
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-cocoa-900">
                    {lang === "en" ? f.name_en : f.name_id}
                  </span>
                </span>
              </li>
            ))}`,
    `            {fixedContents.map((f, idx) => {
              const namaRasa = lang === "en" ? f.name_en : f.name_id;
              return (
              <li
                key={\`\${f.id}-\${idx}\`}
                className="flex items-center gap-3 rounded-2xl border border-cocoa-200 bg-cream-50 p-3"
              >
                {/* Steven 16-10-2026 (gambar 2): walaupun paketnya sudah
                    dikunci penjual, pembeli tetap harus MELIHAT makanannya,
                    jadi tiap baris memakai foto rasa seperti di keranjang. */}
                <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-cocoa-100">
                  {f.image_url ? (
                    <Image
                      src={f.image_url}
                      alt={namaRasa}
                      fill
                      sizes="56px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="grid size-full place-items-center text-cocoa-400">
                      <ShoppingBag className="size-4" />
                    </span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug font-bold text-cocoa-900">
                    {namaRasa}
                  </span>
                </span>

                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-cocoa-800 text-[12px] font-bold text-cream-50 tabular">
                  {idx + 1}
                </span>
              </li>
              );
            })}`,
  ],
];

console.log("OK  " + JSON.stringify(patchFile("src/components/customer/OrderBundleModal.tsx", edits)));