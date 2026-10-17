(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};

  window.scrollTo(0, 400);
  await sleep(400);
  out.sebelum = { scrollY: window.scrollY, bodyPosition: document.body.style.position || "(kosong)" };

  const btn =
    document.querySelector("[data-cart-header-button]") ||
    [...document.querySelectorAll("button")].find((b) => /keranjang|cart/i.test(b.getAttribute("aria-label") || ""));
  if (!btn) return JSON.stringify({ galat: "tombol keranjang tidak ditemukan" });
  btn.click();
  await sleep(1000);

  const dlg = document.querySelector('[role="dialog"]');
  out.dialogTerbuka = !!dlg;
  out.kunci = {
    bodyPosition: document.body.style.position || "(kosong)",
    bodyTop: document.body.style.top,
    bodyOverflowY: document.body.style.overflowY,
    htmlOverflow: document.documentElement.style.overflow,
    scrollY: window.scrollY,
  };

  // Paksa halaman di belakang supaya ikut bergulir.
  window.scrollTo(0, 900);
  await sleep(350);
  out.scrollSetelahPaksa = window.scrollY;

  // `formatIDR` bisa pakai spasi biasa atau non-breaking space, jadi dua-duanya.
  const rupiah = /^Rp[\s\u00a0]?\d/;
  out.baris = [...document.querySelectorAll("li")].map((li) => {
    const harga = [...li.querySelectorAll("span")].find((s) => rupiah.test(s.textContent.trim()));
    const gaya = harga ? getComputedStyle(harga) : null;
    return {
      teks: li.textContent.replace(/\s+/g, " ").trim().slice(0, 80),
      harga: harga ? harga.textContent.trim() : null,
      tinggi: harga ? Math.round(harga.getBoundingClientRect().height) : null,
      lineHeight: gaya ? parseFloat(gaya.lineHeight) : null,
    };
  });

  // Tutup lewat Escape (CartSheet listens di document).
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(700);
  out.setelahTutup = {
    dialogAda: !!document.querySelector('[role="dialog"]'),
    scrollY: window.scrollY,
    bodyPosition: document.body.style.position || "(kosong)",
    bodyTop: document.body.style.top,
    htmlOverflow: document.documentElement.style.overflow,
  };

  return JSON.stringify(out);
})()