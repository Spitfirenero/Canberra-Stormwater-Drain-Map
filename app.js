/* global L */

const CANBERRA = [-35.2809, 149.13];

const statusEl = document.getElementById('status');
const detailsEl = document.getElementById('details');
const sidebarBtn = document.getElementById('btn-sidebar');
const sidebarResizerEl = document.getElementById('sidebar-resizer');
const fitBtn = document.getElementById('btn-fit');
const diameterRangeEl = document.getElementById('diameter');
const diameterValueEl = document.getElementById('diameter-value');
const structureResultsEl = document.getElementById('structure-results');
const structureDetailsEl = document.getElementById('structure-details');
const basemapSelectEl = document.getElementById('basemap-select');
const basemapWarningEl = document.getElementById('basemap-warning');

const SIDEBAR_COLLAPSED_KEY = 'geojsonViewer.sidebarCollapsed';
const SIDEBAR_WIDTH_KEY = 'geojsonViewer.sidebarWidthPx';
const DEFAULT_SIDEBAR_WIDTH_PX = 360;

const map = L.map('map', {
  center: CANBERRA,
  zoom: 11,
  zoomControl: true,
  preferCanvas: true,
  maxZoom: 22,
});

// Panes control layer draw order.
map.createPane('basemap').style.zIndex = '200';
map.createPane('labels').style.zIndex = '650';

const structureAnnotationLayer = L.layerGroup().addTo(map);

const STRUCTURE_LABEL_MIN_ZOOM = 16;

function shouldShowStructureLabelsFor(structureId) {
  const z = map.getZoom();
  if (Number.isFinite(z) && z >= STRUCTURE_LABEL_MIN_ZOOM) return true;
  return Boolean(selectedStructureId && structureId && structureId === selectedStructureId);
}

function updateStructureAnnotationLabelVisibility() {
  structureAnnotationLayer.eachLayer((layer) => {
    const structureId = layer?._structureId ?? null;
    const show = shouldShowStructureLabelsFor(structureId);
    if (show && typeof layer.openTooltip === 'function') layer.openTooltip();
    if (!show && typeof layer.closeTooltip === 'function') layer.closeTooltip();
  });
}

map.on('zoomend', () => {
  updateStructureAnnotationLabelVisibility();
});

function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);

  // When collapsed, force width to 0 (inline CSS variables override stylesheet rules).
  if (collapsed) {
    document.body.style.setProperty('--sidebar-width', '0px');
  }

  if (sidebarBtn) {
    sidebarBtn.textContent = collapsed ? 'Show sidebar' : 'Hide sidebar';
    sidebarBtn.setAttribute('aria-pressed', String(collapsed));
  }

  window.setTimeout(() => {
    map.invalidateSize();
  }, 120);
}

function clampSidebarWidthPx(widthPx) {
  const w = Number(widthPx);
  if (!Number.isFinite(w)) return DEFAULT_SIDEBAR_WIDTH_PX;
  // Keep it usable and prevent it from consuming the viewport.
  const minPx = 260;
  const maxPx = Math.max(320, Math.floor(window.innerWidth * 0.65));
  return Math.max(minPx, Math.min(maxPx, Math.round(w)));
}

function setSidebarWidthPx(widthPx, { persist } = { persist: true }) {
  const clamped = clampSidebarWidthPx(widthPx);
  document.body.style.setProperty('--sidebar-width', `${clamped}px`);

  if (persist) {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped));
    } catch {
    }
  }
}

function restoreSidebarWidth() {
  try {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (saved) {
      setSidebarWidthPx(Number(saved), { persist: false });
      return;
    }
  } catch {
  }

  setSidebarWidthPx(DEFAULT_SIDEBAR_WIDTH_PX, { persist: false });
}

// Restore sidebar layout early so the initial render uses the correct layout.
try {
  restoreSidebarWidth();
  try {
    localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
  } catch {
  }
  setSidebarCollapsed(false);
} catch {
  restoreSidebarWidth();
  setSidebarCollapsed(false);
}

