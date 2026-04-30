// State management
let currentJobId = null;
let processingInterval = null;
let lastJobSignature = null;
let lastJobSignatureAt = null;
let pollTimeoutId = null;
let activePollJobId = null;

// DOM Elements
const uploadSection = document.getElementById('uploadSection');
const previewSection = document.getElementById('previewSection');
const processingSection = document.getElementById('processingSection');
const resultSection = document.getElementById('resultSection');
const errorSection = document.getElementById('errorSection');
const recentJobsSection = document.getElementById('recentJobsSection');

const previewContainer = document.getElementById('previewContainer');
const approveBtn = document.getElementById('approveBtn');
const finalBtn = document.getElementById('finalBtn');
const regenerateBtn = document.getElementById('regenerateBtn');

const saveEditsBtn = document.getElementById('saveEditsBtn');
const previewSaveStatus = document.getElementById('previewSaveStatus');

const uploadForm = document.getElementById('uploadForm');
const fileInput = document.getElementById('fileInput');
const fileUploadLabel = document.querySelector('.file-upload-label');
const fileName = document.querySelector('.file-name');
const outputNameInput = document.getElementById('outputName');
const skipValidationInput = document.getElementById('skipValidation');
const generateBtn = document.getElementById('generateBtn');

const statusText = document.getElementById('statusText');
const progressFill = document.getElementById('progressFill');
const progressPercent = document.getElementById('progressPercent');

const resultFilename = document.getElementById('resultFilename');
const resultMetadata = document.getElementById('resultMetadata');
const downloadBtn = document.getElementById('downloadBtn');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');
const downloadTranscriptBtn = document.getElementById('downloadTranscriptBtn');
const newPresentationBtn = document.getElementById('newPresentationBtn');

const togglePreviewsBtn = document.getElementById('togglePreviewsBtn');
const previewsBody = document.getElementById('previewsBody');
const previewsHint = document.getElementById('previewsHint');
const generatePreviewsBtn = document.getElementById('generatePreviewsBtn');
const previewsStatus = document.getElementById('previewsStatus');
const previewsGrid = document.getElementById('previewsGrid');

const previewModal = document.getElementById('previewModal');
const previewModalBackdrop = document.getElementById('previewModalBackdrop');
const previewModalClose = document.getElementById('previewModalClose');
const previewModalPrev = document.getElementById('previewModalPrev');
const previewModalNext = document.getElementById('previewModalNext');
const previewModalImage = document.getElementById('previewModalImage');
const previewModalTitle = document.getElementById('previewModalTitle');
const previewModalCounter = document.getElementById('previewModalCounter');

const errorMessage = document.getElementById('errorMessage');
const retryBtn = document.getElementById('retryBtn');

const jobsList = document.getElementById('jobsList');

let currentSlidePlan = null;
let currentPreviewItems = [];
let currentPreviewIndex = -1;

function setPreviewModalOpen(isOpen) {
    if (!previewModal) return;
    if (isOpen) {
        previewModal.classList.remove('hidden');
        previewModal.setAttribute('aria-hidden', 'false');
    } else {
        previewModal.classList.add('hidden');
        previewModal.setAttribute('aria-hidden', 'true');
    }

}

