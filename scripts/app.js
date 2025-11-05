/**
 * scripts/app.js
 * Funcionalidad principal del sitio.
 * Implementa Intersection Observer para la animación 'fade-in' de los artículos.
 * + Ajustes para aside fijo, scroll con offset y offcanvas accesible.
 * + Opción para colapsar todos los <details> al cargar.
 * + Buscador que abre <details> y resalta coincidencias (3+ letras).
 * + Sincroniza --header-h con la altura real del header (evita que tape contenido).
 */

document.addEventListener('DOMContentLoaded', () => {
  // === Configuración rápida ===
  const COLLAPSE_ALL_ON_LOAD = true; // ← poner true para que todas las cards arranquen cerradas

  // Ajusta la variable CSS --header-h con el alto real del header
  setupHeaderHeightVar();

  // Inicializa animaciones de 'fade-in' al hacer scroll
  setupScrollAnimations();

  // Evita animaciones iniciales dentro de cualquier aside sticky
  markAsideAnimationsAsVisible();

  // Anclajes internos con scroll suave y compensación por header fijo
  setupSmoothAnchors();

  // Accesibilidad: foco al abrir el offcanvas
  setupOffcanvasFocus();

  // Colapsar <details> al iniciar (opcional)
  if (COLLAPSE_ALL_ON_LOAD) collapseAllDetailsOnLoad();

  // Buscador con resaltado y apertura de <details> con coincidencias
  setupSearch();
});

// Evita recargar la página al presionar Enter en el buscador
document.querySelector('.search').addEventListener('submit', e => e.preventDefault());

/* =========================================================
   Header fijo: altura dinámica
   - Mantiene --header-h en CSS igual a la altura real del <header>
   - Evita que el contenido quede tapado por el header y alinea offset de scroll
   ========================================================= */
function setupHeaderHeightVar() {
  const root = document.documentElement;
  const apply = () => {
    const header = document.querySelector('header');
    if (!header) return;
    const h = Math.ceil(header.getBoundingClientRect().height);
    root.style.setProperty('--header-h', `${h}px`);
  };

  // Aplicar al cargar y tras assets (por si cambian fuentes/íconos)
  apply();
  window.addEventListener('load', apply);

  // Recalcular en resize/orientation
  const onResize = debounce(apply, 100);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  // Recalcular si el header cambia dinámicamente
  const header = document.querySelector('header');
  if (window.MutationObserver && header) {
    const mo = new MutationObserver(() => apply());
    mo.observe(header, { childList: true, subtree: true, attributes: true });
  }
}

/* =========================================================
   Animaciones y accesibilidad base
   ========================================================= */

/**
 * Aplica la clase 'visible' a los elementos '.animate' cuando entran al viewport.
 * Respeta 'prefers-reduced-motion' para accesibilidad.
 */
function setupScrollAnimations() {
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const animatedElements = document.querySelectorAll('.animate');
  if (!animatedElements.length) return;

  if (prefersReduced) {
    animatedElements.forEach(el => el.classList.add('visible'));
    return;
  }

  const observerOptions = { root: null, rootMargin: '0px', threshold: 0.1 };

  const observerCallback = (entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  };

  const observer = new IntersectionObserver(observerCallback, observerOptions);
  animatedElements.forEach(element => observer.observe(element));
}

/**
 * Marca visibles las animaciones dentro de asides sticky (izq/der) para evitar efecto de entrada.
 */
function markAsideAnimationsAsVisible() {
  document.querySelectorAll('aside.d-md-block .animate')
    .forEach(el => el.classList.add('visible'));
}

/**
 * Scroll suave a anclas internas compensando el alto del header.
 * Si el offcanvas está abierto en móvil, lo cierra primero y luego hace el scroll.
 */
function setupSmoothAnchors() {
  document.addEventListener('click', (ev) => {
    const link = ev.target.closest('a[href^="#"]');
    if (!link) return;

    const hash = link.getAttribute('href');
    if (!hash || hash === '#') return;

    const target = document.querySelector(hash);
    if (!target) return;

    ev.preventDefault();

    const doScroll = () => {
      const header = document.querySelector('header');
      const headerH = header ? header.offsetHeight : 0;
      const rect = target.getBoundingClientRect();
      const y = window.pageYOffset + rect.top - (headerH + 20);

      const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({
        top: y < 0 ? 0 : y,
        behavior: prefersReduced ? 'auto' : 'smooth'
      });
    };

    const panel = document.querySelector('#tocOffcanvas');
    const isOpen = panel && panel.classList.contains('show');

    if (isOpen && window.bootstrap && bootstrap.Offcanvas) {
      const instance = bootstrap.Offcanvas.getInstance(panel) || new bootstrap.Offcanvas(panel);
      panel.addEventListener('hidden.bs.offcanvas', doScroll, { once: true });
      instance.hide();
    } else {
      doScroll();
    }
  }, false);
}

/**
 * Accesibilidad: cuando se abre el offcanvas, enfoca el primer elemento útil (título/enlace/botón).
 */
function setupOffcanvasFocus() {
  const panel = document.getElementById('tocOffcanvas');
  if (!panel) return;

  panel.addEventListener('shown.bs.offcanvas', () => {
    const focusable = panel.querySelector('h5, h6, a, button, [tabindex]:not([tabindex="-1"])');
    if (focusable && typeof focusable.focus === 'function') {
      focusable.focus();
    }
  });
}

/**
 * Colapsa todos los <details> al cargar, salvo los marcados con data-initial="open".
 */
