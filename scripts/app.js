// ============================================================================
// BÚSQUEDA Y RESALTADO EN VIVO PARA FAQs / CONTACTOS / CHIPS
// ============================================================================

// Input de búsqueda (si no existe, varios handlers se saltan solos)
const q = document.getElementById('q');

// Utilidad: devuelve todos los elementos "filtrables" (FAQs, contactos y chips)
const items = () => Array.from(document.querySelectorAll('.faq-item, .contact, .chip'));

// Chequeo rápido: ¿el texto del elemento contiene el término?
// (ahora progresivo: substring case-insensitive para que "arre" matchee "Arredondo")
const matches = (el, term) => {
  if (!term) return true;
  return el.textContent.toLowerCase().includes(term);
};

// Quita marcas <mark> previas (de resaltados anteriores) dentro de un elemento
const unmark = (el) =>
  el.querySelectorAll('mark.__hl').forEach(m =>
    m.replaceWith(document.createTextNode(m.textContent))
  );

// -----------------------------------------------------------------------------
// Utilidad adicional: escapar caracteres especiales de RegExp para buscar texto
// literalmente (p. ej., términos con +, *, ?, ., etc.)
// -----------------------------------------------------------------------------
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// -----------------------------------------------------------------------------
// Helper para detectar si un nodo ES o ESTÁ dentro de un .chip
// -----------------------------------------------------------------------------
const isChip = (node) =>
  !!(node && (node.classList?.contains('chip') || node.closest?.('.chip')));

// -----------------------------------------------------------------------------
// Utilidad: construir RegExp consistente para búsqueda (sin resaltado)
// - Palabra completa si el término tiene 3+ caracteres y no contiene espacios.
// - Case-insensitive y global para encontrar todas las apariciones.
// -----------------------------------------------------------------------------
const buildSearchRegex = (term) => {
  const safe = escapeRegExp(term);
  const wholeWord = term.length >= 3 && !/\s/.test(term);
  const pattern = wholeWord ? `\\b${safe}\\b` : safe;
  return new RegExp(pattern, 'gi');
};

// Resalta la primera aparición de `term` dentro de todos los nodos de texto de `el`
// - Usa TreeWalker para iterar sólo nodos de texto.
// - Reemplaza el nodo de texto por un fragmento con <mark> alrededor del match.
// - Si `term` está vacío, no hace nada (y previamente se limpió con unmark()).
const highlight = (el, term) => {
  // ⚠️ DESACTIVADO: no se aplican marcas; solo nos aseguramos de limpiar cualquier resto.
  unmark(el);
  return;
};

// ============================================================================
// OBSERVADOR DE MUTACIONES
// - Abre automáticamente el primer <details.faq> visible si hay una búsqueda
//   activa y actualmente no hay ningún <details> abierto.
// - Reacciona a cambios de 'style' y 'open' en el árbol (p.ej., al filtrar).
// ============================================================================

const observer = new MutationObserver(() => {
  const term = (q && q.value.trim().toLowerCase()) || "";
  if (!term) return; // 🔸 no abrir nada si no hay búsqueda activa

  // Si no hay ningún <details.faq> abierto y hay resultados visibles, abrimos el primero
  const openVisible = document.querySelector('details.faq[open]');
  if(!openVisible){
    const first = Array
      .from(document.querySelectorAll('details.faq'))
      .find(d => d.style.display !== 'none');
    if(first) first.open = true;
  }
});

// Observa todo el body por cambios relevantes a filtrado/apertura
observer.observe(document.body, {
  attributes: true,
  subtree: true,
  attributeFilter: ['style', 'open']
});

// ============================================================================
// MANEJO DE ENTRADA EN EL BUSCADOR
// - Filtra elementos por término.
// - Permite match por sección (si el <h2> de la sección coincide, se muestra todo).
// - Resalta coincidencias.
// - Abre el primer <details> cuando corresponde.
// - Scroll y flash visual al primer resultado.
// - Mensaje de "sin resultados".
// ============================================================================