function escapeForSvgText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeHexColor(value, fallback) {
    const v = String(value || '').trim();
    if (!v) return fallback;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
    if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`;
    return fallback;
}

function isDarkHex(hex) {
    const c = normalizeHexColor(hex, '#ffffff').replace('#', '');
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance < 0.5;
}

function pickTextColorForBg(bgHex) {
    return isDarkHex(bgHex) ? '#ffffff' : '#111827';
}

function getPlanTheme(plan) {
    const theme = plan?.presentationMetadata?.theme || {};
    return {
        primary: normalizeHexColor(theme.primaryColor, '#1D2D5C'),
        secondary: normalizeHexColor(theme.secondaryColor, '#2AADA6'),
        accent: normalizeHexColor(theme.accentColor, '#C09A45'),
        background: normalizeHexColor(theme.backgroundColor, '#ffffff'),
        fontFamily: String(theme.fontFamily || 'Inter').trim() || 'Inter'
    };
}

function normalizeBullets(content) {
    const raw = content?.bullets;
    if (!Array.isArray(raw)) return [];
    return raw
        .map(b => (typeof b === 'string' ? b : (b?.text ?? '')))
        .map(s => String(s).trim())
        .filter(Boolean);
}

function createMockPreviewSvgDataUri(slideDef, index, theme) {
    const w = 320;
    const h = 180;
    const pad = 16;

    const layout = String(slideDef?.layout || 'slide');
    const content = slideDef?.content || {};
    const title = String(content?.title || slideDef?.title || `Slide ${index + 1}`);
    const bullets = normalizeBullets(content).slice(0, 4);
    const cards = Array.isArray(content?.cards) ? content.cards.slice(0, 3) : [];
    const sectionTitle = String(content?.sectionTitle || '').trim();

    const th = theme || { primary: '#1D2D5C', secondary: '#2AADA6', accent: '#C09A45', background: '#ffffff', fontFamily: 'Inter' };
    const bg = th.background;
    const text = pickTextColorForBg(bg);
    const muted = isDarkHex(bg) ? 'rgba(255,255,255,0.75)' : 'rgba(15,23,42,0.65)';
    const border = isDarkHex(bg) ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)';

    const accent = th.accent;
    const primary = th.primary;
    const secondary = th.secondary;

    const safeTitle = escapeForSvgText(title.length > 54 ? title.slice(0, 54) + '…' : title);
    const safeSection = escapeForSvgText(sectionTitle.length > 36 ? sectionTitle.slice(0, 36) + '…' : sectionTitle);

    let bodyLines = '';
    const layoutLabel = escapeForSvgText(layout);

    if (layout === 'title-slide') {
        const subtitle = escapeForSvgText(String(content?.subtitle || '').slice(0, 60));
        bodyLines += `<circle cx="${w - 40}" cy="${36}" r="22" fill="${accent}" opacity="0.22"/>`;
        bodyLines += `<circle cx="${w - 18}" cy="${60}" r="10" fill="${secondary}" opacity="0.22"/>`;
        bodyLines += `<text x="${pad}" y="${96}" font-size="22" font-weight="900" fill="${text}">${safeTitle}</text>`;
        if (subtitle) {
            bodyLines += `<text x="${pad}" y="${118}" font-size="12" font-weight="600" fill="${muted}">${subtitle}</text>`;
        }
        const author = escapeForSvgText(String(content?.author || '').slice(0, 30));
        const date = escapeForSvgText(String(content?.date || '').slice(0, 30));
        const footer = [author, date].filter(Boolean).join(' • ');
        if (footer) {
            bodyLines += `<text x="${pad}" y="${154}" font-size="10" fill="${muted}">${footer}</text>`;
        }
    } else if (layout === 'section-header') {
        const big = safeSection || safeTitle;
        bodyLines += `<rect x="${pad}" y="${70}" width="${w - pad * 2}" height="${2}" fill="${accent}" opacity="0.75"/>`;
        bodyLines += `<text x="${pad}" y="${110}" font-size="20" font-weight="900" fill="${text}">${big}</text>`;
    } else if (layout === 'title-two-columns') {
        const left = content?.leftColumn || content?.left_column || {};
        const right = content?.rightColumn || content?.right_column || {};
        const leftTitle = escapeForSvgText(String(left?.title || 'Left').slice(0, 18));
        const rightTitle = escapeForSvgText(String(right?.title || 'Right').slice(0, 18));
        const leftBullets = (Array.isArray(left?.bullets) ? left.bullets : []).map(b => (typeof b === 'string' ? b : (b?.text ?? b))).map(s => String(s).trim()).filter(Boolean).slice(0, 3);
        const rightBullets = (Array.isArray(right?.bullets) ? right.bullets : []).map(b => (typeof b === 'string' ? b : (b?.text ?? b))).map(s => String(s).trim()).filter(Boolean).slice(0, 3);

        const colY = 70;
        const colH = 92;
        const gap = 12;
        const colW = (w - pad * 2 - gap) / 2;
        const leftX = pad;
        const rightX = pad + colW + gap;
        bodyLines += `<rect x="${leftX}" y="${colY}" width="${colW}" height="${colH}" rx="10" fill="rgba(255,255,255,0.9)" stroke="${border}"/>`;
        bodyLines += `<rect x="${rightX}" y="${colY}" width="${colW}" height="${colH}" rx="10" fill="rgba(255,255,255,0.9)" stroke="${border}"/>`;
        bodyLines += `<rect x="${leftX}" y="${colY}" width="${colW}" height="${6}" fill="${primary}" opacity="0.9"/>`;
        bodyLines += `<rect x="${rightX}" y="${colY}" width="${colW}" height="${6}" fill="${secondary}" opacity="0.9"/>`;
        bodyLines += `<text x="${leftX + 10}" y="${colY + 22}" font-size="11" font-weight="800" fill="#111827">${leftTitle}</text>`;
        bodyLines += `<text x="${rightX + 10}" y="${colY + 22}" font-size="11" font-weight="800" fill="#111827">${rightTitle}</text>`;
        let yL = colY + 40;
        for (const b of leftBullets) {
            bodyLines += `<text x="${leftX + 10}" y="${yL}" font-size="10" fill="#334155">• ${escapeForSvgText(String(b).slice(0, 18))}</text>`;
            yL += 14;
        }
        let yR = colY + 40;
        for (const b of rightBullets) {
            bodyLines += `<text x="${rightX + 10}" y="${yR}" font-size="10" fill="#334155">• ${escapeForSvgText(String(b).slice(0, 18))}</text>`;
            yR += 14;
        }
    } else if (layout === 'title-image-text') {
        const img = content?.image || {};
        const caption = escapeForSvgText(String(img?.caption || '').slice(0, 28));
        const imgX = pad;
        const imgY = 70;
        const imgW = 130;
        const imgH = 88;
        bodyLines += `<rect x="${imgX}" y="${imgY}" width="${imgW}" height="${imgH}" rx="10" fill="rgba(255,255,255,0.92)" stroke="${border}"/>`;
        bodyLines += `<path d="M ${imgX + 12} ${imgY + imgH - 18} L ${imgX + 44} ${imgY + 54} L ${imgX + 68} ${imgY + 72} L ${imgX + 92} ${imgY + 40} L ${imgX + imgW - 12} ${imgY + imgH - 18} Z" fill="${accent}" opacity="0.18"/>`;
        bodyLines += `<circle cx="${imgX + 34}" cy="${imgY + 30}" r="10" fill="${secondary}" opacity="0.22"/>`;
        if (caption) {
            bodyLines += `<text x="${imgX + 10}" y="${imgY + imgH + 14}" font-size="9" fill="${muted}">${caption}</text>`;
        }
        const textX = imgX + imgW + 12;
        const textY = 78;
        const textW = w - textX - pad;
        bodyLines += `<rect x="${textX}" y="${imgY}" width="${textW}" height="${imgH}" rx="10" fill="rgba(255,255,255,0.92)" stroke="${border}"/>`;
        const lines = bullets.length ? bullets : [String(content?.bodyText || '').trim()].filter(Boolean);
        let y = textY;
        for (const line of lines.slice(0, 5)) {
            bodyLines += `<text x="${textX + 10}" y="${y}" font-size="10" fill="#334155">• ${escapeForSvgText(String(line).slice(0, 26))}</text>`;
            y += 14;
        }
    } else if (layout === 'title-chart') {
        const chart = content?.chart || {};
        const labels = Array.isArray(chart?.data?.labels) ? chart.data.labels : [];
        const ds = Array.isArray(chart?.data?.datasets) ? chart.data.datasets : [];
        const vals = Array.isArray(ds?.[0]?.data) ? ds[0].data : [];
        const numbers = vals.map(v => Number(v)).filter(v => Number.isFinite(v));
        const hasData = numbers.length >= 2;
        const cx = pad;
        const cy = 70;
        const cw = w - pad * 2;
        const ch = 92;
        bodyLines += `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="10" fill="rgba(255,255,255,0.92)" stroke="${border}"/>`;
        const baseY = cy + ch - 18;
        bodyLines += `<line x1="${cx + 18}" y1="${baseY}" x2="${cx + cw - 12}" y2="${baseY}" stroke="${border}"/>`;
        bodyLines += `<line x1="${cx + 18}" y1="${cy + 12}" x2="${cx + 18}" y2="${baseY}" stroke="${border}"/>`;
        const count = Math.min(5, hasData ? numbers.length : 5);
        const max = hasData ? Math.max(...numbers.slice(0, count), 1) : 100;
        const barW = (cw - 40) / count - 8;
        for (let i = 0; i < count; i++) {
            const v = hasData ? numbers[i] : (20 + i * 12);
            const bh = Math.max(8, Math.round((v / max) * (ch - 34)));
            const bx = cx + 26 + i * (barW + 10);
            const by = baseY - bh;
            const col = i % 2 === 0 ? primary : accent;
            bodyLines += `<rect x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="5" fill="${col}" opacity="0.85"/>`;
            const lab = escapeForSvgText(String(labels[i] ?? '').slice(0, 6));
            if (lab) bodyLines += `<text x="${bx}" y="${baseY + 12}" font-size="8" fill="${muted}">${lab}</text>`;
        }
    } else if (layout === 'title-table') {
        const table = content?.table || {};
        const headers = Array.isArray(table?.headers) ? table.headers : [];
        const rows = Array.isArray(table?.rows) ? table.rows : [];
        const cols = Math.max(2, Math.min(4, headers.length || 3));
        const rowCount = Math.max(3, Math.min(5, rows.length || 4));
        const tx = pad;
        const ty = 70;
        const tw = w - pad * 2;
        const thh = 92;
        bodyLines += `<rect x="${tx}" y="${ty}" width="${tw}" height="${thh}" rx="10" fill="rgba(255,255,255,0.92)" stroke="${border}"/>`;
        const cellW = tw / cols;
        const cellH = thh / rowCount;
        bodyLines += `<rect x="${tx}" y="${ty}" width="${tw}" height="${cellH}" fill="${accent}" opacity="0.12"/>`;
        for (let c = 1; c < cols; c++) {
            bodyLines += `<line x1="${tx + c * cellW}" y1="${ty}" x2="${tx + c * cellW}" y2="${ty + thh}" stroke="${border}"/>`;
        }
        for (let r = 1; r < rowCount; r++) {
            bodyLines += `<line x1="${tx}" y1="${ty + r * cellH}" x2="${tx + tw}" y2="${ty + r * cellH}" stroke="${border}"/>`;
        }
        for (let c = 0; c < cols; c++) {
            const label = escapeForSvgText(String(headers[c] ?? `Col ${c + 1}`).slice(0, 10));
            bodyLines += `<text x="${tx + c * cellW + 8}" y="${ty + 14}" font-size="9" font-weight="800" fill="#334155">${label}</text>`;
        }
    } else if (layout === 'title-cards' && cards.length) {
        const boxY = 74;
        const boxH = 84;
        const gap = 10;
        const boxW = (w - pad * 2 - gap * 2) / 3;
        for (let i = 0; i < Math.min(3, cards.length); i++) {
            const cx = pad + i * (boxW + gap);
            const top = i % 2 === 0 ? primary : accent;
            bodyLines += `<rect x="${cx}" y="${boxY}" width="${boxW}" height="${boxH}" rx="10" fill="rgba(255,255,255,0.92)" stroke="${border}"/>`;
            bodyLines += `<rect x="${cx}" y="${boxY}" width="${boxW}" height="${6}" fill="${top}" opacity="0.9"/>`;
            const ct = escapeForSvgText(String(cards[i]?.title || '').slice(0, 16));
            const cb = escapeForSvgText(String(cards[i]?.body || '').slice(0, 30));
            bodyLines += `<text x="${cx + 10}" y="${boxY + 24}" font-size="11" font-weight="900" fill="#111827">${ct || 'Card'}</text>`;
            bodyLines += `<text x="${cx + 10}" y="${boxY + 44}" font-size="10" fill="#475569">${cb}</text>`;
        }
    } else if (layout === 'quote-slide') {
        const quote = content?.quote || {};
        const q = escapeForSvgText(String(quote?.text || '').slice(0, 90));
        const a = escapeForSvgText(String(quote?.author || '').slice(0, 28));
        const bx = pad;
        const by = 72;
        const bw = w - pad * 2;
        const bh = 86;
        bodyLines += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="12" fill="rgba(255,255,255,0.92)" stroke="${border}"/>`;
        bodyLines += `<text x="${bx + 12}" y="${by + 30}" font-size="26" font-weight="900" fill="${accent}" opacity="0.35">“</text>`;
        bodyLines += `<text x="${bx + 22}" y="${by + 38}" font-size="11" font-style="italic" fill="#334155">${q || 'Quote text'}</text>`;
        if (a) bodyLines += `<text x="${bx + 22}" y="${by + 66}" font-size="10" font-weight="700" fill="${muted}">— ${a}</text>`;
    } else if (layout === 'conclusion') {
        const takeaways = Array.isArray(content?.keyTakeaways) ? content.keyTakeaways : [];
        const lines = (takeaways.length ? takeaways : bullets).slice(0, 5);
        const bx = pad;
        const by = 72;
        const bw = w - pad * 2;
        const bh = 86;
        bodyLines += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="12" fill="rgba(255,255,255,0.92)" stroke="${border}"/>`;
        bodyLines += `<rect x="${bx}" y="${by}" width="${bw}" height="${6}" fill="${accent}" opacity="0.9"/>`;
        let y = by + 26;
        for (const line of lines) {
            bodyLines += `<text x="${bx + 12}" y="${y}" font-size="10" fill="#334155">• ${escapeForSvgText(String(line).slice(0, 42))}</text>`;
            y += 14;
        }
    } else if (layout === 'thank-you') {
        const big = safeTitle || 'Thank You';
        bodyLines += `<circle cx="${w - 46}" cy="${86}" r="34" fill="${accent}" opacity="0.14"/>`;
        bodyLines += `<circle cx="${w - 70}" cy="${118}" r="16" fill="${secondary}" opacity="0.14"/>`;
        bodyLines += `<text x="${pad}" y="${112}" font-size="26" font-weight="900" fill="${text}">${big}</text>`;
        const contact = escapeForSvgText(String(content?.subtitle || '').slice(0, 46));
        if (contact) bodyLines += `<text x="${pad}" y="${134}" font-size="11" fill="${muted}">${contact}</text>`;
    } else {
        const lines = bullets.length ? bullets : [String(content?.bodyText || content?.subtitle || '').trim()].filter(Boolean);
        const shown = lines.slice(0, 5);
        bodyLines += `<rect x="${pad}" y="${70}" width="${w - pad * 2}" height="${92}" rx="12" fill="rgba(255,255,255,0.92)" stroke="${border}"/>`;
        let y = 92;
        for (const line of shown) {
            const t = escapeForSvgText(String(line).slice(0, 44));
            bodyLines += `<text x="${pad + 12}" y="${y}" font-size="10" fill="#334155">• ${t}</text>`;
            y += 14;
        }
        if (!shown.length) {
            bodyLines += `<text x="${pad + 12}" y="${92}" font-size="10" fill="${muted}">(No content)</text>`;
        }
    }

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="${isDarkHex(bg) ? '#0b1220' : '#f8fafc'}"/>
    </linearGradient>
    <linearGradient id="hdr" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${primary}"/>
      <stop offset="1" stop-color="${accent}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${w}" height="${h}" rx="14" fill="url(#bg)"/>
  <rect x="0" y="0" width="${w}" height="10" fill="url(#hdr)"/>
  ${layout === 'title-slide' ? '' : `<text x="${pad}" y="34" font-family="${escapeForSvgText(th.fontFamily)}, Arial, sans-serif" font-size="14" font-weight="900" fill="${text}">${safeTitle}</text>`}
  ${layout === 'title-slide' ? '' : `<text x="${pad}" y="54" font-family="${escapeForSvgText(th.fontFamily)}, Arial, sans-serif" font-size="10" font-weight="800" fill="${muted}">${layoutLabel}</text>`}
  ${bodyLines}
  <text x="${w - pad}" y="${h - 12}" text-anchor="end" font-family="${escapeForSvgText(th.fontFamily)}, Arial, sans-serif" font-size="10" fill="${muted}">${index + 1}</text>
</svg>`;

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function renderMockPreviewsFromPlan(plan) {
    if (!previewsGrid) return;

    const slides = Array.isArray(plan?.slides) ? plan.slides : [];
    const theme = getPlanTheme(plan);
    previewsGrid.innerHTML = '';

    if (!slides.length) {
        if (previewsStatus) {
            previewsStatus.classList.add('error');
            previewsStatus.textContent = 'No slide plan available for mock previews.';
        }
        currentPreviewItems = [];
        return;
    }

    currentPreviewItems = slides.map((s, idx) => {
        return {
            filename: `slide-${String(idx + 1).padStart(3, '0')}.svg`,
            url: createMockPreviewSvgDataUri(s, idx, theme)
        };
    });

    if (previewsStatus) {
        previewsStatus.classList.remove('error');
        previewsStatus.textContent = `${slides.length} preview(s) ready`;
    }

    for (let idx = 0; idx < currentPreviewItems.length; idx++) {
        const p = currentPreviewItems[idx];
        const slide = slides[idx] || {};
        const title = String(slide?.content?.title || `Slide ${idx + 1}`);

        const card = document.createElement('div');
        card.className = 'preview-thumb';

        const badge = document.createElement('div');
        badge.className = 'preview-badge';
        badge.textContent = `Slide ${idx + 1}`;

        const img = document.createElement('img');
        img.loading = 'lazy';
        img.src = p.url;
        img.alt = p.filename;

        const label = document.createElement('div');
        label.className = 'preview-label';
        const name = document.createElement('span');
        name.textContent = title.length > 28 ? title.slice(0, 28) + '…' : title;
        const open = document.createElement('span');
        open.className = 'preview-open';
        open.textContent = '↗';
        label.appendChild(name);
        label.appendChild(open);

        card.appendChild(badge);
        card.appendChild(img);
        card.appendChild(label);

        card.onclick = () => {
            openPreviewModal(idx);
        };

        previewsGrid.appendChild(card);
    }
}

function renderPreviewModal() {
    if (!previewModalImage || currentPreviewIndex < 0 || currentPreviewIndex >= currentPreviewItems.length) return;

    const item = currentPreviewItems[currentPreviewIndex];
    previewModalImage.src = item.url;

    if (previewModalTitle) previewModalTitle.textContent = 'Slide Preview';
    if (previewModalCounter) previewModalCounter.textContent = `${currentPreviewIndex + 1} / ${currentPreviewItems.length}`;

    if (previewModalPrev) previewModalPrev.disabled = currentPreviewIndex <= 0;
    if (previewModalNext) previewModalNext.disabled = currentPreviewIndex >= currentPreviewItems.length - 1;
}

function openPreviewModal(index) {
    if (!previewModal) {
        const item = currentPreviewItems[index];
        if (item?.url) window.open(item.url, '_blank');
        return;
    }
    currentPreviewIndex = index;
    setPreviewModalOpen(true);
    renderPreviewModal();
}

function closePreviewModal() {
    currentPreviewIndex = -1;
    setPreviewModalOpen(false);
}

function nextPreview() {
    if (currentPreviewIndex < currentPreviewItems.length - 1) {
        currentPreviewIndex++;
        renderPreviewModal();
    }
}

function prevPreview() {
    if (currentPreviewIndex > 0) {
        currentPreviewIndex--;
        renderPreviewModal();
    }
}

if (previewModalBackdrop) {
    previewModalBackdrop.addEventListener('click', closePreviewModal);
}

if (previewModalClose) {
    previewModalClose.addEventListener('click', closePreviewModal);
}

if (previewModalNext) {
    previewModalNext.addEventListener('click', nextPreview);
}

if (previewModalPrev) {
    previewModalPrev.addEventListener('click', prevPreview);
}

document.addEventListener('keydown', (e) => {
    if (!previewModal || previewModal.classList.contains('hidden')) return;
    if (e.key === 'Escape') closePreviewModal();
    if (e.key === 'ArrowRight') nextPreview();
    if (e.key === 'ArrowLeft') prevPreview();
});

// File input handling
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        fileName.textContent = file.name;
        fileName.style.display = 'block';
        fileUploadLabel.style.borderColor = 'var(--primary)';
        fileUploadLabel.style.background = '#eff6ff';

        // Auto-fill output name from filename
        if (!outputNameInput.value) {
            const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
            outputNameInput.value = nameWithoutExt;
        }
    }
});