// Sidebar resize handle
if (sidebarResizerEl) {
  let rafId = 0;
  let dragging = false;

  const applyWidthFromClientX = (clientX) => {
    const layoutEl = document.querySelector('.layout');
    const rect = layoutEl ? layoutEl.getBoundingClientRect() : null;
    const right = rect ? rect.right : window.innerWidth;
    const nextWidth = right - clientX;
    setSidebarWidthPx(nextWidth);

    if (rafId) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      map.invalidateSize();
    });
  };

  sidebarResizerEl.addEventListener('pointerdown', (e) => {
    if (document.body.classList.contains('sidebar-collapsed')) return;
    dragging = true;
    document.body.classList.add('resizing');
    sidebarResizerEl.setPointerCapture(e.pointerId);
    applyWidthFromClientX(e.clientX);
    e.preventDefault();
  });

  sidebarResizerEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    applyWidthFromClientX(e.clientX);
  });

  const stop = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing');
    map.invalidateSize();
  };

  sidebarResizerEl.addEventListener('pointerup', stop);
  sidebarResizerEl.addEventListener('pointercancel', stop);
}

// Esri World Imagery (no API key).
const imagery = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    pane: 'basemap',
    maxNativeZoom: 19,
    maxZoom: 22,
    attribution:
      'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  },
).addTo(map);

// Optional ACTmapi imagery (via ImageServer export).
const ACTMAPI_ATTRIBUTION = 'Imagery © Australian Capital Territory (ACTmapi) — CC BY; Source: MetroMap';

function createActmapiImageLayer(url) {
  if (!(L.esri && typeof L.esri.imageMapLayer === 'function')) return null;
  return L.esri.imageMapLayer({
    url,
    pane: 'basemap',
    opacity: 1,
    useCors: true,
    attribution: ACTMAPI_ATTRIBUTION,
  });
}

const actmapiAerial2023Sep75mm = createActmapiImageLayer(
  'https://data4.actmapi.act.gov.au/arcgis/rest/services/ACT_IMAGERY_MGA2020/2023_09_urban_75mm/ImageServer',
);

const actmapiAerial2020Jan50mm = createActmapiImageLayer(
  'https://data4.actmapi.act.gov.au/arcgis/rest/services/ACT_IMAGERY_MGA2020/2020_01_urban_50mm/ImageServer',
);

// Optional reference labels.
const labels = L.tileLayer(
  'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  {
    pane: 'labels',
    maxNativeZoom: 19,
    maxZoom: 22,
    opacity: 0.9,
    attribution: 'Labels © Esri',
  },
).addTo(map);

const BASEMAPS = [
  { id: 'esri', name: 'Esri World Imagery', layer: imagery, showWarning: false },
];

if (actmapiAerial2023Sep75mm) {
  BASEMAPS.push({
    id: 'actmapi-2023-09-75mm',
    name: 'ACTmapi Aerial (2023 Sep, 75mm) — newer',
    layer: actmapiAerial2023Sep75mm,
    showWarning: true,
  });
}

if (actmapiAerial2020Jan50mm) {
  BASEMAPS.push({
    id: 'actmapi-2020-01-50mm',
    name: 'ACTmapi Aerial (2020 Jan, 50mm) — higher res',
    layer: actmapiAerial2020Jan50mm,
    showWarning: true,
  });
}

let currentBasemapId = 'esri';
let currentBasemapLayer = imagery;

function setBasemapWarningVisible(visible) {
  if (!basemapWarningEl) return;
  basemapWarningEl.hidden = !visible;
}

function setBasemapById(id) {
  const next = BASEMAPS.find((b) => b.id === id);
  if (!next) return;
  if (currentBasemapId === next.id) {
    setBasemapWarningVisible(Boolean(next.showWarning));
    return;
  }

  if (currentBasemapLayer && map.hasLayer(currentBasemapLayer)) {
    map.removeLayer(currentBasemapLayer);
  }

  currentBasemapId = next.id;
  currentBasemapLayer = next.layer;
  if (currentBasemapLayer) currentBasemapLayer.addTo(map);

  if (labels && map.hasLayer(labels) && typeof labels.bringToFront === 'function') {
    labels.bringToFront();
  }

  setBasemapWarningVisible(Boolean(next.showWarning));
}

