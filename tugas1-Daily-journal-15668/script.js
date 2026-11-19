/* ==========================================================================
   Daily Journal — Shared Interactive Scripts
   Works seamlessly via both HTTP server and local file:// protocol
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_THEME = 'dj_theme';
  const STORAGE_BOOKMARKS = 'dj_bookmarks';
  const STORAGE_NOTES = 'dj_custom_notes';

  /* ---------- Utilities ---------- */
  function safeStorageGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage quota or private-mode restrictions
    }
  }

  let toastTimer = null;
  function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 2600);
  }

  function formatIndonesianDate(isoDate) {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const parts = (isoDate || '').split('-').map(Number);
    const d = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date();
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function estimateReadTime(text) {
    const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
    const mins = Math.max(1, Math.ceil(words / 180));
    return `${mins} mnt baca`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------- 1. Theme Switcher ---------- */
  function initTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    if (!toggleBtn) return;

    function updateAria() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      toggleBtn.setAttribute('aria-label', isDark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap');
      toggleBtn.setAttribute('title', isDark ? 'Mode terang' : 'Mode gelap');
    }

    updateAria();

    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem(STORAGE_THEME, next);
      } catch {
        // Ignore
      }
      updateAria();
      showToast(next === 'dark' ? 'Mode gelap aktif' : 'Mode terang aktif');
    });
  }

  /* ---------- 2. Mobile Navigation ---------- */
  function initMobileMenu() {
    const menuBtn = document.getElementById('menu-toggle');
    const navList = document.getElementById('nav-links');
    if (!menuBtn || !navList) return;

    function closeMenu() {
      navList.classList.remove('is-open');
      menuBtn.setAttribute('aria-expanded', 'false');
    }

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = navList.classList.toggle('is-open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });

    document.addEventListener('click', (e) => {
      if (navList.classList.contains('is-open') && !navList.contains(e.target) && e.target !== menuBtn) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
  }

  /* ---------- 3. Back To Top & Reading Progress ---------- */
  function initScrollFeatures() {
    const backBtn = document.getElementById('back-to-top');
    const progressBar = document.getElementById('reading-progress');

    function onScroll() {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      if (backBtn) {
        backBtn.classList.toggle('is-visible', scrollY > 320);
      }
      if (progressBar) {
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const pct = docHeight > 0 ? Math.min(100, Math.max(0, (scrollY / docHeight) * 100)) : 0;
        progressBar.style.width = `${pct}%`;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  /* ---------- 4. Scroll Reveal ---------- */
  function initReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!els.length) return;

    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.01, rootMargin: '0px 0px 80px 0px' }
    );

    els.forEach((el) => observer.observe(el));
  }

  /* ---------- 5. Sync Dynamic Note Counter Across Pages ---------- */
  function syncTotalNoteCounters() {
    const customNotes = safeStorageGet(STORAGE_NOTES, []);
    const baseCount = 6;
    const total = baseCount + customNotes.length;
    document.querySelectorAll('[data-total-notes]').forEach((el) => {
      el.textContent = String(total);
    });
  }

  /* ---------- 6. Lightbox Viewer (Home & Gallery) ---------- */
  function initLightbox() {
    const triggers = Array.from(document.querySelectorAll('[data-lightbox]'));
    const modal = document.getElementById('lightbox-modal');
    if (!triggers.length || !modal) return;

    const imgEl = modal.querySelector('#lightbox-img');
    const titleEl = modal.querySelector('#lightbox-title');
    const descEl = modal.querySelector('#lightbox-desc');
    const catEl = modal.querySelector('#lightbox-category');
    const counterEl = modal.querySelector('#lightbox-counter');
    const prevBtn = modal.querySelector('#lightbox-prev');
    const nextBtn = modal.querySelector('#lightbox-next');
    const closeBtn = modal.querySelector('#lightbox-close');

    let visibleTriggers = triggers;
    let currentIndex = 0;
    let lastFocused = null;

    function getVisibleTriggers() {
      return triggers.filter((el) => !el.hidden && el.offsetParent !== null);
    }

    function renderSlide(index) {
      if (!visibleTriggers.length) return;
      currentIndex = (index + visibleTriggers.length) % visibleTriggers.length;
      const item = visibleTriggers[currentIndex];
      imgEl.src = item.getAttribute('data-src') || '';
      imgEl.alt = item.getAttribute('data-title') || 'Foto galeri';
      titleEl.textContent = item.getAttribute('data-title') || '';
      descEl.textContent = item.getAttribute('data-desc') || '';
      if (catEl) catEl.textContent = item.getAttribute('data-category') || 'Dokumentasi';
      if (counterEl) counterEl.textContent = `${currentIndex + 1} / ${visibleTriggers.length}`;
    }

    function openLightbox(trigger) {
      visibleTriggers = getVisibleTriggers();
      const idx = visibleTriggers.indexOf(trigger);
      lastFocused = document.activeElement;
      renderSlide(idx >= 0 ? idx : 0);
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      if (closeBtn) closeBtn.focus();
    }

    function closeLightbox() {
      if (lastFocused && typeof lastFocused.focus === 'function') {
        lastFocused.focus();
      } else if (document.activeElement && modal.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    triggers.forEach((trigger) => {
      trigger.addEventListener('click', () => openLightbox(trigger));
      trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openLightbox(trigger);
        }
      });
    });

    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    if (prevBtn) prevBtn.addEventListener('click', () => renderSlide(currentIndex - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => renderSlide(currentIndex + 1));

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
      if (!modal.classList.contains('is-open')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') renderSlide(currentIndex - 1);
      if (e.key === 'ArrowRight') renderSlide(currentIndex + 1);
    });
  }

  /* ---------- 7. Gallery Category Filter ---------- */
  function initGalleryFilter() {
    const pills = document.querySelectorAll('[data-gallery-filter]');
    const items = document.querySelectorAll('[data-gallery-item]');
    const countEl = document.getElementById('gallery-count');
    if (!pills.length || !items.length) return;

    function applyFilter(category) {
      let visible = 0;
      items.forEach((item) => {
        const match = category === 'semua' || item.getAttribute('data-gallery-item') === category;
        item.hidden = !match;
        if (match) visible += 1;
      });
      if (countEl) {
        countEl.textContent = `Menampilkan ${visible} dari ${items.length} foto`;
      }
    }

    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        pills.forEach((p) => p.classList.remove('is-active'));
        pill.classList.add('is-active');
        applyFilter(pill.getAttribute('data-gallery-filter'));
      });
    });

    applyFilter('semua');
  }

  /* ---------- 8. Article Page: Search, Filter, Bookmarks & Custom Notes ---------- */
  function initArticlePage() {
    const listContainer = document.getElementById('article-list');
    if (!listContainer) return;

    const searchInput = document.getElementById('article-search');
    const filterPills = document.querySelectorAll('[data-article-filter]');
    const resultsText = document.getElementById('article-results-text');
    const emptyState = document.getElementById('article-empty');
    const resetBtn = document.getElementById('reset-article-filter');

    const openModalBtn = document.getElementById('open-note-modal');
    const noteModal = document.getElementById('note-modal');
    const closeModalBtn = document.getElementById('close-note-modal');
    const cancelModalBtn = document.getElementById('cancel-note-modal');
    const noteForm = document.getElementById('note-form');

    let activeCategory = 'semua';
    let bookmarks = new Set(safeStorageGet(STORAGE_BOOKMARKS, []));
    let customNotes = safeStorageGet(STORAGE_NOTES, []);

    function saveBookmarks() {
      safeStorageSet(STORAGE_BOOKMARKS, Array.from(bookmarks));
    }

    function saveCustomNotes() {
      safeStorageSet(STORAGE_NOTES, customNotes);
      syncTotalNoteCounters();
    }

    function buildBookmarkButton(id) {
      const saved = bookmarks.has(id);
      return `
        <button type="button" class="bookmark-btn${saved ? ' is-saved' : ''}" data-bookmark="${escapeHtml(id)}" aria-pressed="${saved}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>${saved ? 'Tersimpan' : 'Simpan'}</span>
        </button>
      `;
    }

    function createCustomNoteElement(note, displayNumber) {
      const article = document.createElement('article');
      article.className = 'article-card';
      article.id = note.id;
      article.setAttribute('data-category', note.category);
      article.setAttribute('data-custom-note', 'true');

      const paragraphs = note.content
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join('');

      article.innerHTML = `
        <div class="article-meta">
          <span class="entry-num">#${String(displayNumber).padStart(2, '0')}</span>
          <time class="entry-date">${escapeHtml(note.formattedDate)}</time>
          <span class="tag">${escapeHtml(note.categoryLabel)}</span>
          <span class="tag tag-warm">Catatan Baru</span>
          <span class="entry-readtime">${escapeHtml(estimateReadTime(note.content))}</span>
        </div>
        <h2 class="article-title">${escapeHtml(note.title)}</h2>
        <div class="article-body">${paragraphs}</div>
        <div class="article-footer">
          <span class="meta-note">Disimpan di browser ini</span>
          <div class="article-actions">
            ${buildBookmarkButton(note.id)}
            <button type="button" class="delete-note-btn" data-delete-note="${escapeHtml(note.id)}" aria-label="Hapus catatan ini">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                <path d="M10 11v6"></path>
                <path d="M14 11v6"></path>
              </svg>
              <span>Hapus</span>
            </button>
          </div>
        </div>
      `;
      return article;
    }

    function renderCustomNotes() {
      listContainer.querySelectorAll('[data-custom-note="true"]').forEach((el) => el.remove());
      const baseCount = listContainer.querySelectorAll('.article-card:not([data-custom-note="true"])').length;
      customNotes.forEach((note, idx) => {
        const el = createCustomNoteElement(note, baseCount + customNotes.length - idx);
        listContainer.prepend(el);
      });
    }

    function syncBookmarkStates() {
      listContainer.querySelectorAll('[data-bookmark]').forEach((btn) => {
        const id = btn.getAttribute('data-bookmark');
        const saved = bookmarks.has(id);
        btn.classList.toggle('is-saved', saved);
        btn.setAttribute('aria-pressed', String(saved));
        const label = btn.querySelector('span');
        if (label) label.textContent = saved ? 'Tersimpan' : 'Simpan';
      });
    }

    function applyFilters() {
      const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
      const cards = Array.from(listContainer.querySelectorAll('.article-card'));
      let visibleCount = 0;

      cards.forEach((card) => {
        const cat = card.getAttribute('data-category') || '';
        const text = card.textContent.toLowerCase();
        const isSaved = bookmarks.has(card.id);

        const matchesCategory =
          activeCategory === 'semua' ||
          (activeCategory === 'tersimpan' ? isSaved : cat === activeCategory);
        const matchesQuery = !query || text.includes(query);

        const show = matchesCategory && matchesQuery;
        card.hidden = !show;
        if (show) visibleCount += 1;
      });

      if (resultsText) {
        resultsText.textContent = `Menampilkan ${visibleCount} dari ${cards.length} catatan`;
      }
      if (emptyState) {
        emptyState.hidden = visibleCount > 0;
      }
    }

    // Delegated click handlers for Bookmark & Delete
    listContainer.addEventListener('click', (e) => {
      const bmBtn = e.target.closest('[data-bookmark]');
      if (bmBtn) {
        const id = bmBtn.getAttribute('data-bookmark');
        if (bookmarks.has(id)) {
          bookmarks.delete(id);
          showToast('Catatan dihapus dari tersimpan');
        } else {
          bookmarks.add(id);
          showToast('Catatan disimpan ke daftar bacaan');
        }
        saveBookmarks();
        syncBookmarkStates();
        if (activeCategory === 'tersimpan') applyFilters();
        return;
      }

      const delBtn = e.target.closest('[data-delete-note]');
      if (delBtn) {
        const id = delBtn.getAttribute('data-delete-note');
        customNotes = customNotes.filter((n) => n.id !== id);
        bookmarks.delete(id);
        saveBookmarks();
        saveCustomNotes();
        renderCustomNotes();
        syncBookmarkStates();
        applyFilters();
        showToast('Catatan berhasil dihapus');
      }
    });

    if (searchInput) {
      searchInput.addEventListener('input', applyFilters);
    }

    filterPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        filterPills.forEach((p) => p.classList.remove('is-active'));
        pill.classList.add('is-active');
        activeCategory = pill.getAttribute('data-article-filter') || 'semua';
        applyFilters();
      });
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        activeCategory = 'semua';
        filterPills.forEach((p) => {
          p.classList.toggle('is-active', p.getAttribute('data-article-filter') === 'semua');
        });
        applyFilters();
      });
    }

    // Note Composer Modal
    if (openModalBtn && noteModal && noteForm) {
      const dateInput = document.getElementById('note-date');
      const titleInput = document.getElementById('note-title');
      const categorySelect = document.getElementById('note-category');
      const contentInput = document.getElementById('note-content');

      function setTodayDate() {
        if (!dateInput) return;
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
      }

      function openNoteModal() {
        setTodayDate();
        noteModal.classList.add('is-open');
        noteModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        if (titleInput) titleInput.focus();
      }

      function closeNoteModal() {
        if (document.activeElement && noteModal.contains(document.activeElement)) {
          openModalBtn.focus();
        }
        noteModal.classList.remove('is-open');
        noteModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }

      openModalBtn.addEventListener('click', openNoteModal);
      if (closeModalBtn) closeModalBtn.addEventListener('click', closeNoteModal);
      if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeNoteModal);

      noteModal.addEventListener('click', (e) => {
        if (e.target === noteModal) closeNoteModal();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && noteModal.classList.contains('is-open')) {
          closeNoteModal();
        }
      });

      noteForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = (titleInput.value || '').trim();
        const content = (contentInput.value || '').trim();
        const category = categorySelect.value;
        const categoryLabel = categorySelect.options[categorySelect.selectedIndex].text;
        const isoDate = dateInput.value;

        if (!title || !content) {
          showToast('Judul dan isi catatan wajib diisi');
          return;
        }

        const newNote = {
          id: `catatan-${Date.now()}`,
          title,
          content,
          category,
          categoryLabel,
          formattedDate: formatIndonesianDate(isoDate)
        };

        customNotes.unshift(newNote);
        saveCustomNotes();
        renderCustomNotes();
        syncBookmarkStates();

        // Reset filter to show the newly created note immediately
        if (searchInput) searchInput.value = '';
        activeCategory = 'semua';
        filterPills.forEach((p) => {
          p.classList.toggle('is-active', p.getAttribute('data-article-filter') === 'semua');
        });
        applyFilters();

        noteForm.reset();
        closeNoteModal();
        showToast('Catatan baru berhasil ditambahkan!');
      });
    }

    // Highlight targeted article anchor from Home page
    function highlightHashTarget() {
      const hash = window.location.hash;
      if (!hash) return;
      const target = document.getElementById(hash.slice(1));
      if (target && target.classList.contains('article-card')) {
        target.classList.add('is-highlighted');
        setTimeout(() => target.classList.remove('is-highlighted'), 2600);
      }
    }

    renderCustomNotes();
    syncBookmarkStates();
    applyFilters();
    highlightHashTarget();
    window.addEventListener('hashchange', highlightHashTarget);
  }

  /* ---------- Bootstrap ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileMenu();
    initScrollFeatures();
    initReveal();
    syncTotalNoteCounters();
    initLightbox();
    initGalleryFilter();
    initArticlePage();
  });
})();