// Drag and drop
fileUploadLabel.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUploadLabel.style.borderColor = 'var(--primary)';
    fileUploadLabel.style.background = '#eff6ff';
});

fileUploadLabel.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (!fileInput.files[0]) {
        fileUploadLabel.style.borderColor = 'var(--border)';
        fileUploadLabel.style.background = 'var(--bg)';
    }
});

fileUploadLabel.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        fileInput.files = files;
        fileInput.dispatchEvent(new Event('change'));
    }
});

// Form submission
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await generatePresentation();
});

// Generate presentation
async function generatePresentation() {
    // Get selected mode
    const selectedMode = document.querySelector('input[name="generationMode"]:checked')?.value || 'pdf-to-ppt';

    // Handle PPT-to-Video mode separately
    if (selectedMode === 'ppt-to-video') {
        await generateVideoFromPPT();
        return;
    }

    // For PDF modes (pdf-to-ppt or pdf-to-both)
    const file = fileInput.files[0];
    if (!file) {
        showError('Please select a file');
        return;
    }

    // Validate file type
    const validExtensions = ['pdf', 'docx', 'tex'];
    const fileExt = file.name.split('.').pop().toLowerCase();
    if (!validExtensions.includes(fileExt)) {
        showError(`Invalid file type. Supported formats: ${validExtensions.join(', ')}`);
        return;
    }

    // Validate file size (50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
        showError('File size exceeds 50MB limit');
        return;
    }

    showSection('processing');
    updateProgress(0, 'Uploading document...');
    setProcessingStep(1, 'active');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('output_name', outputNameInput.value || file.name.replace(/\.[^/.]+$/, ''));
    formData.append('skip_validation', skipValidationInput.checked ? 'true' : 'false');
    formData.append('template_style', document.getElementById('templateStyle').value);
    formData.append('color_scheme', document.getElementById('colorScheme').value);
    formData.append('generation_mode', selectedMode);

    // Video generation parameters (only for pdf-to-both mode)
    if (selectedMode === 'pdf-to-both') {
        formData.append('avatar_choice', document.getElementById('avatarChoice').value);
        formData.append('voice_choice', document.getElementById('voiceChoice').value);
        formData.append('avatar_position', document.getElementById('avatarPosition').value);

        const speakerChoice = document.getElementById('speakerChoice');
        if (speakerChoice && speakerChoice.value) {
            formData.append('speaker_choice', speakerChoice.value);
        }

        console.log('Form data being sent (PDF to Both):');
        console.log('  avatar_choice:', document.getElementById('avatarChoice').value);
        console.log('  voice_choice:', document.getElementById('voiceChoice').value);
        console.log('  avatar_position:', document.getElementById('avatarPosition').value);
        console.log('  speaker_choice:', speakerChoice ? speakerChoice.value : 'none');
    }

    try {
        updateProgress(5, 'Uploading...');

        const response = await fetch('/api/generate', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Generation failed');
        }

        const result = await response.json();

        if (result.job_id) {
            // Job queued successfully, start polling
            currentJobId = result.job_id;
            await pollJobStatus(result.job_id);
        } else {
            throw new Error('No job ID returned');
        }

    } catch (error) {
        console.error('Error:', error);
        showError(error.message || 'Failed to generate presentation. Please try again.');
    }
}

// Generate video from existing PPT
async function generateVideoFromPPT() {
    const pptFile = document.getElementById('pptFileInput').files[0];
    const transcriptFile = document.getElementById('transcriptFileInput').files[0];

    if (!pptFile || !transcriptFile) {
        showError('Please select both PowerPoint and transcript files');
        return;
    }

    // Validate PPT file type
    const pptExt = pptFile.name.split('.').pop().toLowerCase();
    if (pptExt !== 'pptx') {
        showError('Invalid PowerPoint file. Only .pptx format is supported');
        return;
    }

    // Validate transcript file type
    const transcriptExt = transcriptFile.name.split('.').pop().toLowerCase();
    if (transcriptExt !== 'txt') {
        showError('Invalid transcript file. Only .txt format is supported');
        return;
    }

    showSection('processing');
    updateProgress(0, 'Uploading files...');
    setProcessingStep(1, 'active');

    const formData = new FormData();
    formData.append('pptx_file', pptFile);
    formData.append('transcript_file', transcriptFile);
    formData.append('avatar_choice', document.getElementById('avatarChoice').value);
    formData.append('voice_choice', document.getElementById('voiceChoice').value);
    formData.append('avatar_position', document.getElementById('avatarPosition').value);

    const speakerChoice = document.getElementById('speakerChoice');
    if (speakerChoice && speakerChoice.value) {
        formData.append('speaker_choice', speakerChoice.value);
    }

    console.log('PPT to Video - Form data being sent:');
    console.log('  pptx_file:', pptFile.name);
    console.log('  transcript_file:', transcriptFile.name);
    console.log('  avatar_choice:', document.getElementById('avatarChoice').value);
    console.log('  voice_choice:', document.getElementById('voiceChoice').value);

    try {
        updateProgress(5, 'Uploading...');

        const response = await fetch('/api/generate-video', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Video generation failed');
        }

        const result = await response.json();

        if (result.job_id) {
            currentJobId = result.job_id;
            // Skip to video generation steps immediately
            showVideoSteps();
            updateProgress(70, 'Starting video generation...');
            setProcessingStep(1, 'completed');
            setProcessingStep(2, 'completed');
            setProcessingStep(3, 'completed');
            await pollJobStatus(result.job_id);
        } else {
            throw new Error('No job ID returned');
        }

    } catch (error) {
        console.error('Error:', error);
        showError(error.message || 'Failed to generate video. Please try again.');
    }
}