function initBasemapDropdown() {
  if (!basemapSelectEl) return;

  basemapSelectEl.innerHTML = '';
  for (const bm of BASEMAPS) {
    const opt = document.createElement('option');
    opt.value = bm.id;
    opt.textContent = bm.name;
    basemapSelectEl.appendChild(opt);
  }

  basemapSelectEl.value = currentBasemapId;
  setBasemapWarningVisible(Boolean(BASEMAPS.find((b) => b.id === currentBasemapId)?.showWarning));

  basemapSelectEl.addEventListener('change', () => {
    setBasemapById(basemapSelectEl.value);
  });
}

// Compact overlay control (reference labels).
L.control.layers({}, { 'Reference labels': labels }, { collapsed: true }).addTo(map);

initBasemapDropdown();

let dataLayer = null;
let dataBounds = null;
let allGeoJson = null;
let currentMinDiameterM = 1.5;

let structures = [];
// assetId -> array of { structure, member }
let memberIndex = new Map();
let selectedStructureId = null;

function toFiniteNumber(value) {
  const n = toNumber(value);
  return n === null ? null : n;
}

function getAnnotationsForStructure(structureObj) {
  return Array.isArray(structureObj?.annotations) ? structureObj.annotations : [];
}

function renderStructureAnnotations() {
  structureAnnotationLayer.clearLayers();

  for (const s of structures ?? []) {
    const color = s?.color ?? '#64748b';
    const selected = s?.id && s.id === selectedStructureId;

    // Group multiple labels at identical coordinates into one marker/tooltip.
    const grouped = new Map();
    for (const a of getAnnotationsForStructure(s)) {
      const lat = toFiniteNumber(a?.lat);
      const lng = toFiniteNumber(a?.lng);
      const label = normalizeId(a?.label);
      if (lat === null || lng === null || !label) continue;
      const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      const arr = grouped.get(key) ?? [];
      arr.push(label);
      grouped.set(key, arr);
    }

    for (const [key, labels] of grouped.entries()) {
      const [latStr, lngStr] = key.split(',');
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const marker = L.circleMarker([lat, lng], {
        radius: selected ? 7 : 5,
        color,
        weight: selected ? 3.5 : 2.5,
        opacity: 1,
        fillColor: color,
        fillOpacity: selected ? 0.55 : 0.35,
      });

      marker._structureId = s?.id ?? null;
      marker._coordKey = key;

      const tooltipHtml = labels.map((t) => escapeHtml(String(t))).join('<br/>');
      marker.bindTooltip(tooltipHtml, {
        permanent: false,
        direction: 'top',
        opacity: 0.95,
        className: 'structure-label',
        interactive: false,
        closeOnClick: false,
        autoClose: false,
      });

      structureAnnotationLayer.addLayer(marker);
    }
  }

  updateStructureAnnotationLabelVisibility();
}

function formatCoord(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(6);
}

async function copyTextToClipboard(text) {
  const value = String(text ?? '');
  if (!value) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Continue to fallback.
  }

  // Fallback for insecure contexts / older browsers.
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function flashInlineMessage(el, message) {
  if (!el) return;
  const prev = el.textContent;
  el.textContent = message;
  el.dataset.flash = '1';
  window.setTimeout(() => {
    el.textContent = prev;
    delete el.dataset.flash;
  }, 900);
}

