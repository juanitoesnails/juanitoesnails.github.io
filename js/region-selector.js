/**
 * Avansera Region/Language Selector
 * 
 * JPMorgan-style dropdown with geo-detection via Cloudflare Worker.
 * Auto-detects region but never overrides explicit user choice.
 * 
 * Architecture:
 * - Non-blocking: renders placeholder immediately, hydrates async
 * - Geo-detection via /api/geo (Cloudflare Worker) — silent failure to default
 * - Explicit choice stored in localStorage, always takes precedence
 * 
 * Regions: Latin America, US, Europe, Africa, Other
 * Languages: Spanish + English for Latin America & Europe, English only for rest
 */

(function() {
  'use strict';

  // Region definitions
  const REGIONS = {
    'latin-america': {
      label: { en: 'Latin America', es: 'Latinoamérica' },
      continents: ['SA'],
      languages: ['es', 'en']
    },
    us: {
      label: { en: 'North America', es: 'EE.UU.' },
      continents: ['NA'],
      languages: ['en']
    },
    europe: {
      label: { en: 'Europe', es: 'Europa' },
      continents: ['EU'],
      languages: ['es', 'en']
    },
    africa: {
      label: { en: 'Africa', es: 'África' },
      continents: ['AF'],
      languages: ['en']
    },
    other: {
      label: { en: 'Other', es: 'Otro' },
      continents: [],  // catch-all for AS, OC, AN, null
      languages: ['en']
    }
  };

  const DEFAULT_REGION = 'other';
  const LANG_LABELS = {
    en: 'English',
    es: 'Español'
  };

  // Default language per region (picked when no user choice exists)
  const REGION_DEFAULT_LANG = {
    'latin-america': 'es',
    us: 'en',
    europe: 'es',
    africa: 'en',
    other: 'en'
  };

  // Current page path map for language switching
  const PAGE_MAP = {
    '/': { en: '/', es: '/es/' },
    '/about.html': { en: '/about.html', es: '/es/nosotros.html' },
    '/services.html': { en: '/services.html', es: '/es/servicios.html' },
    '/contact.html': { en: '/contact.html', es: '/es/contacto.html' },
    '/faq.html': { en: '/faq.html', es: '/es/preguntas_frecuentes.html' },
    '/articles.html': { en: '/articles.html', es: '/es/articulos.html' },
    '/privacy.html': { en: '/privacy.html', es: '/es/privacidad.html' },
    '/terms.html': { en: '/terms.html', es: '/es/terminos.html' },
    '/404.html': { en: '/404.html', es: '/es/404.html' },
    '/services/business-owners.html': { en: '/services/business-owners.html', es: '/es/services/emprendedores.html' },
    '/services/companies.html': { en: '/services/companies.html', es: '/es/services/corporativos.html' },
    '/services/nonprofits.html': { en: '/services/nonprofits.html', es: '/es/services/ngo.html' },
    '/es/': { en: '/', es: '/es/' },
    '/es/nosotros.html': { en: '/about.html', es: '/es/nosotros.html' },
    '/es/servicios.html': { en: '/services.html', es: '/es/servicios.html' },
    '/es/contacto.html': { en: '/contact.html', es: '/es/contacto.html' },
    '/es/preguntas_frecuentes.html': { en: '/faq.html', es: '/es/preguntas_frecuentes.html' },
    '/es/articulos.html': { en: '/articles.html', es: '/es/articulos.html' },
    '/es/privacidad.html': { en: '/privacy.html', es: '/es/privacidad.html' },
    '/es/terminos.html': { en: '/terms.html', es: '/es/terminos.html' },
    '/es/404.html': { en: '/404.html', es: '/es/404.html' },
    '/es/services/emprendedores.html': { en: '/services/business-owners.html', es: '/es/services/emprendedores.html' },
    '/es/services/corporativos.html': { en: '/services/companies.html', es: '/es/services/corporativos.html' },
    '/es/services/ngo.html': { en: '/services/nonprofits.html', es: '/es/services/ngo.html' },
    '/insights/financial-literacy-employee-happiness.html': { en: '/insights/financial-literacy-employee-happiness.html', es: '/es/insights/financial-literacy-employee-happiness.html' },
    '/insights/geographic-arbitrage-handle-income-different-currency.html': { en: '/insights/geographic-arbitrage-handle-income-different-currency.html', es: '/es/insights/geographic-arbitrage-handle-income-different-currency.html' },
    '/insights/marginalised-communities-financial-literacy.html': { en: '/insights/marginalised-communities-financial-literacy.html', es: '/es/insights/marginalised-communities-financial-literacy.html' },
    '/insights/why-benefits-package-retention-tool.html': { en: '/insights/why-benefits-package-retention-tool.html', es: '/es/insights/why-benefits-package-retention-tool.html' },
    '/insights/why-every-business-owner-needs-balance-sheet.html': { en: '/insights/why-every-business-owner-needs-balance-sheet.html', es: '/es/insights/why-every-business-owner-needs-balance-sheet.html' },
  };

  // Detect current page language from path
  function getCurrentLang() {
    return window.location.pathname.startsWith('/es/') ? 'es' : 'en';
  }

  // Get current page path (normalised)
  // NOTE: PAGE_MAP is keyed by the *actual* pathname of each language
  // variant (e.g. both '/about.html' and '/es/nosotros.html' are keys
  // pointing at the same entry) — so the '/es' prefix must be preserved,
  // not stripped, or Spanish paths will never match a key and resolvePage()
  // will silently fall through to its default (which sends English targets
  // to '/').
  function getCurrentPath() {
    const path = window.location.pathname;
    if (path === '/' || path === '') return '/';
    if (path === '/es' || path === '/es/') return '/es/';
    return path.replace(/\/$/, '');
  }

  // Resolve a language switch target URL
  function resolvePage(targetLang) {
    const path = getCurrentPath();
    const map = PAGE_MAP[path];
    if (map && map[targetLang]) {
      return map[targetLang];
    }
    return targetLang === 'es' ? '/es/' : '/';
  }

  // Get stored region choice
  function getStoredChoice() {
    try {
      const stored = localStorage.getItem('avansera_region');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.region && parsed.lang) {
          return parsed;
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  // Save explicit choice
  function saveChoice(region, lang) {
    try {
      localStorage.setItem('avansera_region', JSON.stringify({
        region: region,
        lang: lang,
        timestamp: Date.now()
      }));
    } catch (e) {
      // ignore (private browsing, etc.)
    }
  }

  // Map a continent code to a region (shared by geo fetch + cache read)
  function regionFromContinent(continent) {
    for (const [key, def] of Object.entries(REGIONS)) {
      if (def.continents.length > 0 && def.continents.includes(continent)) {
        return key;
      }
    }
    return DEFAULT_REGION;
  }

  // Detect region via Cloudflare Worker, or fallback
  // Result is cached in sessionStorage so the /api/geo round-trip
  // happens at most once per browser session, not on every navigation.
  async function detectRegion() {
    // Check explicit choice first
    const stored = getStoredChoice();
    if (stored) {
      return { region: stored.region, lang: stored.lang, source: 'stored' };
    }

    // Reuse a previous geo result within this session
    try {
      const cached = sessionStorage.getItem('avansera_geo');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.region && parsed.lang) {
          return { region: parsed.region, lang: parsed.lang, source: 'geo' };
        }
      }
    } catch (e) {
      // ignore
    }

    // Try geo-detection
    try {
      const res = await fetch('/api/geo', { cache: 'no-store' });
      if (!res.ok) throw new Error('Geo lookup failed');
      const data = await res.json();
      const continent = data.continent || null;

      const detectedRegion = regionFromContinent(continent);
      const detectedLang = REGION_DEFAULT_LANG[detectedRegion] || 'en';

      // Cache for the rest of this session
      try {
        sessionStorage.setItem('avansera_geo', JSON.stringify({
          region: detectedRegion,
          lang: detectedLang,
          timestamp: Date.now()
        }));
      } catch (e) {
        // ignore
      }

      return { region: detectedRegion, lang: detectedLang, source: 'geo' };
    } catch (err) {
      return { region: DEFAULT_REGION, lang: 'en', source: 'fallback' };
    }
  }

  // Build and render the dropdown
  function renderSelector(state) {
    const container = document.getElementById('region-selector');
    if (!container) return;

    const containerMobile = document.getElementById('region-selector-mobile');
    if (!containerMobile && !container) return;

    const currentLang = getCurrentLang();
    const regionDef = REGIONS[state.region] || REGIONS[DEFAULT_REGION];
    const regionLabel = regionDef.label[currentLang] || regionDef.label.en;
    const langLabel = LANG_LABELS[currentLang];

    const html = `
      <div class="region-selector-wrapper">
        <button class="region-trigger" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Select region and language">
          ${regionLabel} (${langLabel})
        </button>
        <div class="region-dropdown" role="menu" aria-label="Region and language options">
          ${Object.entries(REGIONS).map(([key, def]) => {
            const rLabel = def.label[currentLang] || def.label.en;
            const languages = def.languages.map(lang => {
              const isActive = lang === currentLang && key === state.region;
              const pageUrl = resolvePage(lang);
              return `<button type="button" class="region-option${isActive ? ' active' : ''}" role="menuitem" data-region="${key}" data-lang="${lang}" data-url="${pageUrl}" ${isActive ? 'aria-current="true"' : ''}>${LANG_LABELS[lang]}${isActive ? ' ✓' : ''}</button>`;
            }).join('');
            return `<div class="region-group"><div class="region-group-label">${rLabel}</div>${languages}</div>`;
          }).join('')}
        </div>
      </div>
    `;

    if (container) container.innerHTML = html;
    if (containerMobile) containerMobile.innerHTML = html;

    // Event listeners — use the last rendered trigger/dropdown
    const triggers = document.querySelectorAll('.region-trigger');
    const dropdowns = document.querySelectorAll('.region-dropdown');

    // Toggle dropdowns
    triggers.forEach((trigger) => {
      const dropdown = trigger.nextElementSibling;
      trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        const isOpen = this.getAttribute('aria-expanded') === 'true';
        // Close all other dropdowns
        triggers.forEach(t => t.setAttribute('aria-expanded', 'false'));
        dropdowns.forEach(d => d.classList.remove('open'));
        // Toggle this one
        this.setAttribute('aria-expanded', !isOpen);
        dropdown.classList.toggle('open', !isOpen);
      });
    });

    // Close on outside click
    document.addEventListener('click', function closeDropdown(e) {
      document.querySelectorAll('.region-selector-wrapper').forEach(wrapper => {
        if (!wrapper.contains(e.target)) {
          const trigger = wrapper.querySelector('.region-trigger');
          const dropdown = wrapper.querySelector('.region-dropdown');
          if (trigger) trigger.setAttribute('aria-expanded', 'false');
          if (dropdown) dropdown.classList.remove('open');
        }
      });
    });

    // Keyboard handling
    triggers.forEach(trigger => {
      const dropdown = trigger.nextElementSibling;
      trigger.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.click();
        }
        if (e.key === 'Escape') {
          this.setAttribute('aria-expanded', 'false');
          dropdown.classList.remove('open');
          this.focus();
        }
      });
    });

    // Option selection
    document.querySelectorAll('.region-option').forEach(opt => {
      opt.addEventListener('click', function() {
        const region = this.dataset.region;
        const lang = this.dataset.lang;
        const url = this.dataset.url;
        
        // Save explicit choice
        saveChoice(region, lang);
        
        // Navigate to page
        if (url) {
          window.location.href = url;
        }
      });

      // Keyboard support for options
      opt.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.click();
        }
        const parentTrigger = this.closest('.region-selector-wrapper')?.querySelector('.region-trigger');
        if (e.key === 'Escape' && parentTrigger) {
          const parentDropdown = this.closest('.region-dropdown');
          parentTrigger.setAttribute('aria-expanded', 'false');
          if (parentDropdown) parentDropdown.classList.remove('open');
          parentTrigger.focus();
        }
      });
    });

    // Close on escape from anywhere in dropdowns
    dropdowns.forEach(dropdown => {
      dropdown.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          const trigger = this.closest('.region-selector-wrapper')?.querySelector('.region-trigger');
          if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
            this.classList.remove('open');
            trigger.focus();
          }
        }
      });
    });
  }

  // Initialise
  async function init() {
    const container = document.getElementById('region-selector');
    if (!container) return;

    const state = await detectRegion();
    renderSelector(state);
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();