// Poll job status until complete
async function pollJobStatus(jobId) {
    const pollInterval = 1000; // Poll every 1 second
    const maxAttempts = 7200; // Max 120 minutes (2 hours) for long video generation
    let attempts = 0;

    activePollJobId = jobId;

    return await new Promise((resolve, reject) => {
        const poll = async () => {
            try {
                const response = await fetch(`/api/job/${jobId}`);
                if (!response.ok) {
                    throw new Error('Failed to get job status');
                }

                const job = await response.json();

            // Frontend watchdog: detect stalled state (no change for extended time)
            // Video generation can take longer, so use different timeouts
            const signature = `${job.status}|${job.progress || 0}|${job.step || ''}|${job.last_updated || ''}`;
            const now = Date.now();

            // Determine timeout based on current status
            let stallTimeout = 15 * 60 * 1000; // Default: 15 minutes
            if (job.status === 'video_generation') {
                stallTimeout = 45 * 60 * 1000; // 45 minutes for video generation (avatar animation is slow)
            } else if (job.status === 'generating') {
                stallTimeout = 25 * 60 * 1000; // 25 minutes for PPT generation
            }

            if (lastJobSignature !== signature) {
                lastJobSignature = signature;
                lastJobSignatureAt = now;
            } else if (lastJobSignatureAt && (now - lastJobSignatureAt) > stallTimeout) {
                const minutes = Math.floor(stallTimeout / 60000);
                throw new Error(`Job appears stalled (no status change for ${minutes} minutes). Please check logs or restart the generation.`);
            }

            // Update UI based on job status
            if (job.status === 'parsing') {
                updateProgress(job.progress || 10, 'Parsing document...');
                setProcessingStep(1, 'active');
            } else if (job.status === 'analyzing') {
                updateProgress(job.progress || 40, 'AI analyzing content...');
                setProcessingStep(1, 'completed');
                setProcessingStep(2, 'active');
            } else if (job.status === 'awaiting_approval') {
                // Show preview
                updateProgress(50, 'Preview ready!');
                setProcessingStep(2, 'completed');
                await delay(500);
                showPreview(job);
                resolve(job);
                return;
            } else if (job.status === 'generating') {
                updateProgress(job.progress || 70, 'Generating PowerPoint...');
                setProcessingStep(2, 'completed');
                setProcessingStep(3, 'active');
            } else if (job.status === 'awaiting_avatar_positioning') {
                // Show avatar positioning screen
                updateProgress(job.progress || 72, 'Slides converted - Position avatar');
                setProcessingStep(3, 'completed');
                setProcessingStep(4, 'completed');
                await delay(500);

                // Get slide images and avatar
                const slideUrls = job.slide_images || [];
                const avatarUrl = job.avatar_url || '/api/avatars/' + (job.avatar_choice || 'avatar_woman.png');

                showAvatarPositioning(job.job_id, slideUrls, avatarUrl);
                resolve(job);
                return;
            } else if (job.status === 'video_generation') {
                // Show video steps
                showVideoSteps();
                setProcessingStep(3, 'completed');

                // Update video generation progress based on job.progress
                const progress = job.progress || 70;
                let statusMessage = 'Generating video...';

                if (progress < 72) {
                    // Step 4: Converting to images
                    setProcessingStep(4, 'active');
                    statusMessage = job.step || 'Converting slides to images...';
                } else if (progress < 80) {
                    // Step 5: Generating audio
                    setProcessingStep(4, 'completed');
                    setProcessingStep(5, 'active');
                    statusMessage = job.step || 'Generating voice narration...';
                } else if (progress < 88) {
                    // Step 6: Animating avatar
                    setProcessingStep(4, 'completed');
                    setProcessingStep(5, 'completed');
                    setProcessingStep(6, 'active');
                    statusMessage = job.step || 'Animating avatar with audio...';
                } else if (progress < 95) {
                    // Step 7: Composing video
                    setProcessingStep(4, 'completed');
                    setProcessingStep(5, 'completed');
                    setProcessingStep(6, 'completed');
                    setProcessingStep(7, 'active');
                    statusMessage = job.step || 'Composing final video...';
                } else {
                    // Almost done
                    setProcessingStep(4, 'completed');
                    setProcessingStep(5, 'completed');
                    setProcessingStep(6, 'completed');
                    setProcessingStep(7, 'active');
                    statusMessage = 'Finalizing video...';
                }

                updateProgress(progress, statusMessage);
            } else if (job.status === 'video_generation_failed') {
                // Video generation failed but PPT is available
                setProcessingStep(7, 'completed');
                updateProgress(100, 'PowerPoint completed. Video generation failed.');
                await delay(500);
                showResult(job);
                if (job.video_error) {
                    console.warn('Video generation error:', job.video_error);
                }
                resolve(job);
                return;
            } else if (job.status === 'completed') {
                // Success!
                updateProgress(100, 'Complete!');
                setProcessingStep(3, 'completed');
                await delay(500);
                showResult(job);
                resolve(job);
                return;
            } else if (job.status === 'failed') {
                throw new Error(job.error || 'Generation failed');
            }

            // Continue polling
            attempts++;
            if (attempts < maxAttempts) {
                pollTimeoutId = setTimeout(poll, pollInterval);
            } else {
                // Max attempts reached - check one more time if job completed
                console.log('Max polling attempts reached, checking final status...');
                try {
                    const finalCheck = await fetch(`/api/job/${jobId}`);
                    const finalJob = await finalCheck.json();
                    if (finalJob.status === 'completed') {
                        console.log('Job completed! Showing result.');
                        showResult(finalJob);
                        resolve(finalJob);
                        return;
                    } else if (finalJob.status === 'video_generation_failed') {
                        showResult(finalJob);
                        resolve(finalJob);
                        return;
                    }
                } catch (e) {
                    console.error('Final check error:', e);
                }
                // If still not complete, show timeout error with job ID
                throw new Error(`Generation is taking longer than expected (>2 hours). Job ID: ${jobId}. Please refresh the page or check /api/job/${jobId} to see if it completed.`);
            }

        } catch (error) {
            console.error('Polling error:', error);
            reject(error);
        }

        };

        // Start polling
        lastJobSignature = null;
        lastJobSignatureAt = null;
        poll();
    });
}

function resetActionButtons() {
    if (approveBtn) {
        approveBtn.disabled = false;
        approveBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            Generate PowerPoint (Fast)
        `;
    }
    if (finalBtn) {
        finalBtn.disabled = false;
        finalBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 6L9 17l-5-5"/>
            </svg>
            Generate Final (With Auto-Fix)
        `;
    }
}

// Show different sections
function showSection(section) {
    uploadSection.classList.add('hidden');
    previewSection.classList.add('hidden');
    processingSection.classList.add('hidden');
    resultSection.classList.add('hidden');
    errorSection.classList.add('hidden');

    switch (section) {
        case 'upload':
            uploadSection.classList.remove('hidden');
            break;
        case 'preview':
            previewSection.classList.remove('hidden');
            break;
        case 'processing':
            processingSection.classList.remove('hidden');
            resetProcessingSteps();
            break;
        case 'result':
            resultSection.classList.remove('hidden');
            break;
        case 'error':
            errorSection.classList.remove('hidden');
            break;
    }
}

// Update progress
function updateProgress(percent, text) {
    progressFill.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    if (text) {
        statusText.textContent = text;
    }
}

// Processing steps
function resetProcessingSteps() {
    for (let i = 1; i <= 7; i++) {
        const step = document.getElementById(`step${i}`);
        if (step) {
            step.classList.remove('active', 'completed');
            // Hide video steps initially
            if (i >= 4) {
                step.style.display = 'none';
            }
        }
    }
}

function showVideoSteps() {
    // Show video generation steps
    for (let i = 4; i <= 7; i++) {
        const step = document.getElementById(`step${i}`);
        if (step) {
            step.style.display = 'flex';
        }
    }
}

function setProcessingStep(stepNum, state) {
    const step = document.getElementById(`step${stepNum}`);
    if (!step) return;

    step.classList.remove('active', 'completed');
    if (state) {
        step.classList.add(state);
    }
}