function renderSelectedStructureDetails() {
  if (!structureDetailsEl) return;

  if (!selectedStructureId) {
    structureDetailsEl.innerHTML = '<div class="hint">Select a structure to see details.</div>';
    return;
  }

  const s = getStructureById(selectedStructureId);
  if (!s) {
    structureDetailsEl.innerHTML = '<div class="hint">Selected structure not found.</div>';
    return;
  }

  const name = escapeHtml(String(s?.name ?? s?.id ?? 'Untitled'));
  const assetCount = Array.isArray(s?.members) ? s.members.length : 0;
  const annotations = getAnnotationsForStructure(s);
  const labelCount = annotations.length;
  const description = normalizeId(s?.description) ?? '';

  const titleHtml = `
    <div class="structure-title">
      <div class="name">${name}</div>
      <div class="meta">${escapeHtml(
        `${assetCount} asset${assetCount === 1 ? '' : 's'}${labelCount ? ` • ${labelCount} label${
          labelCount === 1 ? '' : 's'
        }` : ''}`,
      )}</div>
    </div>
    <div class="structure-actions">
      <button class="btn" type="button" data-action="zoom-structure">Zoom</button>
      <button class="btn" type="button" data-action="copy-all-labels">Copy labels</button>
      <button class="btn" type="button" data-action="clear-structure-selection">Clear selection</button>
    </div>
  `;

  const descHtml = description
    ? `<div class="structure-desc">${description
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join('')}</div>`
    : '';

  const annotationRows = (annotations ?? [])
    .map((a) => {
      const lat = toFiniteNumber(a?.lat);
      const lng = toFiniteNumber(a?.lng);
      const label = normalizeId(a?.label) ?? 'Label';
      if (lat === null || lng === null) return '';
      const coordKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      const coordText = `${formatCoord(lat)}, ${formatCoord(lng)}`;
      return `
        <div class="annotation-item" role="group" data-structure-id="${escapeHtml(
          String(s?.id ?? ''),
        )}" data-coord-key="${escapeHtml(coordKey)}" data-lat="${escapeHtml(
          formatCoord(lat),
        )}" data-lng="${escapeHtml(formatCoord(lng))}">
          <button class="annotation-main" type="button" data-action="zoom-annotation" title="Zoom to ${escapeHtml(
            label,
          )}">
            <div class="annotation-label">${escapeHtml(label)}</div>
            <div class="annotation-coord">${escapeHtml(coordText)}</div>
          </button>
          <button class="annotation-copy" type="button" data-action="copy-coords" data-copy="${escapeHtml(
            coordText,
          )}" title="Copy coordinates">Copy</button>
        </div>
      `;
    })
    .filter(Boolean)
    .join('');

  const annotationsHtml = annotationRows
    ? `
      <div class="structure-section">
        <h3>Labels</h3>
        <div class="annotation-list">${annotationRows}</div>
      </div>
    `
    : `
      <div class="structure-section">
        <h3>Labels</h3>
        <div class="hint">No labels configured for this structure.</div>
      </div>
    `;

  structureDetailsEl.innerHTML = `${titleHtml}${descHtml}${annotationsHtml}`;

  structureDetailsEl.onclick = (e) => {
    const actionEl = e.target?.closest?.('[data-action]');
    const action = actionEl?.getAttribute?.('data-action');
    if (action === 'clear-structure-selection') {
      selectStructure(null);
      renderStructureResults();
      return;
    }
    if (action === 'zoom-structure') {
      zoomToStructure(s);
      return;
    }
    if (action === 'copy-all-labels') {
      const lines = (annotations ?? [])
        .map((a) => {
          const lat = toFiniteNumber(a?.lat);
          const lng = toFiniteNumber(a?.lng);
          const label = normalizeId(a?.label) ?? '';
          if (lat === null || lng === null) return null;
          const coordText = `${formatCoord(lat)}, ${formatCoord(lng)}`;
          return label ? `${label}: ${coordText}` : coordText;
        })
        .filter(Boolean)
        .join('\n');

      copyTextToClipboard(lines).then((ok) => {
        flashInlineMessage(actionEl, ok ? 'Copied' : 'Copy failed');
      });
      return;
    }
    if (action === 'copy-coords') {
      const text = actionEl?.getAttribute?.('data-copy') ?? '';
      copyTextToClipboard(text).then((ok) => {
        flashInlineMessage(actionEl, ok ? 'Copied' : 'Copy failed');
      });
      return;
    }

    if (action === 'zoom-annotation') {
      const container = actionEl.closest?.('[data-coord-key]');
      const lat = toFiniteNumber(container?.getAttribute?.('data-lat'));
      const lng = toFiniteNumber(container?.getAttribute?.('data-lng'));
      const coordKey = container?.getAttribute?.('data-coord-key');
      if (lat === null || lng === null) return;

      const nextZoom = Math.max(map.getZoom(), STRUCTURE_LABEL_MIN_ZOOM);
      map.setView([lat, lng], nextZoom, { animate: true });

      structureAnnotationLayer.eachLayer((layer) => {
        if (layer?._structureId !== selectedStructureId) return;
        if (coordKey && layer?._coordKey !== coordKey) return;
        if (typeof layer.openTooltip === 'function') layer.openTooltip();
      });
      return;
    }
  };
}

