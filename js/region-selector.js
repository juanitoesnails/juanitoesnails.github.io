/**
 * Avansera Region/Language Selector
 *
 * Dropdown with client-side region/language detection.
 * Auto-detects region but never overrides explicit user choice.
 *
 * Architecture:
 * - Region detected from the browser's IANA timezone (Intl API)
 * - Language detected from navigator.language / navigator.languages
 * - Explicit choice stored in localStorage, always takes precedence
 *
 * Regions: Latin America, North America, Europe, Africa, Other
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
    'north-america': {
      label: { en: 'North America', es: 'Norteamérica' },
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
    'north-america': 'en',
    europe: 'en',
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

  // Legacy region keys (pre-North-America rename) → current keys
  const LEGACY_REGION_KEYS = {
    us: 'north-america'
  };

  // Get stored region choice
  function getStoredChoice() {
    try {
      const stored = localStorage.getItem('avansera_region');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.region && parsed.lang) {
          // Migrate legacy region keys (e.g. "us" → "north-america")
          if (LEGACY_REGION_KEYS[parsed.region]) {
            parsed.region = LEGACY_REGION_KEYS[parsed.region];
            saveChoice(parsed.region, parsed.lang);
          }
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

  // Timezones in the US / Canada (everything else in the Americas is
  // treated as Latin America).
  const NA_TIMEZONES = new Set([
    // United States
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Phoenix', 'America/Anchorage', 'America/Juneau', 'America/Sitka',
    'America/Yakutat', 'America/Metlakatla', 'America/Nome', 'America/Adak',
    'Pacific/Honolulu', 'America/Detroit', 'America/Boise', 'America/Menominee',
    'America/Indiana/Indianapolis', 'America/Indiana/Vincennes', 'America/Indiana/Winamac',
    'America/Indiana/Marengo', 'America/Indiana/Petersburg', 'America/Indiana/Vevay',
    'America/Indiana/Tell_City', 'America/Indiana/Knox',
    'America/Kentucky/Louisville', 'America/Kentucky/Monticello',
    'America/North_Dakota/Center', 'America/North_Dakota/New_Salem', 'America/North_Dakota/Beulah',
    // US territories
    'Pacific/Guam', 'Pacific/Saipan', 'Pacific/Pago_Pago',
    'America/Puerto_Rico', 'America/St_Thomas', 'America/St_Croix',
    // Canada
    'America/Toronto', 'America/Winnipeg', 'America/Regina', 'America/Swift_Current',
    'America/Edmonton', 'America/Vancouver', 'America/Whitehorse', 'America/Yellowknife',
    'America/Inuvik', 'America/Cambridge_Bay', 'America/Iqaluit', 'America/Pangnirtung',
    'America/Halifax', 'America/Glace_Bay', 'America/Moncton', 'America/St_Johns',
    'America/Goose_Bay', 'America/Blanc-Sablon'
  ]);

  // Get the browser's IANA timezone (e.g. "Europe/Amsterdam")
  function getTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch (e) {
      return null;
    }
  }

  // Is this timezone in the US / Canada? (Otherwise it's Latin America.)
  function isNorthAmerica(tz) {
    if (tz === 'Pacific/Honolulu') return true;
    if (
      tz.startsWith('America/Indiana/') ||
      tz.startsWith('America/Kentucky/') ||
      tz.startsWith('America/North_Dakota/')
    ) return true;
    return NA_TIMEZONES.has(tz);
  }

  // Map a timezone to a region
  function regionFromTimezone(tz) {
    if (!tz) return DEFAULT_REGION;
    // UTC is used by UK/IE browsers in some privacy modes
    if (tz === 'UTC' || tz === 'Etc/UTC' || tz === 'Etc/GMT' ||
        tz === 'Etc/GMT+0' || tz === 'Etc/GMT-0' || tz === 'Etc/GMT0') {
      return 'europe';
    }
    if (tz.startsWith('Europe/')) return 'europe';
    if (tz.startsWith('Africa/')) return 'africa';
    if (tz === 'Pacific/Honolulu') return 'north-america';
    if (tz.startsWith('America/')) return isNorthAmerica(tz) ? 'north-america' : 'latin-america';
    // Asia, Australia, Pacific (except Honolulu), Indian, Atlantic, Antarctica → other
    return DEFAULT_REGION;
  }

  // Get the browser's preferred language
  function getBrowserLang() {
    try {
      const langs = (navigator.languages && navigator.languages.length)
        ? navigator.languages
        : [navigator.language];
      for (const l of langs) {
        const code = String(l).toLowerCase();
        if (code.startsWith('es')) return 'es';
        if (code.startsWith('en')) return 'en';
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  // Pick the default language for a region: use the browser language
  // if the region offers it, otherwise the region's fallback default.
  function detectDefaultLang(region) {
    const browserLang = getBrowserLang();
    const regionDef = REGIONS[region];
    if (browserLang && regionDef && regionDef.languages.indexOf(browserLang) !== -1) {
      return browserLang;
    }
    return REGION_DEFAULT_LANG[region] || 'en';
  }

  // Detect region and language entirely client-side.
  // An explicit stored choice always takes precedence.
  function detectRegion() {
    const stored = getStoredChoice();
    if (stored) {
      return { region: stored.region, lang: stored.lang, source: 'stored' };
    }
    const region = regionFromTimezone(getTimezone());
    const lang = detectDefaultLang(region);
    return { region: region, lang: lang, source: 'detected' };
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
  function init() {
    const container = document.getElementById('region-selector');
    if (!container) return;

    const state = detectRegion();
    renderSelector(state);
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();