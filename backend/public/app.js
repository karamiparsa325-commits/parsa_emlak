/* Parsa Emlak — frontend logic
 * CSP-safe: zero inline handlers. Every interaction is routed through
 * data-action attributes and event delegation.
 */
(() => {
  "use strict";

  // ---------- State ----------
  // The server is the source of truth — we only hold the *current page* of items.
  let pageItems = [];
  let pageMeta = { total: 0, maxPrice: 0, page: 1, pageSize: 12, totalPages: 0 };
  let currentUser = null; // populated by GET /api/me on boot
  // Migration: clear any stale token from the previous localStorage-based auth.
  try { localStorage.removeItem("token"); localStorage.removeItem("user"); } catch (_) {}
  let editingId = null;
  let showFavsOnly = false;
  let currentPage = 1;
  const PAGE_SIZE = 12;
  let inflight = null; // AbortController for the currently pending list request
  let rates = { TRY: 1, USD: 30, EUR: 33 };
  let lang = localStorage.getItem("lang") || "tr";
  let theme = localStorage.getItem("theme") || "light";

  const I18N = {
    tr: {
      login: "Giriş Yap", register: "Kayıt Ol",
      no_account: "Hesabın yok mu? Kayıt Ol",
      has_account: "Zaten üye misin? Giriş Yap",
      hero_eyebrow: "İzmir · Premium Emlak Danışmanlığı",
      hero_title: "Hayalindeki Evi<br/>Bugün Keşfet",
      hero_subtitle: "Türkiye'nin en seçkin villa, daire ve arsa portföyüne göz atın.",
      search_placeholder: "Şehir, ilçe veya ilan adı ara...",
      search_btn: "Ara",
      featured: "Öne Çıkan İlanlar",
      featured_sub: "Size özel seçilmiş en güncel portföyler",
      no_results: "Sonuç bulunamadı",
      no_results_sub: "Filtreleri değiştirmeyi deneyin",
      add_listing: "Yeni İlan Ekle",
      publish: "Yayınla",
      cancel: "İptal",
      office: "Ofisimiz", contact: "İletişim", follow: "Takip Edin",
      logout: "Çıkış",
      // new sections
      cat_title: "Kategoriye Göz At", cat_sub: "Aradığınız emlak türünü seçin",
      cat_apt: "Daire", cat_villa: "Villa", cat_land: "Arsa", cat_office: "Ofis",
      why_title: "Neden Parsa Emlak?", why_sub: "Yüzlerce ailenin tercih ettiği güvenilir partner",
      why_1_t: "Güvenli İşlem", why_1_p: "Her sözleşme avukat onayından geçer.",
      why_2_t: "Uzman Danışman", why_2_p: "Bölge tecrübeli emlak ekibi.",
      why_3_t: "Ücretsiz Keşif", why_3_p: "İlk görüşme ve ekspertiz bizden.",
      why_4_t: "7/24 Destek", why_4_p: "Hafta sonu dahil WhatsApp hattımız açık.",
      stat_listings: "Portföy", stat_clients: "Mutlu Müşteri",
      stat_years: "Yıllık Tecrübe", stat_satisfaction: "Memnuniyet",
      rev_title: "Müşterilerimiz Ne Diyor?", rev_sub: "Gerçek hikayeler, gerçek deneyimler",
      nbh_title: "Popüler Bölgeler", nbh_sub: "İzmir'in en aranan semtleri",
      nbh_explore: "Keşfet →",
      news_title: "Yeni İlanlardan Haberdar Ol", news_sub: "Haftalık özel portföy bültenimize katılın.",
      news_btn: "Abone Ol",
      footer_brand_p: "İzmir'in en güvenilir emlak danışmanlık platformu. Her bütçeye uygun seçenekler.",
      quick_links: "Hızlı Bağlantılar", footer_listings: "İlanlar", footer_about: "Hakkımızda",
      footer_kvkk: "KVKK", footer_terms: "Kullanım Koşulları", footer_rights: "Tüm hakları saklıdır.",
    },
    en: {
      login: "Sign In", register: "Sign Up",
      no_account: "No account? Sign Up",
      has_account: "Already a member? Sign In",
      hero_eyebrow: "İzmir · Premium Real Estate",
      hero_title: "Discover Your<br/>Dream Home Today",
      hero_subtitle: "Browse Türkiye's finest portfolio of villas, apartments and land.",
      search_placeholder: "Search city, district or listing...",
      search_btn: "Search",
      featured: "Featured Listings",
      featured_sub: "Hand-picked properties just for you",
      no_results: "No results",
      no_results_sub: "Try adjusting the filters",
      add_listing: "Add New Listing",
      publish: "Publish",
      cancel: "Cancel",
      office: "Our Office", contact: "Contact", follow: "Follow Us",
      logout: "Log out",
      // new sections
      cat_title: "Browse by Category", cat_sub: "Pick the property type you're after",
      cat_apt: "Apartment", cat_villa: "Villa", cat_land: "Land", cat_office: "Office",
      why_title: "Why Parsa Emlak?", why_sub: "The trusted partner of hundreds of families",
      why_1_t: "Secure Transactions", why_1_p: "Every contract is lawyer-reviewed.",
      why_2_t: "Expert Advisors", why_2_p: "Local agents with deep area knowledge.",
      why_3_t: "Free Consultation", why_3_p: "First viewing and appraisal on us.",
      why_4_t: "24/7 Support", why_4_p: "WhatsApp line open, weekends included.",
      stat_listings: "Listings", stat_clients: "Happy Clients",
      stat_years: "Years of Experience", stat_satisfaction: "Satisfaction",
      rev_title: "What Our Clients Say", rev_sub: "Real stories, real experiences",
      nbh_title: "Popular Neighborhoods", nbh_sub: "İzmir's most-searched districts",
      nbh_explore: "Explore →",
      news_title: "Get New Listings First", news_sub: "Join our weekly curated portfolio digest.",
      news_btn: "Subscribe",
      footer_brand_p: "İzmir's most trusted real estate platform. Properties for every budget.",
      quick_links: "Quick Links", footer_listings: "Listings", footer_about: "About",
      footer_kvkk: "Privacy", footer_terms: "Terms of Use", footer_rights: "All rights reserved.",
    },
  };

  const PLACEHOLDER = "https://placehold.co/400x250?text=Resim+Yok";
  const PLACEHOLDER_LG = "https://placehold.co/600x400";

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  const debounce = (fn, ms) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };
  const fmtPrice = (n, curr) => {
    const symbol = curr === "USD" ? "$" : curr === "EUR" ? "€" : "₺";
    const v = (Number(n) / rates[curr]).toLocaleString(undefined, { maximumFractionDigits: 0 });
    return `${symbol}${v}`;
  };
  const tt = (key) => I18N[lang][key] ?? key;

  // ---------- Theme ----------
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", theme);
    const btn = $("theme-toggle");
    if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
  }
  function toggleTheme() {
    theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem("theme", theme);
    applyTheme();
  }

  // ---------- Language ----------
  function applyLanguage() {
    document.documentElement.setAttribute("lang", lang);
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      if (I18N[lang][k] !== undefined) el.innerHTML = I18N[lang][k];
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const k = el.getAttribute("data-i18n-placeholder");
      if (I18N[lang][k] !== undefined) el.placeholder = I18N[lang][k];
    });
    const btn = $("lang-toggle");
    if (btn) btn.textContent = lang.toUpperCase();
  }
  function toggleLanguage() {
    lang = lang === "tr" ? "en" : "tr";
    localStorage.setItem("lang", lang);
    applyLanguage();
    updateUserArea();
  }

  // ---------- Auth ----------
  const openAuthModal = () => { $("auth-modal").style.display = "block"; };
  const closeAuthModal = () => { $("auth-modal").style.display = "none"; };
  function toggleAuthMode() {
    const login = $("login-section");
    const reg = $("register-section");
    const showingLogin = login.style.display !== "none";
    login.style.display = showingLogin ? "none" : "block";
    reg.style.display = showingLogin ? "block" : "none";
  }

  async function registerUser() {
    const username = $("reg-user").value.trim();
    const password = $("reg-pass").value;
    if (!username || !password) return showToast("Bilgileri doldurun");
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      showToast(data.message);
      if (res.ok) toggleAuthMode();
    } catch (e) { showToast("Bağlantı hatası"); }
  }

  async function loginUser() {
    const username = $("login-user").value.trim();
    const password = $("login-pass").value;
    if (!username || !password) return showToast("Bilgileri doldurun");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.message || "Hatalı giriş");
      currentUser = { username: data.username, role: data.role };
      closeAuthModal();
      updateUserArea();
      applyFilters();
    } catch (e) { showToast("Bağlantı hatası"); }
  }

  async function logout() {
    try { await fetch("/api/logout", { method: "POST" }); } catch (_) {}
    currentUser = null;
    updateUserArea();
    applyFilters();
  }

  async function bootSession() {
    try {
      const res = await fetch("/api/me");
      if (res.ok) currentUser = await res.json();
    } catch (_) { /* not logged in, leave currentUser null */ }
  }

  function updateUserArea() {
    const area = $("user-area");
    const adminForm = $("admin-form");
    if (currentUser) {
      const roleLabel = currentUser.role === "admin"
        ? (lang === "tr" ? "Yönetici" : "Admin")
        : (lang === "tr" ? "Üye" : "Member");
      area.innerHTML = `
        <span class="user-badge">👤 ${esc(currentUser.username)} (${roleLabel})</span>
        <button data-action="logout" class="btn btn-outline" style="padding:8px 16px">${tt("logout")}</button>`;
      adminForm.style.display = currentUser.role === "admin" ? "block" : "none";
    } else {
      area.innerHTML = `<button data-action="open-auth" id="login-btn" class="btn btn-call">${tt("login")}</button>`;
      adminForm.style.display = "none";
    }
  }

  // ---------- Favorites ----------
  function getFavorites() {
    try { return JSON.parse(localStorage.getItem("myFavorites") || "[]"); }
    catch { return []; }
  }
  function toggleFavorite(id, event) {
    if (event) event.stopPropagation();
    // Pop animation on the clicked heart before the list re-renders.
    if (event && event.target) {
      const heart = event.target.closest(".fav-btn");
      if (heart) {
        heart.classList.remove("pop");
        // Force reflow so the animation restarts even on rapid taps.
        void heart.offsetWidth;
        heart.classList.add("pop");
      }
    }
    let favs = getFavorites();
    if (favs.includes(id)) favs = favs.filter((f) => f !== id);
    else favs.push(id);
    localStorage.setItem("myFavorites", JSON.stringify(favs));
    applyFilters();
  }
  function toggleFavFilter() {
    showFavsOnly = !showFavsOnly;
    const btn = $("fav-filter-btn");
    btn.classList.toggle("active", showFavsOnly);
    btn.textContent = showFavsOnly
      ? (lang === "tr" ? "❤️ Tümünü Göster" : "❤️ Show All")
      : (lang === "tr" ? "❤️ Favorilerim" : "❤️ My Favorites");
    currentPage = 1;
    applyFilters();
  }

  // ---------- Hero search ----------
  function syncSearch(val) {
    $("search-box").value = val;
    debouncedFilter();
  }
  function scrollToListings() {
    $("filter-bar").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- Currency ----------
  async function fetchRates() {
    try {
      const r = await fetch("https://open.er-api.com/v6/latest/TRY");
      const d = await r.json();
      if (d && d.rates) {
        rates.USD = 1 / d.rates.USD;
        rates.EUR = 1 / d.rates.EUR;
        applyFilters();
      }
    } catch (_) { /* offline → use defaults */ }
  }

  // ---------- Load + filter + render ----------
  function showSkeleton(on) {
    const sk = $("skeleton-loader");
    if (sk) sk.style.display = on ? "grid" : "none";
  }

  // Build a query string from the current filter UI + paging state.
  function buildQuery() {
    const params = new URLSearchParams();
    params.set("page", String(currentPage));
    params.set("pageSize", String(PAGE_SIZE));

    const s = $("search-box").value.trim();
    if (s) params.set("search", s);
    const status = $("status-filter").value;
    if (status) params.set("status", status);
    const type = $("type-filter").value;
    if (type) params.set("type", type);
    const priceMin = $("price-min").value;
    if (priceMin !== "") params.set("priceMin", priceMin);
    const priceMax = $("price-max").value;
    if (priceMax !== "") params.set("priceMax", priceMax);
    const bedMin = $("bed-min").value;
    if (bedMin !== "") params.set("bedMin", bedMin);
    const areaMin = $("area-min").value;
    if (areaMin !== "") params.set("areaMin", areaMin);
    const sort = $("sort-select").value;
    if (sort && sort !== "newest") params.set("sort", sort);

    if (showFavsOnly) {
      const favs = getFavorites();
      // Empty favorites → empty result; we still send the param so server returns 0.
      params.set("ids", favs.join(","));
    }

    return params.toString();
  }

  async function applyFilters() {
    // Cancel any previous in-flight request so out-of-order responses don't flicker.
    if (inflight) inflight.abort();
    const ctrl = new AbortController();
    inflight = ctrl;

    showSkeleton(true);
    try {
      const res = await fetch(`/api/properties?${buildQuery()}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      pageItems = data.items || [];
      pageMeta = {
        total: data.total ?? 0,
        maxPrice: data.maxPrice ?? 0,
        page: data.page ?? 1,
        pageSize: data.pageSize ?? PAGE_SIZE,
        totalPages: data.totalPages ?? 0,
      };
      // If we asked for a page past the end (e.g. after a filter shrinks the result),
      // clamp and refetch once.
      if (pageMeta.totalPages > 0 && currentPage > pageMeta.totalPages) {
        currentPage = pageMeta.totalPages;
        inflight = null;
        return applyFilters();
      }
      renderStats();
      renderList();
    } catch (e) {
      if (e.name === "AbortError") return; // superseded by a newer request
      pageItems = [];
      pageMeta = { total: 0, maxPrice: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 0 };
      showToast("İlanlar yüklenemedi");
      renderStats();
      renderList();
    } finally {
      if (inflight === ctrl) inflight = null;
      showSkeleton(false);
    }
  }

  // Public re-fetch (used after CRUD)
  function loadProperties() {
    currentPage = 1;
    return applyFilters();
  }

  const debouncedFilter = debounce(() => { currentPage = 1; applyFilters(); }, 250);

  function renderStats() {
    const area = $("stats-area");
    if (!pageMeta.total) { area.innerHTML = ""; return; }
    const curr = $("currency-select").value;
    const label = lang === "tr" ? "Toplam" : "Total";
    const maxLabel = lang === "tr" ? "Max" : "Max";
    area.innerHTML = `<div class="stats-bar">📊 ${label}: ${pageMeta.total} | 💰 ${maxLabel}: ${fmtPrice(pageMeta.maxPrice, curr)}</div>`;
  }

  function renderList() {
    const container = $("property-list");
    const empty = $("empty-state");
    const pag = $("pagination-area");
    const curr = $("currency-select").value;
    const isAdmin = currentUser && currentUser.role === "admin";
    const favs = getFavorites();

    if (!pageItems.length) {
      container.innerHTML = "";
      pag.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";

    container.innerHTML = pageItems.map((h) => {
      const isFav = favs.includes(h.id);
      const img = h.image || (h.images && h.images[0] && h.images[0].url) || PLACEHOLDER;
      const badge = h.status === "kiralik"
        ? `<span class="badge badge-rent">${lang === "tr" ? "Kiralık" : "Rent"}</span>`
        : `<span class="badge badge-sale">${lang === "tr" ? "Satılık" : "Sale"}</span>`;
      const adminBtns = isAdmin ? `
        <div class="admin-btns">
          <button data-action="edit" data-id="${h.id}" class="btn-edit">✏️</button>
          <button data-action="delete" data-id="${h.id}" class="btn-delete">🗑️</button>
        </div>` : "";
      const meta = [
        h.bedrooms ? `🛏 ${esc(h.bedrooms)}` : "",
        h.bathrooms ? `🚿 ${esc(h.bathrooms)}` : "",
        h.area_m2 ? `📐 ${esc(h.area_m2)}m²` : "",
      ].filter(Boolean).join(" · ");
      return `
        <div class="card">
          <div class="fav-btn ${isFav ? "active" : ""}" data-action="toggle-fav" data-id="${h.id}">${isFav ? "❤️" : "🤍"}</div>
          ${badge}
          <img src="${esc(img)}" loading="lazy" data-action="open-detail" data-id="${h.id}" data-fallback="${PLACEHOLDER}" alt="${esc(h.title)}" />
          <div class="card-content" data-action="open-detail" data-id="${h.id}">
            <h3>${esc(h.title)}</h3>
            <div class="price-tag">${fmtPrice(h.price, curr)}</div>
            <p>📍 ${esc(h.location)} · 🏠 ${esc(h.type)}</p>
            ${meta ? `<p class="card-meta">${meta}</p>` : ""}
          </div>
          ${adminBtns}
        </div>`;
    }).join("");

    renderPagination();
    observeCards();
  }

  function renderPagination() {
    const pag = $("pagination-area");
    const totalPages = pageMeta.totalPages;
    if (totalPages <= 1) { pag.innerHTML = ""; return; }
    let html = "";
    const prevDisabled = currentPage === 1 ? "disabled" : "";
    const nextDisabled = currentPage === totalPages ? "disabled" : "";
    html += `<button ${prevDisabled} data-action="goto-page" data-page="${currentPage - 1}">‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
        html += `<button class="${i === currentPage ? "active" : ""}" data-action="goto-page" data-page="${i}">${i}</button>`;
      } else if (i === currentPage - 2 || i === currentPage + 2) {
        html += `<span>…</span>`;
      }
    }
    html += `<button ${nextDisabled} data-action="goto-page" data-page="${currentPage + 1}">›</button>`;
    pag.innerHTML = html;
  }
  function gotoPage(n) {
    currentPage = n;
    applyFilters();
    $("filter-bar").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- Detail modal ----------
  async function findProperty(id) {
    const local = pageItems.find((x) => x.id === id);
    if (local) return local;
    try {
      const res = await fetch(`/api/properties/${id}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (_) { return null; }
  }

  async function openDetail(id) {
    const h = await findProperty(id);
    if (!h) return;
    const curr = $("currency-select").value;
    const phone = "905551234567";
    const wa = `https://wa.me/${phone}?text=${encodeURIComponent(`Merhaba, "${h.title}" ilanıyla ilgileniyorum.`)}`;
    const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.location)}`;
    const mainImg = h.image || (h.images && h.images[0] && h.images[0].url) || PLACEHOLDER_LG;
    const gallery = (h.images || []).slice(0, 8).map((img) =>
      `<img src="${esc(img.url)}" alt="" data-action="swap-detail-img" />`
    ).join("");

    $("modal-body").innerHTML = `
      <img id="main-detail-img" src="${esc(mainImg)}" alt="${esc(h.title)}" data-fallback="${PLACEHOLDER_LG}" />
      ${gallery ? `<div class="gallery-thumbs">${gallery}</div>` : ""}
      <h2 style="margin-top:16px">${esc(h.title)}</h2>
      <div class="detail-price-row">
        <span class="detail-price">${fmtPrice(h.price, curr)}</span>
        <span class="detail-loc">📍 ${esc(h.location)}</span>
      </div>
      <div class="detail-grid">
        ${h.bedrooms ? `<div><strong>🛏</strong> ${esc(h.bedrooms)} ${lang === "tr" ? "Oda" : "Bed"}</div>` : ""}
        ${h.bathrooms ? `<div><strong>🚿</strong> ${esc(h.bathrooms)} ${lang === "tr" ? "Banyo" : "Bath"}</div>` : ""}
        ${h.area_m2 ? `<div><strong>📐</strong> ${esc(h.area_m2)} m²</div>` : ""}
        ${h.floor_no ? `<div><strong>🏢</strong> ${lang === "tr" ? "Kat" : "Floor"} ${esc(h.floor_no)}</div>` : ""}
        ${h.year_built ? `<div><strong>📅</strong> ${esc(h.year_built)}</div>` : ""}
        <div><strong>🏠</strong> ${esc(h.type)}</div>
      </div>
      ${h.description ? `<p class="detail-desc">${esc(h.description)}</p>` : ""}
      <a href="${wa}" target="_blank" rel="noopener" class="btn btn-whatsapp">💬 WhatsApp</a>
      <a href="${map}" target="_blank" rel="noopener" class="btn btn-map">🗺️ ${lang === "tr" ? "Haritada Gör" : "View on Map"}</a>
      <a href="tel:+${phone}" class="btn btn-call">📞 ${lang === "tr" ? "Ara" : "Call"}</a>
      <div class="inquiry-form">
        <h3>${lang === "tr" ? "Bilgi Al" : "Get Info"}</h3>
        <input id="inq-name" placeholder="${lang === "tr" ? "Adınız" : "Your name"}" />
        <input id="inq-phone" placeholder="${lang === "tr" ? "Telefon" : "Phone"}" />
        <input id="inq-email" placeholder="Email (${lang === "tr" ? "opsiyonel" : "optional"})" />
        <textarea id="inq-msg" placeholder="${lang === "tr" ? "Mesajınız" : "Message"}" rows="3"></textarea>
        <button data-action="send-inquiry" data-id="${h.id}" class="btn btn-call" style="width:100%">${lang === "tr" ? "Gönder" : "Send"}</button>
      </div>`;
    $("detail-modal").style.display = "block";
  }
  const closeModal = () => { $("detail-modal").style.display = "none"; };

  async function sendInquiry(propId) {
    const name = $("inq-name").value.trim();
    const phone = $("inq-phone").value.trim();
    const email = $("inq-email").value.trim();
    const message = $("inq-msg").value.trim();
    if (!name || !phone) return showToast(lang === "tr" ? "Ad ve telefon gerekli" : "Name and phone required");
    try {
      const res = await fetch(`/api/properties/${propId}/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, message }),
      });
      const data = await res.json();
      showToast(data.message || "OK");
      if (res.ok) closeModal();
    } catch (e) { showToast("Bağlantı hatası"); }
  }

  // ---------- Admin: CRUD ----------
  async function submitForm() {
    if (!currentUser || currentUser.role !== "admin") return showToast("Önce giriş yapın");
    const house = {
      title: $("title").value.trim(),
      price: Number($("price").value),
      location: $("locationInput").value.trim(),
      type: $("type").value,
      status: $("status").value,
      image: $("image").value,
      bedrooms: $("bedrooms").value ? Number($("bedrooms").value) : null,
      bathrooms: $("bathrooms").value ? Number($("bathrooms").value) : null,
      area_m2: $("area_m2").value ? Number($("area_m2").value) : null,
      floor_no: $("floor_no").value || null,
      year_built: $("year_built").value ? Number($("year_built").value) : null,
      description: $("description").value.trim() || null,
    };
    if (!house.title || !house.location || !house.price) {
      return showToast("Başlık, konum ve fiyat gerekli");
    }
    const method = editingId ? "PUT" : "POST";
    const url = editingId ? `/api/properties/${editingId}` : "/api/properties";
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(house),
      });
      const data = await res.json();
      showToast(data.message || "OK");
      if (res.ok) { resetForm(); loadProperties(); }
    } catch (e) { showToast("Bağlantı hatası"); }
  }

  async function startEdit(id) {
    const h = await findProperty(id);
    if (!h) return;
    $("title").value = h.title || "";
    $("price").value = h.price || "";
    $("locationInput").value = h.location || "";
    $("type").value = h.type || "Daire";
    $("status").value = h.status || "satilik";
    $("image").value = h.image || "";
    $("bedrooms").value = h.bedrooms || "";
    $("bathrooms").value = h.bathrooms || "";
    $("area_m2").value = h.area_m2 || "";
    $("floor_no").value = h.floor_no || "";
    $("year_built").value = h.year_built || "";
    $("description").value = h.description || "";
    if (h.image) {
      $("preview-img").src = h.image;
      $("upload-placeholder").style.display = "none";
      $("upload-preview").style.display = "block";
    }
    editingId = id;
    $("form-title").textContent = lang === "tr" ? "İlanı Güncelle" : "Update Listing";
    $("admin-form").style.display = "block";
    $("admin-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForm() {
    ["title", "price", "locationInput", "image", "bedrooms", "bathrooms", "area_m2", "floor_no", "year_built", "description", "url-input"]
      .forEach((id) => { const el = $(id); if (el) el.value = ""; });
    editingId = null;
    $("form-title").textContent = tt("add_listing");
    $("upload-placeholder").style.display = "block";
    $("upload-preview").style.display = "none";
    $("file-input").value = "";
  }

  function confirmDelete(id) {
    showConfirm(
      lang === "tr" ? "Bu ilan silinsin mi?" : "Delete this listing?",
      async () => {
        try {
          const res = await fetch(`/api/properties/${id}`, {
            method: "DELETE",
          });
          const data = await res.json();
          showToast(data.message || "OK");
          if (res.ok) loadProperties();
        } catch (e) { showToast("Bağlantı hatası"); }
      }
    );
  }

  // ---------- File upload ----------
  function toggleUrlInput() {
    const el = $("url-input");
    el.style.display = el.style.display === "none" ? "block" : "none";
  }

  async function handleFileSelect(file) {
    if (!file || !currentUser || currentUser.role !== "admin") return;
    if (file.size > 5 * 1024 * 1024) return showToast("Maksimum 5MB");
    const fd = new FormData();
    fd.append("image", file);
    try {
      $("upload-placeholder").innerHTML = `<div style="font-size:14px;color:var(--text-light)">${lang === "tr" ? "Yükleniyor..." : "Uploading..."}</div>`;
      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      $("image").value = data.url;
      $("preview-img").src = data.url;
      $("upload-placeholder").style.display = "none";
      $("upload-preview").style.display = "block";
    } catch (e) {
      showToast(e.message || "Yükleme başarısız");
      $("upload-placeholder").innerHTML = `<div style="font-size:36px;margin-bottom:8px">📁</div><div style="font-weight:600">${lang === "tr" ? "Tekrar deneyin" : "Try again"}</div>`;
    }
  }

  function setupDragDrop() {
    const zone = $("upload-zone");
    if (!zone) return;
    ["dragenter", "dragover"].forEach((ev) =>
      zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("dragover"); })
    );
    ["dragleave", "drop"].forEach((ev) =>
      zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("dragover"); })
    );
    zone.addEventListener("drop", (e) => {
      const f = e.dataTransfer.files[0];
      if (f) handleFileSelect(f);
    });
  }

  // ---------- Toast + custom confirm ----------
  function showToast(msg) {
    let el = $("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove("show"), 2800);
  }

  function showConfirm(msg, onYes) {
    const overlay = $("confirm-dialog");
    overlay.innerHTML = `
      <div class="confirm-box">
        <p>${esc(msg)}</p>
        <div class="confirm-btns">
          <button data-action="close-confirm" class="btn btn-outline">${lang === "tr" ? "Vazgeç" : "Cancel"}</button>
          <button data-action="confirm-yes" class="btn btn-danger">${lang === "tr" ? "Sil" : "Delete"}</button>
        </div>
      </div>`;
    overlay.style.display = "flex";
    overlay._onYes = onYes;
  }

  // ---------- Header scroll + back-to-top ----------
  function setupScroll() {
    const header = $("main-header");
    const top = $("back-to-top");
    window.addEventListener("scroll", () => {
      const y = window.scrollY;
      if (header) header.classList.toggle("scrolled", y > 10);
      if (top) top.classList.toggle("visible", y > 400);
    }, { passive: true });
  }

  // ---------- Modal dismiss + Escape ----------
  function setupModalDismiss() {
    ["detail-modal", "auth-modal"].forEach((id) => {
      const m = $(id);
      if (!m) return;
      m.addEventListener("click", (e) => { if (e.target === m) m.style.display = "none"; });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        ["detail-modal", "auth-modal", "confirm-dialog"].forEach((id) => {
          const m = $(id); if (m) m.style.display = "none";
        });
      }
    });
  }

  // ---------- Image fallback (replaces inline onerror) ----------
  function setupImageFallback() {
    document.addEventListener("error", (e) => {
      const el = e.target;
      if (el && el.tagName === "IMG" && el.dataset.fallback && el.src !== el.dataset.fallback) {
        el.src = el.dataset.fallback;
      }
    }, true);
  }

  // ---------- Scroll-reveal for property cards ----------
  // One observer, reused for every card pageItems renders. Adds .in-view when
  // the card enters the viewport — CSS handles the actual animation.
  let cardObserver = null;
  function setupCardObserver() {
    if (!("IntersectionObserver" in window)) return;
    cardObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          cardObserver.unobserve(entry.target);
        }
      }
    }, { rootMargin: "0px 0px -40px 0px", threshold: 0.05 });
  }
  function observeCards() {
    if (!cardObserver) {
      // Fallback: just reveal them all.
      document.querySelectorAll("#property-list .card").forEach((c) => c.classList.add("in-view"));
      return;
    }
    document.querySelectorAll("#property-list .card:not(.in-view)").forEach((c, i) => {
      // Stagger initial reveal slightly so the page feels alive.
      c.style.transitionDelay = `${Math.min(i, 6) * 60}ms`;
      cardObserver.observe(c);
    });
  }

  // ---------- "/" keyboard shortcut: focus the search box ----------
  function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (e.key !== "/") return;
      const t = e.target;
      // Don't hijack when the user is already typing somewhere.
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      const hero = $("hero-search-input");
      if (hero) { hero.focus(); hero.select(); }
    });
  }

  // ---------- Scroll-reveal for [data-reveal] sections ----------
  function setupSectionReveal() {
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll("[data-reveal]").forEach((s) => s.classList.add("revealed"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          // Trigger counter animation when stats band enters view.
          if (entry.target.classList.contains("stats-band")) {
            entry.target.querySelectorAll(".stat-num").forEach(animateCounter);
          }
          io.unobserve(entry.target);
        }
      }
    }, { rootMargin: "0px 0px -80px 0px", threshold: 0.1 });
    document.querySelectorAll("[data-reveal]").forEach((s) => io.observe(s));
  }

  // ---------- Animated counter (counts 0 → target on scroll into view) ----------
  function animateCounter(el) {
    if (el.dataset.counted === "1") return;
    el.dataset.counted = "1";
    const target = Number(el.dataset.countTo) || 0;
    const suffix = el.dataset.suffix || "";
    const duration = 1400;
    const start = performance.now();
    function step(now) {
      const p = Math.min(1, (now - start) / duration);
      // ease-out-cubic
      const v = Math.round(target * (1 - Math.pow(1 - p, 3)));
      el.textContent = v.toLocaleString("tr-TR") + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ---------- Testimonials carousel ----------
  let testimonialIndex = 0;
  let testimonialTimer = null;
  function setupTestimonials() {
    const track = $("testimonial-track");
    const dots = $("testimonial-dots");
    if (!track || !dots) return;
    const cards = track.querySelectorAll(".testimonial-card");
    if (!cards.length) return;

    // How many cards fit per "page" (matches the CSS flex-basis).
    const perView = () => (window.innerWidth < 600 ? 1 : window.innerWidth < 960 ? 2 : 3);
    const pages = () => Math.max(1, cards.length - perView() + 1);

    function renderDots() {
      dots.innerHTML = "";
      const n = pages();
      for (let i = 0; i < n; i++) {
        const b = document.createElement("button");
        b.setAttribute("aria-label", "Slide " + (i + 1));
        if (i === testimonialIndex) b.classList.add("active");
        b.addEventListener("click", () => { gotoTestimonial(i); restartTimer(); });
        dots.appendChild(b);
      }
    }
    function gotoTestimonial(i) {
      const n = pages();
      testimonialIndex = ((i % n) + n) % n;
      const cardW = cards[0].getBoundingClientRect().width + 24; // gap
      track.style.transform = `translateX(-${testimonialIndex * cardW}px)`;
      dots.querySelectorAll("button").forEach((b, idx) => b.classList.toggle("active", idx === testimonialIndex));
    }
    function restartTimer() {
      clearInterval(testimonialTimer);
      testimonialTimer = setInterval(() => gotoTestimonial(testimonialIndex + 1), 5000);
    }

    renderDots();
    gotoTestimonial(0);
    restartTimer();

    // Pause auto-scroll on hover.
    track.addEventListener("mouseenter", () => clearInterval(testimonialTimer));
    track.addEventListener("mouseleave", restartTimer);

    // Reflow on resize.
    let resizeT;
    window.addEventListener("resize", () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => { renderDots(); gotoTestimonial(testimonialIndex); }, 150);
    });
  }

  // ---------- Quick-category filter (clicking 🏢/🏡/🏞️/🏬 in the categories grid) ----------
  function quickCategory(type) {
    const sel = $("type-filter");
    if (!sel) return;
    // Toggle: clicking the active type clears it.
    const currentActive = document.querySelector(".category-card.active");
    if (currentActive && currentActive.dataset.type === type) {
      sel.value = "";
      currentActive.classList.remove("active");
    } else {
      sel.value = type;
      document.querySelectorAll(".category-card").forEach((c) => {
        c.classList.toggle("active", c.dataset.type === type);
      });
    }
    currentPage = 1;
    applyFilters();
    $("filter-bar").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- Quick search from neighborhood cards ----------
  function quickSearch(q) {
    const hero = $("hero-search-input");
    const search = $("search-box");
    if (hero) hero.value = q;
    if (search) search.value = q;
    currentPage = 1;
    applyFilters();
    $("filter-bar").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- Newsletter — frontend-only (no backend endpoint yet) ----------
  function submitNewsletter(formEl) {
    const input = formEl.querySelector("#newsletter-email");
    const email = input ? input.value.trim() : "";
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return showToast(lang === "tr" ? "Geçerli bir email girin" : "Enter a valid email");
    }
    showToast(lang === "tr" ? "Teşekkürler! Bültenimize eklendiniz." : "Thanks! You're subscribed.");
    if (input) input.value = "";
  }

  // ---------- JSON-LD (injected to avoid an extra inline-script CSP exception) ----------
  // (kept as a static <script type="application/ld+json"> in HTML — hashed in CSP.)

  // ---------- Event delegation ----------
  function setupDelegation() {
    const actions = {
      "toggle-language": () => toggleLanguage(),
      "toggle-theme": () => toggleTheme(),
      "open-auth": () => openAuthModal(),
      "close-auth": () => closeAuthModal(),
      "toggle-auth-mode": () => toggleAuthMode(),
      "login": () => loginUser(),
      "register": () => registerUser(),
      "logout": () => logout(),
      "scroll-to-listings": () => scrollToListings(),
      "toggle-fav-filter": () => toggleFavFilter(),
      "toggle-fav": (el, e) => toggleFavorite(Number(el.dataset.id), e),
      "open-detail": (el) => openDetail(Number(el.dataset.id)),
      "close-modal": () => closeModal(),
      "send-inquiry": (el) => sendInquiry(Number(el.dataset.id)),
      "edit": (el) => startEdit(Number(el.dataset.id)),
      "delete": (el) => confirmDelete(Number(el.dataset.id)),
      "submit-form": () => submitForm(),
      "reset-form": () => resetForm(),
      "upload-zone-click": () => $("file-input").click(),
      "toggle-url-input": () => toggleUrlInput(),
      "swap-detail-img": (el) => { const m = $("main-detail-img"); if (m) m.src = el.src; },
      "goto-page": (el) => gotoPage(Number(el.dataset.page)),
      "scroll-top": () => window.scrollTo({ top: 0, behavior: "smooth" }),
      "close-confirm": () => { $("confirm-dialog").style.display = "none"; },
      "confirm-yes": () => {
        const overlay = $("confirm-dialog");
        const fn = overlay._onYes;
        overlay.style.display = "none";
        if (typeof fn === "function") fn();
      },
      "quick-category": (el) => quickCategory(el.dataset.type),
      "quick-search": (el) => quickSearch(el.dataset.q),
    };

    document.body.addEventListener("click", (e) => {
      const target = e.target.closest("[data-action]");
      if (!target) return;
      const action = target.dataset.action;
      const fn = actions[action];
      if (fn) fn(target, e);
    });

    document.body.addEventListener("change", (e) => {
      const target = e.target.closest("[data-action]");
      if (!target) return;
      const a = target.dataset.action;
      if (a === "filter-change") applyFilters();
      else if (a === "file-input-change") handleFileSelect(target.files && target.files[0]);
    });

    document.body.addEventListener("input", (e) => {
      const target = e.target.closest("[data-action]");
      if (!target) return;
      const a = target.dataset.action;
      if (a === "filter-input") debouncedFilter();
      else if (a === "hero-search-input") syncSearch(target.value);
      else if (a === "url-input-change") $("image").value = target.value;
    });

    document.body.addEventListener("submit", (e) => {
      const target = e.target.closest("[data-action]");
      if (!target) return;
      const a = target.dataset.action;
      if (a === "newsletter-submit") {
        e.preventDefault();
        submitNewsletter(target);
      }
    });
  }

  // ---------- Init ----------
  document.addEventListener("DOMContentLoaded", async () => {
    applyTheme();
    applyLanguage();
    setupDelegation();
    setupDragDrop();
    setupScroll();
    setupModalDismiss();
    setupImageFallback();
    setupCardObserver();
    setupKeyboardShortcuts();
    setupSectionReveal();
    setupTestimonials();
    await bootSession();
    updateUserArea();
    loadProperties();
    fetchRates();
  });
})();