// Show result
function showResult(result) {
    currentJobId = result.job_id;

    resultFilename.textContent = result.output_file;

    // Show warning if video generation failed
    if (result.video_error) {
        const warningDiv = document.createElement('div');
        warningDiv.className = 'result-warning';
        warningDiv.style.cssText = 'background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 1rem; margin-bottom: 1rem;';
        warningDiv.innerHTML = `
            <strong style="color: #92400e;">⚠️ Video Generation Failed</strong>
            <p style="color: #78350f; margin-top: 0.5rem; font-size: 0.875rem;">
                Your PowerPoint was generated successfully, but video creation encountered an error.
                You can still download the PPT file below.
            </p>
        `;
        resultMetadata.insertBefore(warningDiv, resultMetadata.firstChild);
    }

    // Set download button
    downloadBtn.href = result.download_url;
    downloadBtn.download = result.output_file;

    // Mock slide previews (instant, no PPTX->PDF conversion)
    if (previewsBody && togglePreviewsBtn && previewsGrid) {
        previewsBody.classList.remove('hidden');
        togglePreviewsBtn.textContent = 'Hide';
        previewsGrid.innerHTML = '';
        if (previewsStatus) {
            previewsStatus.textContent = '';
            previewsStatus.classList.remove('error');
        }
        if (previewsHint) previewsHint.classList.add('hidden');

        const plan = (result?.metadata && result.metadata['slide-plan']) ? result.metadata['slide-plan'] : currentSlidePlan;
        renderMockPreviewsFromPlan(plan);
    }

    // Set PDF download button
    if (downloadPdfBtn) {
        downloadPdfBtn.href = `/api/job/${result.job_id}/pdf`;
        downloadPdfBtn.download = (result.output_file || 'presentation.pptx').replace(/\.pptx$/i, '.pdf');
        downloadPdfBtn.onclick = async (e) => {
            // We keep a normal href so it works without JS, but with JS we can show a nice error.
            e.preventDefault();

            const jobId = currentJobId || result.job_id;
            if (!jobId) {
                showError('No job id available for PDF download');
                return;
            }

            try {
                const url = `/api/job/${jobId}/pdf`;
                const resp = await fetch(url);
                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({}));
                    throw new Error(err.error || 'Failed to generate PDF');
                }
                const blob = await resp.blob();
                const objectUrl = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = objectUrl;
                a.download = ((result.output_file || 'presentation.pptx').replace(/\.pptx$/i, '')) + '.pdf';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(objectUrl);
            } catch (e) {
                showError(e.message || 'Failed to download PDF');
            }
        };
    }

    // Set Transcript download button
    if (downloadTranscriptBtn) {
        downloadTranscriptBtn.href = `/api/job/${result.job_id}/transcript`;
        downloadTranscriptBtn.download = (result.output_file || 'presentation.pptx')
            .replace(/\.pptx$/i, '') + '_transcript.txt';
        downloadTranscriptBtn.onclick = async (e) => {
            e.preventDefault();

            const jobId = currentJobId || result.job_id;
            if (!jobId) {
                showError('No job id available for transcript download');
                return;
            }

            try {
                const url = `/api/job/${jobId}/transcript`;
                const resp = await fetch(url);
                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({}));
                    throw new Error(err.error || 'Failed to fetch transcript');
                }
                const blob = await resp.blob();
                const objectUrl = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = objectUrl;
                a.download = ((result.output_file || 'presentation.pptx').replace(/\.pptx$/i, '')) + '_transcript.txt';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(objectUrl);
            } catch (e) {
                showError(e.message || 'Failed to download transcript');
            }
        };
    }

    // Set Video download button (if video was generated)
    const downloadVideoBtn = document.getElementById('downloadVideoBtn');
    if (downloadVideoBtn) {
        if (result.video_url) {
            downloadVideoBtn.classList.remove('hidden');
            downloadVideoBtn.href = result.video_url;
            downloadVideoBtn.download = result.video_file || 'presentation_video.mp4';
        } else {
            downloadVideoBtn.classList.add('hidden');
        }
    }

    // Display metadata
    if (result.metadata) {
        let metadataHTML = '';

        if (result.metadata['slide-plan']) {
            const plan = result.metadata['slide-plan'];
            metadataHTML += `
                <div class="metadata-item">
                    <span class="metadata-label">Total Slides:</span>
                    <span class="metadata-value">${plan.presentationMetadata?.totalSlides || plan.slides?.length || 'N/A'}</span>
                </div>
            `;

            if (plan.presentationMetadata?.title) {
                metadataHTML += `
                    <div class="metadata-item">
                        <span class="metadata-label">Title:</span>
                        <span class="metadata-value">${plan.presentationMetadata.title}</span>
                    </div>
                `;
            }
        }

        if (result.metadata['validation-report']) {
            const report = result.metadata['validation-report'];
            metadataHTML += `
                <div class="metadata-item">
                    <span class="metadata-label">Validation Status:</span>
                    <span class="metadata-value">${report.overallStatus}</span>
                </div>
            `;
        }

        resultMetadata.innerHTML = metadataHTML || '<p class="no-jobs">No metadata available</p>';
    }

    showSection('result');
    loadRecentJobs();
}

async function loadSlidePreviews(jobId) {
    if (!previewsGrid) return;
    if (previewsStatus) {
        previewsStatus.classList.remove('error');
        previewsStatus.textContent = 'Loading previews...';
    }

    try {
        const resp = await fetch(`/api/job/${jobId}/previews`);
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to load previews');
        }

        const data = await resp.json();
        const previews = data.previews || [];
        currentPreviewItems = previews;

        previewsGrid.innerHTML = '';

        if (!previews.length) {
            if (previewsStatus) previewsStatus.textContent = 'No thumbnails yet.';
            return;
        }

        if (previewsStatus) previewsStatus.textContent = `${previews.length} thumbnail(s) ready`;
        for (let idx = 0; idx < previews.length; idx++) {
            const p = previews[idx];
            const card = document.createElement('div');
            card.className = 'preview-thumb';

            const badge = document.createElement('div');
            badge.className = 'preview-badge';
            badge.textContent = `Slide ${idx + 1}`;

            const img = document.createElement('img');
            img.loading = 'lazy';
            img.src = p.url;
            img.alt = p.filename;

            const label = document.createElement('div');
            label.className = 'preview-label';
            const name = document.createElement('span');
            name.textContent = p.filename.replace(/\.(png|jpg|jpeg)$/i, '');
            const open = document.createElement('span');
            open.className = 'preview-open';
            open.textContent = '↗';
            label.appendChild(name);
            label.appendChild(open);

            card.appendChild(badge);
            card.appendChild(img);
            card.appendChild(label);

            card.onclick = () => {
                openPreviewModal(idx);
            };

            previewsGrid.appendChild(card);
        }
    } catch (e) {
        if (previewsStatus) {
            previewsStatus.classList.add('error');
            previewsStatus.textContent = e.message || 'Failed to load previews';
        }
    }
}

