(() => {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  const theme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", theme);

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const loading = document.getElementById("property-loading");
  const content = document.getElementById("property-content");
  const errorBox = document.getElementById("property-error");
  const phone = "905551234567";

  // Image fallback (replaces inline onerror)
  document.addEventListener("error", (e) => {
    const el = e.target;
    if (el && el.tagName === "IMG" && el.dataset.fallback && el.src !== el.dataset.fallback) {
      el.src = el.dataset.fallback;
    }
  }, true);

  if (!id) {
    loading.style.display = "none";
    errorBox.style.display = "block";
    return;
  }

  async function load() {
    try {
      const res = await fetch(`/api/properties/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error("not found");
      const h = await res.json();
      document.title = `${h.title} — Parsa Emlak`;
      render(h);
    } catch (e) {
      loading.style.display = "none";
      errorBox.style.display = "block";
    }
  }

  function render(h) {
    const mainImg = h.image || (h.images && h.images[0] && h.images[0].url) || "https://placehold.co/800x500";
    const wa = `https://wa.me/${phone}?text=${encodeURIComponent(`Merhaba, "${h.title}" ilanıyla ilgileniyorum.`)}`;
    const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.location)}`;
    const gallery = (h.images || []).slice(0, 12).map((img) =>
      `<img src="${esc(img.url)}" alt="" loading="lazy" data-action="swap-main" />`
    ).join("");
    const meta = [
      h.bedrooms ? `<div><strong>🛏</strong> ${esc(h.bedrooms)} Oda</div>` : "",
      h.bathrooms ? `<div><strong>🚿</strong> ${esc(h.bathrooms)} Banyo</div>` : "",
      h.area_m2 ? `<div><strong>📐</strong> ${esc(h.area_m2)} m²</div>` : "",
      h.floor_no ? `<div><strong>🏢</strong> Kat ${esc(h.floor_no)}</div>` : "",
      h.year_built ? `<div><strong>📅</strong> ${esc(h.year_built)}</div>` : "",
      `<div><strong>🏠</strong> ${esc(h.type)}</div>`,
    ].filter(Boolean).join("");

    content.innerHTML = `
      <img id="main-img" src="${esc(mainImg)}" alt="${esc(h.title)}" style="width:100%;border-radius:16px;max-height:520px;object-fit:cover" data-fallback="https://placehold.co/800x500" />
      ${gallery ? `<div class="gallery-thumbs" style="margin-top:12px">${gallery}</div>` : ""}
      <h1 style="font-family:'Playfair Display',serif;margin:24px 0 8px">${esc(h.title)}</h1>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:24px">
        <span style="font-size:30px;color:var(--accent);font-weight:700">₺${Number(h.price).toLocaleString()}</span>
        <span style="color:var(--text-secondary)">📍 ${esc(h.location)}</span>
      </div>
      <div class="detail-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;background:var(--bg-white);padding:20px;border-radius:12px;border:1px solid var(--border);margin-bottom:24px">
        ${meta}
      </div>
      ${h.description ? `<p style="line-height:1.7;margin-bottom:24px;color:var(--text-secondary)">${esc(h.description)}</p>` : ""}
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:32px">
        <a href="${wa}" target="_blank" rel="noopener" class="btn btn-whatsapp">💬 WhatsApp</a>
        <a href="${map}" target="_blank" rel="noopener" class="btn btn-map">🗺️ Haritada Gör</a>
        <a href="tel:+${phone}" class="btn btn-call">📞 Ara</a>
      </div>
      <div class="inquiry-form" style="background:var(--bg-white);padding:24px;border-radius:12px;border:1px solid var(--border)">
        <h3 style="margin-bottom:16px">Bilgi Al</h3>
        <input id="inq-name" placeholder="Adınız" />
        <input id="inq-phone" placeholder="Telefon" />
        <input id="inq-email" placeholder="Email (opsiyonel)" />
        <textarea id="inq-msg" placeholder="Mesajınız" rows="3" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text-primary);font-family:inherit;font-size:14px;resize:vertical;margin-bottom:12px"></textarea>
        <button id="inq-submit" class="btn btn-call" style="width:100%;padding:14px" data-action="send-inquiry" data-id="${h.id}">Gönder</button>
        <div id="inq-status" style="margin-top:12px;text-align:center"></div>
      </div>`;
    loading.style.display = "none";
    content.style.display = "block";
  }

  // Event delegation (CSP-safe)
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const a = t.dataset.action;
    if (a === "swap-main") {
      const m = document.getElementById("main-img");
      if (m) m.src = t.src;
    } else if (a === "send-inquiry") {
      const propId = t.dataset.id;
      const name = document.getElementById("inq-name").value.trim();
      const ph = document.getElementById("inq-phone").value.trim();
      const email = document.getElementById("inq-email").value.trim();
      const message = document.getElementById("inq-msg").value.trim();
      const status = document.getElementById("inq-status");
      if (!name || !ph) { status.textContent = "Ad ve telefon gerekli"; status.style.color = "var(--red)"; return; }
      try {
        const r = await fetch(`/api/properties/${encodeURIComponent(propId)}/inquiry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, phone: ph, email, message }),
        });
        const d = await r.json();
        status.textContent = d.message || "OK";
        status.style.color = r.ok ? "var(--green)" : "var(--red)";
      } catch (err) {
        status.textContent = "Bağlantı hatası";
        status.style.color = "var(--red)";
      }
    }
  });

  load();
})();