function normalizeId(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function getAssetId(feature) {
  const props = feature?.properties ?? {};
  return (
    normalizeId(props.ASSET_ID) ||
    normalizeId(props.ASSETID) ||
    normalizeId(props.ASSET_NAME) ||
    normalizeId(props.ID) ||
    normalizeId(feature?.id)
  );
}

function buildMemberIndex(structureList) {
  const next = new Map();
  for (const s of structureList ?? []) {
    const members = Array.isArray(s?.members) ? s.members : [];
    for (const m of members) {
      const assetId = normalizeId(typeof m === 'string' ? m : m?.assetId);
      if (!assetId) continue;
      const arr = next.get(assetId) ?? [];
      arr.push({ structure: s, member: m });
      next.set(assetId, arr);
    }
  }
  memberIndex = next;
}

function getStructureMatchesForFeature(feature) {
  const assetId = getAssetId(feature);
  if (!assetId) return [];
  return memberIndex.get(assetId) ?? [];
}

function getPrimaryStructureForFeature(feature) {
  const matches = getStructureMatchesForFeature(feature);
  return matches.length ? matches[0] : null;
}

function isFeatureInStructure(feature, structureId) {
  if (!structureId) return false;
  const matches = getStructureMatchesForFeature(feature);
  return matches.some((m) => m?.structure?.id === structureId);
}

function selectStructure(structureId) {
  selectedStructureId = structureId || null;
  applyDiameterEmphasis();
  renderStructureAnnotations();
  updateStructureAnnotationLabelVisibility();
  renderSelectedStructureDetails();
}

function getStructureById(structureId) {
  return (structures ?? []).find((s) => s?.id === structureId) ?? null;
}

function structureMemberSet(structureObj) {
  const members = Array.isArray(structureObj?.members) ? structureObj.members : [];
  const set = new Set();
  for (const m of members) {
    const id = normalizeId(typeof m === 'string' ? m : m?.assetId);
    if (id) set.add(id);
  }
  return set;
}

function zoomToStructure(structureObj) {
  if (!structureObj || !dataLayer) return;
  const memberSet = structureMemberSet(structureObj);
  const annotations = getAnnotationsForStructure(structureObj);
  if (memberSet.size === 0 && annotations.length === 0) return;

  const bounds = L.latLngBounds([]);
  dataLayer.eachLayer((layer) => {
    const feature = layer?.feature;
    if (!feature) return;
    const assetId = getAssetId(feature);
    if (!assetId || !memberSet.has(assetId)) return;

    if (typeof layer.getBounds === 'function') {
      const b = layer.getBounds();
      if (b?.isValid()) bounds.extend(b);
      return;
    }
    if (typeof layer.getLatLng === 'function') {
      const ll = layer.getLatLng();
      if (ll) bounds.extend(ll);
    }
  });

  if (bounds.isValid()) map.fitBounds(bounds.pad(0.25));
  else {
    for (const a of annotations) {
      const lat = toFiniteNumber(a?.lat);
      const lng = toFiniteNumber(a?.lng);
      if (lat === null || lng === null) continue;
      bounds.extend([lat, lng]);
    }
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.25));
  }
}