if (q) {
  q.addEventListener('input', (e) => {
    const term = e.target.value.trim().toLowerCase();
    let visibleCount = 0;   // cantidad de elementos visibles tras el filtrado
    const hits = [];        // referencias a elementos "coincidentes" (para scroll/flash)

    // --- (1) Detectar secciones cuyo <h2> coincide con el término ---
    // Si el título de la sección matchea, se considera que toda la sección "aplica".
    const sections = Array.from(document.querySelectorAll('section.card'));
    const sectionMatchMap = new Map();

    sections.forEach(sec => {
      const h2 = sec.querySelector('h2');
      const matched = !!(term && h2 && h2.textContent.toLowerCase().includes(term));
      sectionMatchMap.set(sec, matched);

      // Resaltar en el título si hace match; si no, limpiarlo
      // (highlight desactivado; se mantiene la llamada por estructura)
      if (matched) {
        highlight(h2, term);
      } else if (h2) {
        unmark(h2);
      }
    });

    // --- (2) Mostrar/ocultar items estándar ---
    // Regla:
    //   - showSelf: si el propio elemento coincide con el término
    //   - showBySection: si la sección fue "matcheada" por el <h2>
    //   - show: visible si se cumple cualquiera de las dos
    items().forEach(el => {
      // ⛔ Mantener los chips siempre visibles y sin resaltado
      if (el.classList.contains('chip')) {
        el.style.display = '';
        unmark(el);
        return;
      }

      const showSelf = term ? matches(el, term) : true;
      const sec = el.closest('section.card');
      const showBySection = sec ? sectionMatchMap.get(sec) : false;
      const show = showSelf || showBySection;

      el.style.display = show ? '' : 'none';

      if (show) {
        visibleCount++;

        // Resaltado desactivado (pero mantenido para compatibilidad)
        if (!isChip(el)) highlight(el, term);

        // Guardamos en "hits" para scroll/flash si coincide directamente o por sección
        if ((showSelf || showBySection) && !isChip(el)) hits.push(el);

        // Apertura automática de <details> cuando la sección matchea
        if (showBySection && el.tagName === 'DETAILS') el.open = true;
      } else {
        // Si lo ocultamos, limpiamos resaltados previos
        unmark(el);
      }
    });

    // --- (3) Si alguna sección matcheó pero no hubo hits de items,
    //         abrir el primer <details> de esa sección como "pista" visual.
    if (term && !hits.length) {
      const sec = sections.find(s => sectionMatchMap.get(s));
      if (sec) {
        const firstDetails = sec.querySelector('details.faq');
        if (firstDetails) {
          firstDetails.open = true;
          hits.push(firstDetails);
        }
      }
    }

    // --- (4) Scroll suave y flash al primer resultado relevante ---
    if (term && hits.length) {
      const first = hits[0];
      const card = first.closest('section.card') || first; //
      if (card && typeof card.scrollIntoView === 'function') {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('hit-flash'); //
        setTimeout(() => card.classList.remove('hit-flash'), 1200);
      }
    }

    // --- (5) Estado vacío: mensaje "sin resultados" ---
    // Crea perezosamente el contenedor si no existe.
    let empty = document.getElementById('empty-state');
    if (!empty) {
      empty = document.createElement('div');
      empty.id = 'empty-state';
      empty.className = 'muted';
      empty.style.padding = '8px 12px';
      empty.style.display = 'none';
      q.parentElement.appendChild(empty);
    }

    // Muestra/oculta el mensaje según haya o no elementos visibles
    empty.textContent = visibleCount ? '' : 'No se encuentran resultados para la búsqueda.';
    empty.style.display = visibleCount ? 'none' : 'block';
  });
}

// ============================================================================
// MEJORAS DE USABILIDAD
// - Botón para enfocar el buscador.
// - Atajo de teclado '/' para enfocar (si no se está escribiendo en otro input).
// ============================================================================

const focusBtn = document.getElementById('focus-search');
if (focusBtn) {
  focusBtn.addEventListener('click', () => q && q.focus());
}

window.addEventListener('keydown', (ev) => {
  const isTyping = ['INPUT','TEXTAREA'].includes(document.activeElement.tagName);
  if (ev.key === '/' && !isTyping) {
    ev.preventDefault();
    q && q.focus();
  }
});

// ============================================================================
// NORMALIZACIÓN DE ENLACES
// - Si el href es '#', se alerta que es un placeholder para reemplazar.
// - Para enlaces externos (no ancla local, no mailto, no tel):
//     * Abrir en nueva pestaña (target="_blank")
//     * Añadir rel="noopener noreferrer" por seguridad.
// ============================================================================

const anchors = Array.from(document.querySelectorAll('a'));

anchors.forEach(a => {
  const href = a.getAttribute('href') || '';

  // Aviso cuando el link está como '#'
  if (href === '#') {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      alert('Este enlace es un marcador de posición. Reemplazá el # por la URL real.');
    });

  // Para enlaces "externos" (todo lo que no sea ancla local, mailto o tel)
  } else if (!href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
    a.setAttribute('target','_blank');
    a.setAttribute('rel','noopener noreferrer');
  }
});

// (1) Cerrar todas las FAQs al cargar
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('details.faq[open]').forEach(d => { d.open = false; });
});

// (2) Cerrar todas las FAQs al hacer clic en el índice (aside o offcanvas)
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('.toc a');
  if (!a) return;

  setTimeout(() => {
    document.querySelectorAll('details.faq[open]').forEach(d => { d.open = false; });
  }, 0);
});

// (3) Modo acordeón: al abrir una, cerrar las demás de la misma sección
document.addEventListener('toggle', (ev) => {
  const d = ev.target;
  if (!(d instanceof HTMLDetailsElement)) return;
  if (!d.classList.contains('faq')) return;
  if (!d.open) return;

  const sec = d.closest('section.card');
  if (!sec) return;
  sec.querySelectorAll('details.faq[open]').forEach(other => {
    if (other !== d) other.open = false;
  });
}, true);