function collapseAllDetailsOnLoad() {
  const allDetails = document.querySelectorAll('details');
  if (!allDetails.length) return;
  allDetails.forEach(d => {
    if (d.getAttribute('data-initial') === 'open') return;
    d.open = false;
  });
}

/* =========================================================
   Buscador con apertura de <details> y resaltado (3+ letras)
   - Busca en títulos, summaries y contenidos.
   - Abre <details> con coincidencias y los cierra si no hay resultados.
   ========================================================= */

function setupSearch() {
  const input = document.getElementById('q');
  if (!input) return;

  const liveRegion = createLiveRegion(); // Región aria-live para anunciar cantidad de resultados
  const openedBySearch = new Set();      // Trackea qué <details> abrió la búsqueda

  const onInput = debounce(() => {
    const queryRaw = input.value.trim();
    if (queryRaw.length < 3) {
      clearHighlights();
      closeSearchOpenedDetails(openedBySearch);
      liveRegion.textContent = '';
      input.setAttribute('aria-description', 'Ingrese al menos 3 caracteres para buscar.');
      return;
    }

    const query = normalize(queryRaw);
    clearHighlights();
    closeSearchOpenedDetails(openedBySearch);
    openedBySearch.clear();

    let results = 0;

    document.querySelectorAll('section .card').forEach(card => {
      const hasMatchInCard = searchAndHighlightInCard(card, query, openedBySearch);
      if (hasMatchInCard) results++;
    });

    liveRegion.textContent = results === 0
      ? 'Sin resultados.'
      : `${results} ${results === 1 ? 'resultado' : 'resultados'}.`;
    input.setAttribute('aria-description', liveRegion.textContent);
  }, 200);

  input.addEventListener('input', onInput);
}

function searchAndHighlightInCard(card, normalizedQuery, openedBySearch) {
  let matched = false;

  const title = card.querySelector('h2, h3');
  if (title && highlightInElement(title, normalizedQuery)) {
    matched = true;
  }

  const detailsList = card.querySelectorAll('details');
  detailsList.forEach(det => {
    const summary = det.querySelector('summary');
    const summaryMatch = summary ? highlightInElement(summary, normalizedQuery) : false;

    const content = det.querySelector('.content') || det;
    const contentMatch = content ? highlightInElement(content, normalizedQuery) : false;

    if (summaryMatch || contentMatch) {
      if (!det.open) {
        det.open = true;
        det.setAttribute('data-opened-by-search', '1');
        openedBySearch.add(det);
      }
      matched = true;
    }
  });

  if (!detailsList.length) {
    const body = card.querySelector('.card-body') || card;
    if (highlightInElement(body, normalizedQuery)) {
      matched = true;
    }
  }

  return matched;
}

/**
 * Resalta coincidencias completas sin cortar palabras, manejando acentos.
 * - Normaliza texto y query removiendo diacríticos (NFD)
 * - Inserta <mark class="search-hit"> alrededor de cada match
 */
function highlightInElement(root, normalizedQuery) {
  if (!normalizedQuery) return false;

  let hit = false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_SKIP;
      const tag = parent.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
      if (parent.classList && parent.classList.contains('search-hit')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  // Expresión regular insensible a acentos y mayúsculas
  const accentInsensitiveRegex = new RegExp(
    normalizedQuery
      .split('')
      .map(ch => {
        const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escapado regex
      })
      .join(''),
    'gi'
  );

  textNodes.forEach(node => {
    const text = node.nodeValue;
    const normalizedText = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!normalizedText.toLowerCase().includes(normalizedQuery)) return;

    const replaced = text.replace(accentInsensitiveRegex, match => {
      hit = true;
      return `<mark class="search-hit">${match}</mark>`;
    });

    if (hit && replaced !== text) {
      const span = document.createElement('span');
      span.innerHTML = replaced;
      node.replaceWith(span);
    }
  });

  return hit;
}

/* Utilidad: encuentra todas las ocurrencias (rangos) de una subcadena. */
function findAllOccurrences(text, query) {
  const ranges = [];
  if (!query) return ranges;

  let i = 0;
  while (i <= text.length - query.length) {
    const j = text.indexOf(query, i);
    if (j === -1) break;
    ranges.push({ start: j, end: j + query.length });
    i = j + query.length;
  }
  return ranges;
}

/* Limpia todos los resaltados <mark.search-hit>, restaurando los nodos de texto. */
function clearHighlights() {
  const marks = document.querySelectorAll('mark.search-hit');
  marks.forEach(mark => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
}

/* Cierra los <details> abiertos por la búsqueda actual (marcados con data-opened-by-search). */
function closeSearchOpenedDetails(openedBySearch) {
  openedBySearch.forEach(det => {
    if (det && det.isConnected && det.getAttribute('data-opened-by-search') === '1') {
      det.open = false;
      det.removeAttribute('data-opened-by-search');
    }
  });
}

/* Normaliza cadenas para búsqueda: minúsculas + sin diacríticos. */
function normalize(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/* Debounce: retrasa la ejecución de 'fn' hasta que pasen 'delay' ms sin nuevos llamados. */
function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), delay);
  };
}

/* Crea una región aria-live para anunciar resultados del buscador a lectores de pantalla. */
function createLiveRegion() {
  let region = document.getElementById('search-live-region');
  if (region) return region;

  region = document.createElement('div');
  region.id = 'search-live-region';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.style.position = 'absolute';
  region.style.width = '1px';
  region.style.height = '1px';
  region.style.overflow = 'hidden';
  region.style.clip = 'rect(1px, 1px, 1px, 1px)';
  region.style.whiteSpace = 'nowrap';
  document.body.appendChild(region);
  return region;
}