async function generateSlidePreviews(jobId) {
    if (!jobId) return;

    if (generatePreviewsBtn) generatePreviewsBtn.disabled = true;
    if (previewsStatus) {
        previewsStatus.classList.remove('error');
        previewsStatus.textContent = 'Generating thumbnails...';
    }

    try {
        const resp = await fetch(`/api/job/${jobId}/previews/generate`, {
            method: 'POST'
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to generate thumbnails');
        }

        await loadSlidePreviews(jobId);
        if (previewsHint) previewsHint.classList.add('hidden');
    } catch (e) {
        if (previewsStatus) {
            previewsStatus.classList.add('error');
            previewsStatus.textContent = e.message || 'Failed to generate thumbnails';
        }
    } finally {
        if (generatePreviewsBtn) generatePreviewsBtn.disabled = false;
    }
}

if (togglePreviewsBtn && previewsBody) {
    togglePreviewsBtn.addEventListener('click', () => {
        const willShow = previewsBody.classList.contains('hidden');
        if (willShow) {
            previewsBody.classList.remove('hidden');
            togglePreviewsBtn.textContent = 'Hide';
        } else {
            previewsBody.classList.add('hidden');
            togglePreviewsBtn.textContent = 'Show';
        }
    });
}

// Note: Real PPTX/PDF thumbnails are not required for mock previews.
// The legacy generate button (if present) is intentionally not wired.

// Show error
function showError(message) {
    errorMessage.textContent = message;
    showSection('error');
}

// Reset form
function resetForm() {
    activePollJobId = null;
    if (pollTimeoutId) {
        clearTimeout(pollTimeoutId);
        pollTimeoutId = null;
    }
    currentJobId = null;
    lastJobSignature = null;
    lastJobSignatureAt = null;
    resetActionButtons();

    uploadForm.reset();
    fileName.style.display = 'none';
    fileName.textContent = '';
    fileUploadLabel.style.borderColor = 'var(--border)';
    fileUploadLabel.style.background = 'var(--bg)';
    outputNameInput.value = '';
    showSection('upload');
}

// Event listeners
newPresentationBtn.addEventListener('click', resetForm);
retryBtn.addEventListener('click', resetForm);

// Load recent jobs
async function loadRecentJobs() {
    try {
        const response = await fetch('/api/jobs');
        if (!response.ok) return;

        const data = await response.json();

        if (!data.jobs || data.jobs.length === 0) {
            jobsList.innerHTML = '<p class="no-jobs">No presentations generated yet</p>';
            return;
        }

        const jobsHTML = data.jobs.slice(0, 5).map(job => {
            const pptxFile = job.pptx_files[0] || 'presentation.pptx';
            const date = new Date(job.created_at);
            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
            const hasSlides = job.has_slide_plan || false;

            return `
                <div class="job-item" data-job-id="${job.job_id}">
                    <div class="job-info">
                        <div class="job-name">${pptxFile}</div>
                        <div class="job-date">${dateStr}</div>
                    </div>
                    <div class="job-actions">
                        ${hasSlides ? `
                        <button class="job-edit-btn" onclick="loadJobForEdit('${job.job_id}')" title="View & Edit Slides">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                            Edit
                        </button>
                        ` : ''}
                        <a href="/api/download/${job.job_id}/${pptxFile}"
                           download="${pptxFile}"
                           class="job-download">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            Download
                        </a>
                    </div>
                </div>
            `;
        }).join('');

        jobsList.innerHTML = jobsHTML;

    } catch (error) {
        console.error('Failed to load recent jobs:', error);
    }
}

// Load a job for editing
async function loadJobForEdit(jobId) {
    try {
        console.log('Loading job for edit:', jobId);

        // Show loading state
        showSection('processing');
        statusText.textContent = 'Loading presentation...';
        progressFill.style.width = '50%';
        progressPercent.textContent = '50%';

        // Fetch job details
        const response = await fetch(`/api/job/${jobId}`);
        if (!response.ok) {
            throw new Error('Failed to load job');
        }

        const jobData = await response.json();
        console.log('Job data:', jobData);

        // Check for slide plan in metadata or files
        let slidePlan = null;

        if (jobData.slide_plan) {
            slidePlan = jobData.slide_plan;
        } else if (jobData.metadata && jobData.metadata['slide-plan']) {
            slidePlan = jobData.metadata['slide-plan'];
        } else {
            // Try to fetch slide plan directly
            const planResponse = await fetch(`/api/job/${jobId}/slide-plan-data`);
            if (planResponse.ok) {
                slidePlan = await planResponse.json();
            }
        }

        if (!slidePlan || !slidePlan.slides) {
            throw new Error('No slide plan found for this job');
        }

        // Set current job
        currentJobId = jobId;
        currentSlidePlan = slidePlan;

        // Show the preview section with slides
        showPreview({ job_id: jobId, slide_plan: slidePlan });

        // Load preview images if available
        loadJobPreviews(jobId);

    } catch (error) {
        console.error('Failed to load job:', error);
        showSection('error');
        errorMessage.textContent = `Failed to load presentation: ${error.message}`;
    }
}

// Load preview images for a job
async function loadJobPreviews(jobId) {
    try {
        const response = await fetch(`/api/job/${jobId}/previews`);
        if (!response.ok) return;

        const data = await response.json();
        if (data.previews && data.previews.length > 0) {
            // Show previews section
            if (previewsBody) {
                previewsBody.classList.remove('collapsed');
            }

            // Display preview images
            const previewsHTML = data.previews.map((preview, index) => `
                <div class="preview-thumb" data-index="${index}" onclick="openPreviewModal(${index})">
                    <img src="/api/job/${jobId}/previews/${preview}" alt="Slide ${index + 1}" loading="lazy">
                    <div class="preview-number">${index + 1}</div>
                </div>
            `).join('');

            if (previewsGrid) {
                previewsGrid.innerHTML = previewsHTML;
                currentPreviewItems = data.previews.map(p => `/api/job/${jobId}/previews/${p}`);
            }
        }
    } catch (error) {
        console.error('Failed to load previews:', error);
    }
}

// Show preview
function showPreview(job) {
    showSection('preview');

    if (job.slide_plan && job.slide_plan.slides) {
        currentSlidePlan = job.slide_plan;
        displaySlides(job.slide_plan);

        // Set up approve button
        approveBtn.onclick = async () => {
            await saveEdits(job.job_id);
            await continueGeneration(job.job_id, { skip_validation: true });
        };

        // Set up final button (validation + auto-fix)
        finalBtn.onclick = async () => {
            await saveEdits(job.job_id);
            await continueGeneration(job.job_id, { skip_validation: false });
        };

        // Save edits button
        saveEditsBtn.onclick = async () => {
            await saveEdits(job.job_id);
        };

        // Set up regenerate button
        regenerateBtn.onclick = () => {
            showSection('upload');
            currentJobId = null;
        };
    }
}

// Display slides in preview
function displaySlides(slidePlan) {
    const slides = slidePlan.slides || [];

    const layoutOptions = [
        'title-slide', 'section-header', 'title-bullets',
        'title-two-columns', 'title-image-text', 'title-chart',
        'title-table', 'title-cards', 'quote-slide',
        'conclusion', 'thank-you'
    ];

    const slidesHTML = slides.map((slide, index) => {
        const slideNum = index + 1;
        const layout = slide.layout || 'unknown';
        const content = slide.content || {};

        const titleValue = content.title || content.sectionTitle || '';
        const bulletsValue = (content.bullets && Array.isArray(content.bullets))
            ? content.bullets.map(b => typeof b === 'string' ? b : (b.text || '')).join('\n')
            : '';
        const keyTakeawaysValue = (content.keyTakeaways && Array.isArray(content.keyTakeaways))
            ? content.keyTakeaways.join('\n')
            : '';
        const notesValue = slide.speakerNotes || '';

        const layoutSelect = `
            <label class="edit-label">Layout</label>
            <select class="edit-input" data-slide-index="${index}" data-field="layout">
                ${layoutOptions.map(opt => `<option value="${opt}" ${opt === layout ? 'selected' : ''}>${opt}</option>`).join('')}
            </select>
        `;

        const titleEditor = `
            <label class="edit-label">Title</label>
            <input class="edit-input" type="text" data-slide-index="${index}" data-field="title" value="${escapeHtml(titleValue)}" />
        `;

        const bulletsEditor = `
            <label class="edit-label">Bullets (one per line)</label>
            <textarea class="edit-textarea" rows="6" data-slide-index="${index}" data-field="bullets">${escapeHtml(bulletsValue)}</textarea>
        `;

        const takeawaysEditor = `
            <label class="edit-label">Key Takeaways (one per line)</label>
            <textarea class="edit-textarea" rows="5" data-slide-index="${index}" data-field="keyTakeaways">${escapeHtml(keyTakeawaysValue)}</textarea>
        `;

        const notesEditor = `
            <label class="edit-label">Speaker Notes</label>
            <textarea class="edit-textarea" rows="4" data-slide-index="${index}" data-field="speakerNotes">${escapeHtml(notesValue)}</textarea>
        `;

        let editorHTML = layoutSelect + titleEditor;
        if (layout === 'conclusion') {
            editorHTML += takeawaysEditor;
        } else {
            editorHTML += bulletsEditor;
        }
        editorHTML += notesEditor;

        return `
            <div class="slide-preview">
                <div class="slide-header">
                    <span class="slide-number">Slide ${slideNum}</span>
                    <span class="slide-layout">${layout}</span>
                </div>
                <div class="slide-content">
                    ${editorHTML}
                </div>
            </div>
        `;
    }).join('');

    previewContainer.innerHTML = slidesHTML || '<p>No slides found</p>';
}

function setSaveStatus(text, isError) {
    if (!previewSaveStatus) return;
    previewSaveStatus.textContent = text;
    previewSaveStatus.classList.remove('error');
    if (isError) previewSaveStatus.classList.add('error');
}

function collectEditedSlidePlan() {
    if (!currentSlidePlan || !currentSlidePlan.slides) return null;
    const plan = JSON.parse(JSON.stringify(currentSlidePlan));

    const fields = previewContainer.querySelectorAll('[data-slide-index][data-field]');
    fields.forEach(el => {
        const index = parseInt(el.getAttribute('data-slide-index'), 10);
        const field = el.getAttribute('data-field');
        if (!plan.slides[index]) return;

        const slide = plan.slides[index];
        slide.content = slide.content || {};

        const value = (el.value !== undefined) ? el.value : '';

        if (field === 'layout') {
            slide.layout = value;
        }

        if (field === 'title') {
            if (slide.layout === 'section-header') {
                slide.content.sectionTitle = value;
            } else {
                slide.content.title = value;
            }
        }

        if (field === 'bullets') {
            const lines = String(value).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            slide.content.bullets = lines.map(t => ({ text: t }));
        }

        if (field === 'keyTakeaways') {
            const lines = String(value).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            slide.content.keyTakeaways = lines;
        }

        if (field === 'speakerNotes') {
            slide.speakerNotes = value;
        }
    });

    return plan;
}

async function saveEdits(jobId) {
    const editedPlan = collectEditedSlidePlan();
    if (!editedPlan) return;

    try {
        saveEditsBtn.disabled = true;
        setSaveStatus('Saving...', false);

        const response = await fetch(`/api/job/${jobId}/slide-plan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ slide_plan: editedPlan })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to save edits');
        }

        const data = await response.json();
        if (data.slide_plan) {
            currentSlidePlan = data.slide_plan;
        }

        setSaveStatus('Saved', false);
        setTimeout(() => setSaveStatus('', false), 1500);
    } catch (e) {
        setSaveStatus(e.message || 'Save failed', true);
    } finally {
        saveEditsBtn.disabled = false;
    }
}

// Continue generation from preview
async function continueGeneration(jobId, options) {
    try {
        approveBtn.disabled = true;
        finalBtn.disabled = true;
        approveBtn.innerHTML = '<span style="opacity: 0.7;">Generating...</span>';
        finalBtn.innerHTML = '<span style="opacity: 0.7;">Generating...</span>';

        const response = await fetch(`/api/job/${jobId}/continue`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                skip_validation: options && options.skip_validation === false ? false : true
            })
        });

        if (!response.ok) {
            throw new Error('Failed to continue generation');
        }

        const data = await response.json();
        currentJobId = data.job_id;

        // Show processing and resume polling
        showSection('processing');
        updateProgress(60, 'Generating PowerPoint...');
        await pollJobStatus(jobId);

    } catch (error) {
        showError(error.message || 'Failed to continue generation');
        approveBtn.disabled = false;
        finalBtn.disabled = false;
        approveBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            Generate PowerPoint (Fast)
        `;
        finalBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 6L9 17l-5-5"/>
            </svg>
            Generate Final (With Auto-Fix)
        `;
    }
}

// Format column content (for two-column layouts)
function formatColumn(column) {
    if (!column) return '';

    // If it's a string, just return it
    if (typeof column === 'string') {
        return escapeHtml(column);
    }

    let html = '';

    // Heading
    if (column.heading) {
        html += `<div class="column-heading"><strong>${escapeHtml(column.heading)}</strong></div>`;
    }

    // Text (can be string or array)
    if (column.text) {
        if (Array.isArray(column.text)) {
            html += '<ul class="column-text">';
            column.text.forEach(item => {
                html += `<li>${escapeHtml(item)}</li>`;
            });
            html += '</ul>';
        } else {
            html += `<div class="column-text">${escapeHtml(column.text)}</div>`;
        }
    }

    // Bullets
    if (column.bullets && Array.isArray(column.bullets)) {
        html += '<ul class="column-bullets">';
        column.bullets.forEach(bullet => {
            html += `<li>${escapeHtml(bullet)}</li>`;
        });
        html += '</ul>';
    }

    return html || '<em>Empty column</em>';
}

// Format table content
function formatTable(table) {
    if (!table || !table.headers || !table.rows) {
        return '<div class="slide-table"><em>Invalid table data</em></div>';
    }

    let html = '<div class="slide-table">';

    if (table.caption) {
        html += `<div class="table-caption"><strong>${escapeHtml(table.caption)}</strong></div>`;
    }

    html += '<table>';

    // Headers
    html += '<thead><tr>';
    table.headers.forEach(header => {
        html += `<th>${escapeHtml(header)}</th>`;
    });
    html += '</tr></thead>';

    // Rows
    html += '<tbody>';
    table.rows.forEach(row => {
        html += '<tr>';
        row.forEach(cell => {
            html += `<td>${escapeHtml(String(cell))}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody>';

    html += '</table></div>';
    return html;
}

// HTML escape utility
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Utility function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Avatar Selection
function initAvatarSelection() {
    const avatarOptions = document.querySelectorAll('.avatar-option');
    const avatarChoiceInput = document.getElementById('avatarChoice');

    // Set default selection (No Video)
    if (avatarOptions.length > 0) {
        avatarOptions[0].classList.add('selected');
        avatarChoiceInput.value = '';
    }

    avatarOptions.forEach(option => {
        option.addEventListener('click', function() {
            // Remove selected class from all options
            avatarOptions.forEach(opt => opt.classList.remove('selected'));

            // Add selected class to clicked option
            this.classList.add('selected');

            // Update hidden input value
            const avatarValue = this.getAttribute('data-avatar');
            avatarChoiceInput.value = avatarValue;

            console.log('Selected avatar:', avatarValue || 'No Video');
        });
    });
}

// Voice Preview
function initVoicePreview() {
    const voicePreviewBtn = document.getElementById('voicePreviewBtn');
    const voiceChoice = document.getElementById('voiceChoice');
    const speakerChoice = document.getElementById('speakerChoice');
    const speakerSelectGroup = document.getElementById('speakerSelectGroup');
    const voicePreviewAudio = document.getElementById('voicePreviewAudio');
    const voicePreviewStatus = document.getElementById('voicePreviewStatus');

    if (!voicePreviewBtn || !voiceChoice || !voicePreviewAudio || !voicePreviewStatus) {
        return;
    }

    let currentAudio = null;
    let isPlaying = false;

    // Load speakers when voice model changes
    async function loadSpeakers(modelName) {
        if (!modelName || modelName === 'gtts') {
            speakerSelectGroup.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`/api/speakers/${encodeURIComponent(modelName)}`);
            if (!response.ok) throw new Error('Failed to load speakers');

            const data = await response.json();
            const speakers = data.speakers || {};

            if (Object.keys(speakers).length > 0) {
                speakerChoice.innerHTML = '';
                Object.entries(speakers).forEach(([id, info]) => {
                    const option = document.createElement('option');
                    option.value = id;
                    option.textContent = `${info.name} - ${info.description}`;
                    speakerChoice.appendChild(option);
                });
                speakerSelectGroup.style.display = 'block';
            } else {
                speakerSelectGroup.style.display = 'none';
            }
        } catch (error) {
            console.error('Error loading speakers:', error);
            speakerSelectGroup.style.display = 'none';
        }
    }

    // Load speakers for initial model
    loadSpeakers(voiceChoice.value);

    // Reload speakers when model changes
    voiceChoice.addEventListener('change', function() {
        loadSpeakers(this.value);
    });

    voicePreviewBtn.addEventListener('click', async function() {
        const selectedVoice = voiceChoice.value;
        const selectedSpeaker = speakerChoice && speakerChoice.value ? speakerChoice.value : null;

        // If already playing, stop it
        if (isPlaying && currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            isPlaying = false;
            voicePreviewBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Preview
            `;
            voicePreviewStatus.textContent = '';
            return;
        }

        // Disable button and show loading
        voicePreviewBtn.disabled = true;
        voicePreviewStatus.textContent = 'Generating preview...';
        voicePreviewStatus.className = 'preview-status loading';

        try {
            // Request voice preview
            const requestData = {
                voice_model: selectedVoice
            };
            if (selectedSpeaker) {
                requestData.speaker_id = selectedSpeaker;
            }

            const response = await fetch('/api/voice-preview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to generate preview');
            }

            const data = await response.json();

            // Play the audio
            voicePreviewAudio.src = data.audio_url;
            voicePreviewAudio.load();

            currentAudio = voicePreviewAudio;
            isPlaying = true;

            // Update button to show stop icon
            voicePreviewBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
                Stop
            `;

            voicePreviewStatus.textContent = 'Playing preview...';
            voicePreviewStatus.className = 'preview-status success';

            voicePreviewAudio.play();

            // Reset when finished
            voicePreviewAudio.onended = function() {
                isPlaying = false;
                voicePreviewBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    Preview
                `;
                voicePreviewStatus.textContent = 'Preview completed';
                setTimeout(() => {
                    voicePreviewStatus.textContent = '';
                }, 2000);
            };

        } catch (error) {
            console.error('Voice preview error:', error);
            voicePreviewStatus.textContent = error.message || 'Failed to generate preview';
            voicePreviewStatus.className = 'preview-status error';
        } finally {
            voicePreviewBtn.disabled = false;
        }
    });

    // Reset on voice change
    voiceChoice.addEventListener('change', function() {
        if (currentAudio && isPlaying) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            isPlaying = false;
            voicePreviewBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Preview
            `;
            voicePreviewStatus.textContent = '';
        }
    });
}

// Mode Selection
function initModeSelection() {
    console.log('[MODE SELECTION] Initializing mode selection...');

    const modeRadios = document.querySelectorAll('input[name="generationMode"]');
    const pdfUploadSection = document.getElementById('pdfUploadSection');
    const pptUploadSection = document.getElementById('pptUploadSection');
    const pptGenerationElements = document.querySelectorAll('.ppt-generation-only');
    const videoGenerationElements = document.querySelectorAll('.video-generation-only');
    const fileInput = document.getElementById('fileInput');
    const pptFileInput = document.getElementById('pptFileInput');
    const transcriptFileInput = document.getElementById('transcriptFileInput');

    console.log('[MODE SELECTION] Found elements:', {
        modeRadios: modeRadios.length,
        pdfUploadSection: !!pdfUploadSection,
        pptUploadSection: !!pptUploadSection,
        pptGenerationElements: pptGenerationElements.length,
        videoGenerationElements: videoGenerationElements.length
    });

    if (!modeRadios.length) {
        console.error('[MODE SELECTION] No mode radio buttons found!');
        return;
    }

    function updateFormVisibility() {
        const selectedMode = document.querySelector('input[name="generationMode"]:checked')?.value;

        if (!selectedMode) return;

        console.log('[MODE SELECTION] Selected mode:', selectedMode);
        console.log('[MODE SELECTION] PDF section:', pdfUploadSection);
        console.log('[MODE SELECTION] PPT section:', pptUploadSection);

        if (selectedMode === 'pdf-to-ppt') {
            // PDF to PPT only - show PDF upload, theme selection, hide video options
            if (pdfUploadSection) {
                pdfUploadSection.style.display = 'block';
                console.log('[MODE SELECTION] Showing PDF upload');
            }
            if (pptUploadSection) {
                pptUploadSection.style.display = 'none';
                console.log('[MODE SELECTION] Hiding PPT upload');
            }

            // Show theme/color options (ppt-generation-only)
            pptGenerationElements.forEach(el => {
                el.style.display = 'block';
            });
            console.log('[MODE SELECTION] Showed', pptGenerationElements.length, 'PPT generation elements');

            // Hide video options (video-generation-only)
            videoGenerationElements.forEach(el => {
                el.style.display = 'none';
            });
            console.log('[MODE SELECTION] Hid', videoGenerationElements.length, 'video generation elements');

            // Make PDF required, others not required
            if (fileInput) fileInput.required = true;
            if (pptFileInput) pptFileInput.required = false;
            if (transcriptFileInput) transcriptFileInput.required = false;

            // Set avatar to empty (no video)
            const avatarChoice = document.getElementById('avatarChoice');
            if (avatarChoice) avatarChoice.value = '';

            // Reset avatar selection visually
            document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
            const noAvatarOption = document.querySelector('.avatar-option[data-avatar=""]');
            if (noAvatarOption) noAvatarOption.classList.add('selected');

            console.log('[MODE SELECTION] PDF to PPT mode activated');

        } else if (selectedMode === 'ppt-to-video') {
            // PPT to Video only - show PPT + transcript upload, hide PDF and theme
            if (pdfUploadSection) {
                pdfUploadSection.style.display = 'none';
                console.log('[MODE SELECTION] Hiding PDF upload');
            }
            if (pptUploadSection) {
                pptUploadSection.style.display = 'block';
                console.log('[MODE SELECTION] Showing PPT upload');
            }

            // Hide theme/color options (ppt-generation-only)
            pptGenerationElements.forEach(el => {
                el.style.display = 'none';
            });
            console.log('[MODE SELECTION] Hid', pptGenerationElements.length, 'PPT generation elements');

            // Show video options (video-generation-only)
            videoGenerationElements.forEach(el => {
                el.style.display = 'block';
            });
            console.log('[MODE SELECTION] Showed', videoGenerationElements.length, 'video generation elements');

            // Make PPT and transcript required, PDF not required
            if (fileInput) fileInput.required = false;
            if (pptFileInput) pptFileInput.required = true;
            if (transcriptFileInput) transcriptFileInput.required = true;

            // Set default avatar (first real avatar)
            const avatarChoice = document.getElementById('avatarChoice');
            const firstAvatarOption = document.querySelector('.avatar-option[data-avatar]:not([data-avatar=""])');
            if (avatarChoice && firstAvatarOption) {
                const defaultAvatar = firstAvatarOption.getAttribute('data-avatar');
                avatarChoice.value = defaultAvatar;

                // Update visual selection
                document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
                firstAvatarOption.classList.add('selected');
            }

            console.log('[MODE SELECTION] PPT to Video mode activated');

        } else if (selectedMode === 'pdf-to-both') {
            // PDF to Both - show PDF upload, theme selection, and video options
            if (pdfUploadSection) {
                pdfUploadSection.style.display = 'block';
                console.log('[MODE SELECTION] Showing PDF upload');
            }
            if (pptUploadSection) {
                pptUploadSection.style.display = 'none';
                console.log('[MODE SELECTION] Hiding PPT upload');
            }

            // Show theme/color options (ppt-generation-only)
            pptGenerationElements.forEach(el => {
                el.style.display = 'block';
            });
            console.log('[MODE SELECTION] Showed', pptGenerationElements.length, 'PPT generation elements');

            // Show video options (video-generation-only)
            videoGenerationElements.forEach(el => {
                el.style.display = 'block';
            });
            console.log('[MODE SELECTION] Showed', videoGenerationElements.length, 'video generation elements');

            // Make PDF required, others not required
            if (fileInput) fileInput.required = true;
            if (pptFileInput) pptFileInput.required = false;
            if (transcriptFileInput) transcriptFileInput.required = false;

            // Set default avatar (first real avatar)
            const avatarChoice = document.getElementById('avatarChoice');
            const firstAvatarOption = document.querySelector('.avatar-option[data-avatar]:not([data-avatar=""])');
            if (avatarChoice && firstAvatarOption) {
                const defaultAvatar = firstAvatarOption.getAttribute('data-avatar');
                avatarChoice.value = defaultAvatar;

                // Update visual selection
                document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
                firstAvatarOption.classList.add('selected');
            }

            console.log('[MODE SELECTION] PDF to Both mode activated');
        }
    }

    // Initialize form based on default selection
    updateFormVisibility();

    // Listen for mode changes
    modeRadios.forEach(radio => {
        radio.addEventListener('change', updateFormVisibility);
    });

    // Handle PPT file selection
    if (pptFileInput) {
        pptFileInput.addEventListener('change', function(e) {
            const pptFileName = document.getElementById('pptFileName');
            const file = e.target.files[0];
            if (file && pptFileName) {
                pptFileName.textContent = file.name;
                pptFileName.style.display = 'block';
            }
        });
    }

    // Handle transcript file selection
    if (transcriptFileInput) {
        transcriptFileInput.addEventListener('change', function(e) {
            const transcriptFileName = document.getElementById('transcriptFileName');
            const file = e.target.files[0];
            if (file && transcriptFileName) {
                transcriptFileName.textContent = file.name;
                transcriptFileName.style.display = 'block';
            }
        });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadRecentJobs();
    initAvatarSelection();
    initVoicePreview();
    initModeSelection();
});

// Avatar Positioning
let currentSlideIndex = 0;
let slideImages = [];
let avatarPositions = {};
let currentJobIdForPositioning = null;

function showAvatarPositioning(jobId, slides, avatarImage) {
    console.log('[AVATAR POS] Showing avatar positioning for', slides.length, 'slides');

    currentJobIdForPositioning = jobId;
    slideImages = slides;
    currentSlideIndex = 0;
    avatarPositions = {};

    // Initialize default positions for all slides
    slides.forEach((slide, index) => {
        avatarPositions[index] = {
            x: 75, // 75% from left (right side)
            y: 80, // 80% from top (bottom)
            width: 20 // 20% of slide width
        };
    });

    // Hide other sections
    document.getElementById('uploadSection')?.classList.add('hidden');
    document.getElementById('processingSection')?.classList.add('hidden');
    document.getElementById('previewSection')?.classList.add('hidden');
    document.getElementById('resultSection')?.classList.add('hidden');
    document.getElementById('errorSection')?.classList.add('hidden');

    // Show positioning section
    const positioningSection = document.getElementById('avatarPositioningSection');
    if (positioningSection) {
        positioningSection.classList.remove('hidden');
    }

    // Set avatar preview image
    const avatarPreviewImage = document.getElementById('avatarPreviewImage');
    if (avatarPreviewImage) {
        avatarPreviewImage.src = avatarImage || '/api/avatars/avatar_woman.png';
    }

    // Load first slide
    loadSlideForPositioning(0);

    // Setup event listeners
    setupAvatarPositioningListeners();
}

function loadSlideForPositioning(index) {
    if (index < 0 || index >= slideImages.length) return;

    currentSlideIndex = index;

    // Update slide counter
    const slideCounter = document.getElementById('slideCounter');
    if (slideCounter) {
        slideCounter.textContent = `Slide ${index + 1} / ${slideImages.length}`;
    }

    // Update slide image
    const currentSlideImage = document.getElementById('currentSlideImage');
    if (currentSlideImage) {
        currentSlideImage.src = slideImages[index];
    }

    // Update avatar position
    const avatarPreview = document.getElementById('avatarPreview');
    if (avatarPreview && avatarPositions[index]) {
        const pos = avatarPositions[index];
        avatarPreview.style.left = pos.x + '%';
        avatarPreview.style.top = pos.y + '%';
        avatarPreview.style.width = pos.width + '%';
        avatarPreview.style.right = 'auto';
        avatarPreview.style.bottom = 'auto';
    }

    // Update navigation buttons
    const prevBtn = document.getElementById('prevSlideBtn');
    const nextBtn = document.getElementById('nextSlideBtn');
    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) nextBtn.disabled = index === slideImages.length - 1;

    console.log('[AVATAR POS] Loaded slide', index + 1);
}

function setupAvatarPositioningListeners() {
    // Navigation buttons
    const prevBtn = document.getElementById('prevSlideBtn');
    const nextBtn = document.getElementById('nextSlideBtn');

    if (prevBtn) {
        prevBtn.onclick = () => {
            if (currentSlideIndex > 0) {
                loadSlideForPositioning(currentSlideIndex - 1);
            }
        };
    }

    if (nextBtn) {
        nextBtn.onclick = () => {
            if (currentSlideIndex < slideImages.length - 1) {
                loadSlideForPositioning(currentSlideIndex + 1);
            }
        };
    }

    // Preset position buttons
    const presetButtons = document.querySelectorAll('.position-presets button[data-position]');
    presetButtons.forEach(btn => {
        btn.onclick = () => {
            const position = btn.getAttribute('data-position');
            applyPresetPosition(position);
        };
    });

    // Confirm button
    const confirmBtn = document.getElementById('confirmPositionsBtn');
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            confirmAvatarPositions();
        };
    }

    // Reset button
    const resetBtn = document.getElementById('resetPositionBtn');
    if (resetBtn) {
        resetBtn.onclick = () => {
            resetAvatarPosition();
        };
    }

    // Drag functionality
    setupAvatarDrag();
}

