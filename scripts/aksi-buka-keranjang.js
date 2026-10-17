(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.scrollTo(0, 400);
  await sleep(400);
  const btn =
    document.querySelector("[data-cart-header-button]") ||
    [...document.querySelectorAll("button")].find((b) =>
      /keranjang|cart/i.test(b.getAttribute("aria-label") || ""),
    );
  if (!btn) return JSON.stringify({ galat: "tombol keranjang tidak ditemukan" });
  btn.click();
  await sleep(1200);
  const dlg = document.querySelector('[role="dialog"]');
  return JSON.stringify({
    dialogTerbuka: !!dlg,
    bodyPosition: document.body.style.position,
    bodyTop: document.body.style.top,
    dialogTinggi: dlg ? Math.round(dlg.getBoundingClientRect().height) : null,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  });
})()