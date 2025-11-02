// ============================================================================
// BÚSQUEDA Y RESALTADO EN VIVO PARA FAQs / CONTACTOS / CHIPS
// ============================================================================

// Input de búsqueda (si no existe, varios handlers se saltan solos)
const q = document.getElementById('q');

// Utilidad: devuelve todos los elementos "filtrables" (FAQs, contactos y chips)
const items = () => Array.from(document.querySelectorAll('.faq-item, .contact, .chip'));

// Chequeo rápido: ¿el texto del elemento contiene el término?
const matches = (el, term) => el.textContent.toLowerCase().includes(term);

// Quita marcas <mark> previas (de resaltados anteriores) dentro de un elemento
const unmark = (el) =>
  el.querySelectorAll('mark.__hl').forEach(m =>
    m.replaceWith(document.createTextNode(m.textContent))
  );

// Resalta la primera aparición de `term` dentro de todos los nodos de texto de `el`
// - Usa TreeWalker para iterar sólo nodos de texto.
// - Reemplaza el nodo de texto por un fragmento con <mark> alrededor del match.
// - Si `term` está vacío, no hace nada (y previamente se limpió con unmark()).
const highlight = (el, term) => {
  unmark(el);
  if(!term) return;

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  const parts = [];
  while (walker.nextNode()) parts.push(walker.currentNode);

  parts.forEach(node => {
    const t = node.textContent;
    const i = t.toLowerCase().indexOf(term);

    // Sólo resaltar si hay coincidencia y el texto no es puro whitespace
    if(i > -1 && t.trim().length){
      // Particiona el texto en antes / match / después
      const before = t.slice(0, i);
      const mid    = t.slice(i, i + term.length);
      const after  = t.slice(i + term.length);

      // Crea un fragmento con el texto antes, el <mark> y el texto después
      const frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));

      const m = document.createElement('mark');
      m.className = '__hl';
      m.textContent = mid;
      frag.appendChild(m);

      if (after) frag.appendChild(document.createTextNode(after));

      // Reemplaza el nodo de texto original por el fragmento resaltado
      node.replaceWith(frag);
    }
  });
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
      const showSelf = term ? matches(el, term) : true;
      const sec = el.closest('section.card');
      const showBySection = sec ? sectionMatchMap.get(sec) : false;
      const show = showSelf || showBySection;

      el.style.display = show ? '' : 'none';

      if (show) {
        visibleCount++;
        // Resaltado dentro del elemento visible
        highlight(el, term);

        // Guardamos en "hits" para scroll/flash si coincide directamente o por sección
        if (showSelf || showBySection) hits.push(el);

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
      if (first && typeof first.scrollIntoView === 'function') {
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        first.classList.add('hit-flash');                 // clase CSS para "destello"
        setTimeout(() => first.classList.remove('hit-flash'), 1200);
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
    empty.textContent = visibleCount ? '' : 'No se encontraron resultados para tu búsqueda.';
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