function setupAvatarDrag() {
    const avatarPreview = document.getElementById('avatarPreview');
    const slideCanvas = document.getElementById('slideCanvas');

    if (!avatarPreview || !slideCanvas) return;

    let isDragging = false;
    let startX, startY, startLeft, startTop;

    avatarPreview.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = slideCanvas.getBoundingClientRect();
        const avatarRect = avatarPreview.getBoundingClientRect();
        startLeft = ((avatarRect.left - rect.left) / rect.width) * 100;
        startTop = ((avatarRect.top - rect.top) / rect.height) * 100;

        avatarPreview.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const rect = slideCanvas.getBoundingClientRect();
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        let newLeft = startLeft + (deltaX / rect.width) * 100;
        let newTop = startTop + (deltaY / rect.height) * 100;

        // Constrain to canvas bounds
        const avatarWidth = parseFloat(avatarPreview.style.width) || 20;
        newLeft = Math.max(0, Math.min(100 - avatarWidth, newLeft));
        newTop = Math.max(0, Math.min(100 - 20, newTop)); // Assume 20% height

        avatarPreview.style.left = newLeft + '%';
        avatarPreview.style.top = newTop + '%';

        // Update position in storage
        updateAvatarPosition(newLeft, newTop);
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            avatarPreview.style.cursor = 'move';
        }
    });
}