function renderStructureResults() {
  if (!structureResultsEl) return;
  const list = Array.isArray(structures) ? structures : [];

  if (!list.length) {
    structureResultsEl.innerHTML = '<div class="hint">No structures loaded (missing <code>structures.json</code>?).</div>';
    return;
  }

  const results = [...list].sort((a, b) =>
    String(a?.name ?? a?.id ?? '').localeCompare(String(b?.name ?? b?.id ?? '')),
  );

  const maxItems = 25;
  const html = results.slice(0, maxItems).map((s) => {
    const name = escapeHtml(String(s?.name ?? s?.id ?? 'Untitled'));
    const color = escapeHtml(String(s?.color ?? '#64748b'));
    const assetCount = Array.isArray(s?.members) ? s.members.length : 0;
    const labelCount = getAnnotationsForStructure(s).length;
    const selected = s?.id && s.id === selectedStructureId;
    const meta = `${assetCount} asset${assetCount === 1 ? '' : 's'}${labelCount ? ` • ${labelCount} label${
      labelCount === 1 ? '' : 's'
    }` : ''}`;

    return `
      <div class="structure-item" role="button" tabindex="0" data-structure-id="${escapeHtml(
        String(s?.id ?? ''),
      )}" aria-pressed="${selected ? 'true' : 'false'}" title="Zoom to ${name}">
        <div style="display:flex; align-items:center; gap:10px; min-width:0;">
          <span class="structure-swatch" style="background:${color}"></span>
          <span class="structure-name" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${name}</span>
        </div>
        <span class="structure-meta">${escapeHtml(meta)}</span>
      </div>
    `;
  });

  structureResultsEl.innerHTML = html.join('');

  structureResultsEl.onclick = (e) => {
    const el = e.target?.closest?.('[data-structure-id]');
    const id = el?.getAttribute?.('data-structure-id');
    if (!id) return;
    if (id === selectedStructureId) {
      selectStructure(null);
    } else {
      selectStructure(id);
      const s = getStructureById(id);
      zoomToStructure(s);
    }
    renderStructureResults();
  };

  structureResultsEl.onkeydown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target?.closest?.('[data-structure-id]');
    const id = el?.getAttribute?.('data-structure-id');
    if (!id) return;
    e.preventDefault();
    if (id === selectedStructureId) {
      selectStructure(null);
    } else {
      selectStructure(id);
      const s = getStructureById(id);
      zoomToStructure(s);
    }
    renderStructureResults();
  };
}

