<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project memory

Sebelum mulai kerja, **baca folder `MEMORY/` di root project**:

- `MEMORY/README.md` — rangkuman project, struktur, dan cara kerja.
- `MEMORY/CHANGELOG.md` — log perubahan terbaru (entry di atas = paling baru).
- `MEMORY/gotchas.md` — jebakan yang sering bikin AI session salah.
- `MEMORY/decisions.md` — keputusan teknis + alasan (jangan dibatalkan tanpa diskusi).

Setelah selesai kerja, **update `MEMORY/CHANGELOG.md`** dengan entri baru di paling atas: scope, file yang berubah, alasan, dan verifikasi yang dijalankan. Format lihat di `MEMORY/README.md`.