function updateAvatarPosition(x, y) {
    const applyToAll = document.getElementById('applyToAllSlides')?.checked;

    if (applyToAll) {
        // Apply to all slides
        Object.keys(avatarPositions).forEach(key => {
            avatarPositions[key].x = x;
            avatarPositions[key].y = y;
        });
    } else {
        // Apply to current slide only
        avatarPositions[currentSlideIndex].x = x;
        avatarPositions[currentSlideIndex].y = y;
    }
}

function applyPresetPosition(position) {
    let x, y;

    switch(position) {
        case 'bottom-right':
            x = 75; y = 80;
            break;
        case 'bottom-left':
            x = 5; y = 80;
            break;
        case 'top-right':
            x = 75; y = 5;
            break;
        case 'top-left':
            x = 5; y = 5;
            break;
        default:
            return;
    }

    const avatarPreview = document.getElementById('avatarPreview');
    if (avatarPreview) {
        avatarPreview.style.left = x + '%';
        avatarPreview.style.top = y + '%';
        avatarPreview.style.right = 'auto';
        avatarPreview.style.bottom = 'auto';
    }

    updateAvatarPosition(x, y);
}

function resetAvatarPosition() {
    applyPresetPosition('bottom-right');
}

async function confirmAvatarPositions() {
    console.log('[AVATAR POS] Confirming positions:', avatarPositions);

    const confirmBtn = document.getElementById('confirmPositionsBtn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Saving positions...';
    }

    try {
        // Save positions to backend
        const response = await fetch(`/api/job/${currentJobIdForPositioning}/avatar-positions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ positions: avatarPositions })
        });

        if (!response.ok) {
            throw new Error('Failed to save avatar positions');
        }

        // Continue with video generation
        const result = await response.json();
        console.log('[AVATAR POS] Positions saved, continuing video generation');

        // Hide positioning section and show processing
        document.getElementById('avatarPositioningSection')?.classList.add('hidden');
        showSection('processing');

        // Resume polling
        await pollJobStatus(currentJobIdForPositioning);

    } catch (error) {
        console.error('[AVATAR POS] Error saving positions:', error);
        showError(error.message || 'Failed to save avatar positions');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Continue Video Generation';
        }
    }
}