async function loadStructures() {
  try {
    const resp = await fetch('./structures.json', { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`Failed to load structures.json: ${resp.status} ${resp.statusText}`);
    const json = await resp.json();
    const list = Array.isArray(json?.structures) ? json.structures : [];
    structures = list;
    buildMemberIndex(structures);
  } catch (err) {
    console.warn(err);
    structures = [];
    memberIndex = new Map();
  }

  // Refresh if GeoJSON is already loaded.
  applyDiameterEmphasis();
  renderStructureResults();
  renderStructureAnnotations();
  updateStructureAnnotationLabelVisibility();
  renderSelectedStructureDetails();
}

function renderDetails(feature) {
  const props = feature?.properties ?? {};
  const keys = Object.keys(props);

  if (keys.length === 0) {
    detailsEl.innerHTML = '<div class="hint">No properties found on this feature.</div>';
    return;
  }

  const rows = keys
    .sort((a, b) => a.localeCompare(b))
    .map((k) => {
      const v = props[k];
      return `<div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(
        String(v),
      )}</div>`;
    })
    .join('');

  detailsEl.innerHTML = `<div class="kv">${rows}</div>`;
}

function escapeHtml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function lineStyle() {
  return {
    color: '#22d3ee',
    weight: 4.5,
    opacity: 1,
  };
}

function lineStyleDim() {
  return {
    color: '#9ca3af',
    weight: 2,
    opacity: 0.75,
  };
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getDiameterM(feature) {
  const props = feature?.properties ?? {};
  const mm = toNumber(props.PIPE_DIAMETER);
  if (mm === null) return null;
  return mm / 1000.0;
}

function formatMeters(value) {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(2);
}

function clampMinDiameter(valueM) {
  // Minimum allowed diameter is 0.6 m.
  return Math.max(0.6, valueM);
}

function isEmphasized(feature, minDiameterM) {
  const d = getDiameterM(feature);
  return d !== null && d >= minDiameterM;
}

function getStyleForFeature(feature, minDiameterM) {
  const base = isEmphasized(feature, minDiameterM) ? lineStyle() : lineStyleDim();
  const match = getPrimaryStructureForFeature(feature);
  const selected = isFeatureInStructure(feature, selectedStructureId);

  if (!match?.structure?.color) {
    if (!selected) return base;
    return { ...base, weight: (base.weight ?? 3) + 1.5, opacity: 1 };
  }

  const out = {
    ...base,
    color: match.structure.color,
  };

  if (selected) {
    out.weight = (out.weight ?? 3) + 1.5;
    out.opacity = 1;
  }

  return out;
}

function computeDiameterStats(geojson) {
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  let min = Infinity;
  let max = -Infinity;
  let count = 0;

  for (const f of features) {
    const d = getDiameterM(f);
    if (d === null) continue;
    count += 1;
    if (d < min) min = d;
    if (d > max) max = d;
  }

  return {
    count,
    min: count ? min : null,
    max: count ? max : null,
  };
}

function setStatusLoaded(filteredCount, totalCount, minDiameterM) {
  const minText = formatMeters(minDiameterM);
  if (totalCount !== null) {
    statusEl.textContent = `Showing ${filteredCount} / ${totalCount} features (≥ ${minText} m)`;
  } else {
    statusEl.textContent = `Showing ${filteredCount} features (≥ ${minText} m)`;
  }
}

function ensureLayer() {
  if (dataLayer) return;

  dataLayer = L.geoJSON(null, {
    style: (feature) => getStyleForFeature(feature, clampMinDiameter(currentMinDiameterM)),
    pointToLayer: (feature, latlng) => {
      const minM = clampMinDiameter(currentMinDiameterM);
      const emphasized = isEmphasized(feature, minM);
      const structureMatch = getPrimaryStructureForFeature(feature);
      const structureColor = structureMatch?.structure?.color ?? null;
      const selected = isFeatureInStructure(feature, selectedStructureId);
      const radius = selected ? (emphasized ? 7 : 5) : emphasized ? 6 : 3;
      const style = getStyleForFeature(feature, minM);

      const marker = L.circleMarker(latlng, {
        radius,
        ...style,
        fillColor: structureColor ?? (emphasized ? '#22d3ee' : '#0b1220'),
        fillOpacity: structureColor ? (emphasized ? 0.55 : 0.25) : emphasized ? 0.45 : 0.15,
      });

      return marker;
    },
    onEachFeature: (feature, layer) => {
      layer.on('click', () => renderDetails(feature));

      const title = feature?.properties?.ASSET_ID ?? feature?.properties?.ASSET_NAME ?? feature?.id;
      if (title !== undefined) {
        layer.bindPopup(`<strong>${escapeHtml(String(title))}</strong>`, {
          closeButton: true,
          autoPan: true,
        });
      }
    },
  }).addTo(map);
}

function applyDiameterEmphasis() {
  if (!allGeoJson) return;
  ensureLayer();

  const minM = clampMinDiameter(currentMinDiameterM);
  const totalCount = Array.isArray(allGeoJson.features) ? allGeoJson.features.length : 0;
  let emphasizedCount = 0;
  for (const f of allGeoJson.features ?? []) {
    if (isEmphasized(f, minM)) emphasizedCount += 1;
  }

  setStatusLoaded(emphasizedCount, totalCount, minM);

  // Update styles in-place rather than re-adding the GeoJSON.
  dataLayer.eachLayer((layer) => {
    const feature = layer?.feature;
    if (!feature) return;
    const emphasized = isEmphasized(feature, minM);
    const structureMatch = getPrimaryStructureForFeature(feature);
    const structureColor = structureMatch?.structure?.color ?? null;
    const selected = isFeatureInStructure(feature, selectedStructureId);
    const style = getStyleForFeature(feature, minM);
    if (typeof layer.setStyle === 'function') layer.setStyle(style);
    if (typeof layer.setRadius === 'function') layer.setRadius(selected ? (emphasized ? 7 : 5) : emphasized ? 5 : 3);
    if (typeof layer.setStyle === 'function') {
      layer.setStyle({
        fillColor: structureColor ?? (emphasized ? '#22d3ee' : '#0b1220'),
        fillOpacity: structureColor ? (emphasized ? 0.55 : 0.25) : emphasized ? 0.45 : 0.15,
      });
    }

    if ((selected || emphasized) && typeof layer.bringToFront === 'function') layer.bringToFront();
    if (!emphasized && typeof layer.bringToBack === 'function') layer.bringToBack();
  });
}

async function loadGeoJson() {
  statusEl.textContent = 'Loading filtered_data.geojson…';

  const resp = await fetch('./filtered_data.geojson', { cache: 'no-cache' });
  if (!resp.ok) throw new Error(`Failed to load GeoJSON: ${resp.status} ${resp.statusText}`);

  allGeoJson = await resp.json();
  statusEl.textContent = 'Rendering…';

  ensureLayer();
  dataLayer.clearLayers();
  dataLayer.addData(allGeoJson);
  dataBounds = dataLayer.getBounds();

  // Initialize filter controls from data.
  const stats = computeDiameterStats(allGeoJson);
  currentMinDiameterM = clampMinDiameter(toNumber(diameterRangeEl?.value) ?? 1.5);

  if (diameterRangeEl && stats.max !== null) {
    // Choose a rounded upper bound; minimum of 1.0.
    const niceMax = Math.max(0.6, Math.ceil(stats.max * 20) / 20);
    diameterRangeEl.min = '0.6';
    diameterRangeEl.max = String(Math.max(1.0, niceMax));
    diameterRangeEl.step = '0.05';

    // If the current value is above max (e.g. dataset changed), clamp it.
    const clamped = Math.min(Number(diameterRangeEl.max), currentMinDiameterM);
    currentMinDiameterM = clampMinDiameter(clamped);
    diameterRangeEl.value = String(currentMinDiameterM);
  }

  if (diameterValueEl) diameterValueEl.textContent = formatMeters(currentMinDiameterM);
  applyDiameterEmphasis();

  if (dataBounds?.isValid()) {
    map.fitBounds(dataBounds.pad(0.08));
  }
}

fitBtn.addEventListener('click', () => {
  if (dataBounds && dataBounds.isValid()) map.fitBounds(dataBounds.pad(0.08));
  else map.setView(CANBERRA, 11);
});

if (sidebarBtn) {
  sidebarBtn.addEventListener('click', () => {
    const next = !document.body.classList.contains('sidebar-collapsed');
    if (!next) restoreSidebarWidth();
    setSidebarCollapsed(next);
  });
}

let filterTimer = null;
function scheduleFilterUpdate() {
  if (!diameterRangeEl) return;
  const raw = toNumber(diameterRangeEl.value);
  const next = clampMinDiameter(raw ?? 1.5);
  currentMinDiameterM = next;
  if (diameterValueEl) diameterValueEl.textContent = formatMeters(next);

  if (filterTimer) window.clearTimeout(filterTimer);
  filterTimer = window.setTimeout(() => {
    applyDiameterEmphasis();
  }, 80);
}

if (diameterRangeEl) {
  diameterRangeEl.addEventListener('input', scheduleFilterUpdate);
  diameterRangeEl.addEventListener('change', scheduleFilterUpdate);
}

loadStructures();

loadGeoJson().catch((err) => {
  console.error(err);
  statusEl.textContent = 'Failed to load data';
  detailsEl.innerHTML = `<div class="hint">${escapeHtml(err.message)}</div>`;
});
