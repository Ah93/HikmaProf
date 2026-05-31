// Template Gallery Component
class TemplateGallery {
    constructor() {
        this.templates = [];
        this.colors = [];
        this.selectedTemplate = 'modern';
        this.selectedColor = 'blue';
        this.selectedNumImages = 3;
        this.selectedAiColor = 'indigo';
        this.activeTab = 'pptx'; // 'pptx' | 'images'
        this.init();
    }

    async init() {
        await this.loadTemplates();
        this.setupTabSwitching();
        this.setupEventListeners();
    }

    async loadTemplates() {
        try {
            const response = await fetch('/api/templates');
            const data = await response.json();
            this.templates = data.templates;
            this.colors = data.colors;
            this.renderTemplateGallery();
            this.renderColorGallery();
        } catch (error) {
            console.error('Failed to load templates:', error);
        }
    }

    // ── Tab switching ─────────────────────────────────────────────────────────
    setupTabSwitching() {
        document.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.gallery-tab-btn');
            if (!tabBtn) return;
            const tab = tabBtn.dataset.tab;
            if (tab && tab !== this.activeTab) this.switchTab(tab);
        });
    }

    switchTab(tab) {
        this.activeTab = tab;

        document.querySelectorAll('.gallery-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        const pptxPane   = document.getElementById('gallery-pane-pptx');
        const imagesPane = document.getElementById('gallery-pane-images');
        if (pptxPane)   pptxPane.style.display   = tab === 'pptx'   ? '' : 'none';
        if (imagesPane) imagesPane.style.display  = tab === 'images' ? '' : 'none';

        // Hide avatar, slide layout, and main generate button when on AI Images tab
        const isImages = tab === 'images';
        const avatarSection  = document.getElementById('pptx-avatar-section');
        const layoutSection  = document.getElementById('pptx-layout-section');
        const generateBtn    = document.getElementById('pptx-generate-btn');
        if (avatarSection)  avatarSection.style.display  = isImages ? 'none' : '';
        if (layoutSection)  layoutSection.style.display  = isImages ? 'none' : '';
        if (generateBtn)    generateBtn.style.display     = isImages ? 'none' : '';

        this._syncPresentationType();
        this.updateSelectedDisplay();
    }

    _syncPresentationType() {
        const ptInput  = document.getElementById('presentationType');
        const niInput  = document.getElementById('numImages');
        if (!ptInput) return;

        if (this.activeTab === 'images') {
            ptInput.value = 'pptx'; // still generates pptx, just with images
            if (niInput) niInput.value = this.selectedNumImages;
        } else {
            ptInput.value = 'pptx';
            if (niInput) niInput.value = 0;
        }
    }

    renderTemplateGallery() {
        const container = document.getElementById('templateGallery');
        if (!container) return;

        const FEATURED_IDS = ['modern', 'minimal', 'tech', 'creative', 'corporate', 'elegant', 'startup', 'magazine', 'academic', 'nature', 'retro', 'luxury'];
        const featured = FEATURED_IDS
            .map(id => this.templates.find(t => t.id === id))
            .filter(Boolean);

        let html = '<div class="template-grid">';

        featured.forEach(template => {
            const isSelected = template.id === this.selectedTemplate;
            html += `
                <div class="template-card ${isSelected ? 'selected' : ''}" data-template-id="${template.id}">
                    <div class="template-preview">
                        <div class="tp-slide">
                            <div class="tp-decoration"></div>
                            <div class="tp-header">
                                <div class="tp-eyebrow"></div>
                                <div class="tp-title-text">${template.name}</div>
                            </div>
                            <div class="tp-body">
                                <div class="tp-line tp-line-1"></div>
                                <div class="tp-line tp-line-2"></div>
                                <div class="tp-line tp-line-3"></div>
                            </div>
                        </div>
                    </div>
                    <div class="template-info">
                        <div class="template-name">${template.name}</div>
                        <div class="template-description">${template.description}</div>
                    </div>
                    ${isSelected ? '<div class="template-selected-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Selected</div>' : ''}
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    renderColorGallery() {
        const container = document.getElementById('colorGallery');
        if (!container) return;

        const lightColors = this.colors.filter(c => c.category === 'light');
        const darkColors  = this.colors.filter(c => c.category === 'dark');

        let html = `
            <div class="color-category">
                <h4 class="color-category-title">Light Themes</h4>
                <div class="color-grid">
        `;

        lightColors.forEach(color => {
            const isSelected = color.id === this.selectedColor;
            html += `
                <div class="color-card ${isSelected ? 'selected' : ''}" data-color-id="${color.id}">
                    <div class="color-preview" style="background: ${color.primary}"></div>
                    <div class="color-name">${color.name}</div>
                    ${isSelected ? '<div class="color-selected-badge">✓</div>' : ''}
                </div>
            `;
        });

        html += `
                </div>
            </div>
            <div class="color-category">
                <h4 class="color-category-title">Dark Themes</h4>
                <div class="color-grid">
        `;

        darkColors.forEach(color => {
            const isSelected = color.id === this.selectedColor;
            html += `
                <div class="color-card ${isSelected ? 'selected' : ''}" data-color-id="${color.id}">
                    <div class="color-preview" style="background: ${color.primary}"></div>
                    <div class="color-name">${color.name}</div>
                    ${isSelected ? '<div class="color-selected-badge">✓</div>' : ''}
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    setupEventListeners() {
        document.addEventListener('click', (e) => {
            const templateCard = e.target.closest('.template-card');
            if (templateCard) {
                this.selectTemplate(templateCard.dataset.templateId);
                return;
            }

            const colorCard = e.target.closest('.color-card');
            if (colorCard) {
                this.selectColor(colorCard.dataset.colorId);
                return;
            }

            const countBtn = e.target.closest('.img-count-btn');
            if (countBtn) {
                this.selectNumImages(parseInt(countBtn.dataset.count, 10));
                return;
            }

            const colorBtn = e.target.closest('.ai-color-btn');
            if (colorBtn && colorBtn.dataset.aiColor) {
                this.selectAiColor(colorBtn.dataset.aiColor);
                return;
            }
        });

        const changeBtn = document.getElementById('changeTemplateBtn');
        if (changeBtn) {
            changeBtn.addEventListener('click', () => {
                const gallery = document.getElementById('templateGallerySection');
                const isOpen = gallery && gallery.classList.contains('gallery-open');
                if (isOpen) {
                    this.hideGallery();
                    this.updateSelectedDisplay();
                } else {
                    this.showGallery();
                }
            });
        }
    }

    showGallery() {
        const gallery   = document.getElementById('templateGallerySection');
        const display   = document.getElementById('selectedTemplateDisplay');
        const changeBtn = document.getElementById('changeTemplateBtn');
        if (gallery) {
            gallery.style.display = 'block';
            requestAnimationFrame(() => gallery.classList.add('gallery-open'));
        }
        if (display)   display.classList.add('gallery-is-open');
        if (changeBtn) changeBtn.querySelector('svg').style.transform = 'rotate(180deg)';
    }

    hideGallery() {
        const gallery   = document.getElementById('templateGallerySection');
        const display   = document.getElementById('selectedTemplateDisplay');
        const changeBtn = document.getElementById('changeTemplateBtn');
        if (gallery) {
            gallery.classList.remove('gallery-open');
            gallery.addEventListener('transitionend', () => {
                if (!gallery.classList.contains('gallery-open')) gallery.style.display = 'none';
            }, { once: true });
        }
        if (display)   display.classList.remove('gallery-is-open');
        if (changeBtn) changeBtn.querySelector('svg').style.transform = 'rotate(0deg)';
    }

    updateSelectedDisplay() {
        const templateNameEl = document.getElementById('selectedTemplateName');
        const colorNameEl    = document.getElementById('selectedColorName');
        const typeBadge      = document.getElementById('selectedTypeBadge');

        if (this.activeTab === 'images') {
            if (templateNameEl) templateNameEl.textContent = 'AI Images';
            if (colorNameEl)    colorNameEl.textContent    = `${this.selectedNumImages} slides`;
            if (typeBadge)      { typeBadge.textContent = 'AI'; typeBadge.style.display = 'inline-block'; }
        } else {
            const template = this.templates.find(t => t.id === this.selectedTemplate);
            const color    = this.colors.find(c => c.id === this.selectedColor);
            if (templateNameEl) templateNameEl.textContent = template ? template.name : this.selectedTemplate;
            if (colorNameEl)    colorNameEl.textContent    = color    ? color.name    : this.selectedColor;
            if (typeBadge)      typeBadge.style.display = 'none';
        }
    }

    selectTemplate(templateId) {
        this.selectedTemplate = templateId;

        const input = document.getElementById('templateStyle');
        if (input) input.value = templateId;

        document.querySelectorAll('.template-card').forEach(card => {
            card.classList.remove('selected');
            card.querySelector('.template-selected-badge')?.remove();
        });

        const selectedCard = document.querySelector(`[data-template-id="${templateId}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
            const badge = document.createElement('div');
            badge.className = 'template-selected-badge';
            badge.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Selected';
            selectedCard.appendChild(badge);
        }

        this.updateSelectedDisplay();
    }

    selectColor(colorId) {
        this.selectedColor = colorId;

        const input = document.getElementById('colorScheme');
        if (input) input.value = colorId;

        document.querySelectorAll('.color-card').forEach(card => {
            card.classList.remove('selected');
            card.querySelector('.color-selected-badge')?.remove();
        });

        const selectedCard = document.querySelector(`[data-color-id="${colorId}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
            const badge = document.createElement('div');
            badge.className = 'color-selected-badge';
            badge.textContent = '✓';
            selectedCard.appendChild(badge);
        }

        this.updateSelectedDisplay();
    }

    selectNumImages(count) {
        this.selectedNumImages = count;

        const niInput = document.getElementById('numImages');
        if (niInput) niInput.value = count;

        document.querySelectorAll('.img-count-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.count, 10) === count);
        });

        this.updateSelectedDisplay();
    }

    selectAiColor(color) {
        this.selectedAiColor = color;
        document.querySelectorAll('.ai-color-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.aiColor === color);
        });
    }

    // ── AI Images generation flow ──────────────────────────────────────────────

    async generateWithImages() {
        const fileInput = document.getElementById('fileInput');
        if (!fileInput || !fileInput.files[0]) {
            alert('Please select a document to upload first.');
            return;
        }

        const numImages = this.selectedNumImages;

        // Minimal FormData — just the file, image count, and chosen color
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('num_images', numImages);
        formData.append('ai_color', this.selectedAiColor);

        const btn = document.getElementById('generateWithImagesBtn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Starting...'; }

        this._showAiImagesModal(numImages);

        const apiBase = (window.APP_PREFIX || '') + '/api/generate-ai-images';

        try {
            const resp = await fetch(apiBase, { method: 'POST', body: formData });

            const contentType = resp.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                const text = await resp.text();
                throw new Error(`Server error (${resp.status}): ${text.slice(0, 200)}`);
            }

            const result = await resp.json();
            if (!resp.ok || !result.job_id) {
                this._aiModalError(result.error || `Server error ${resp.status}`);
                return;
            }
            this._pollAiImages(result.job_id, numImages);
        } catch (err) {
            this._aiModalError(err.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Generate AI Images'; }
        }
    }

    _showAiImagesModal(numImages) {
        document.getElementById('aiImagesModal')?.remove();

        let slots = '';
        for (let i = 0; i < numImages; i++) {
            slots += `<div class="aim-card aim-waiting" id="aim-card-${i}">
                <div class="aim-spinner"></div>
                <span class="aim-card-label">Waiting...</span>
            </div>`;
        }

        const el = document.createElement('div');
        el.id = 'aiImagesModal';
        el.className = 'aim-overlay';
        el.innerHTML = `
            <div class="aim-modal">
                <div class="aim-header">
                    <div class="aim-icon">🎨</div>
                    <div>
                        <h2 class="aim-title">Generating AI Images</h2>
                        <p class="aim-subtitle" id="aimSubtitle">Starting up...</p>
                    </div>
                </div>

                <div class="aim-steps">
                    <div class="aim-step aim-step-active" id="aim-step-1">
                        <div class="aim-step-indicator"><div class="aim-step-ring"></div></div>
                        <div class="aim-step-body">
                            <span class="aim-step-name">Extracting Document</span>
                            <span class="aim-step-desc" id="aim-desc-1">Reading your document...</span>
                        </div>
                    </div>
                    <div class="aim-step" id="aim-step-2">
                        <div class="aim-step-indicator"><div class="aim-step-ring"></div></div>
                        <div class="aim-step-body">
                            <span class="aim-step-name">Generating Prompts</span>
                            <span class="aim-step-desc" id="aim-desc-2">DeepSeek analyzing content...</span>
                        </div>
                    </div>
                    <div class="aim-step" id="aim-step-3">
                        <div class="aim-step-indicator"><div class="aim-step-ring"></div></div>
                        <div class="aim-step-body">
                            <span class="aim-step-name">Creating AI Images</span>
                            <span class="aim-step-desc" id="aim-desc-3">ERNIE generating visuals...</span>
                        </div>
                    </div>
                </div>

                <div class="aim-grid" id="aimGrid">${slots}</div>

                <div class="aim-download" id="aimDownload"></div>

                <div class="aim-error" id="aimError" style="display:none;">
                    <p id="aimErrorText">An error occurred.</p>
                    <button onclick="document.getElementById('aiImagesModal').remove()">Close</button>
                </div>
            </div>`;

        document.body.appendChild(el);
        this._injectAimStyles();
    }

    async _pollAiImages(jobId, numImages) {
        let attempts = 0;
        const maxAttempts = 900;
        const displayedImages = new Set();
        let slotsInitialised = numImages;

        const poll = async () => {
            try {
                const resp = await fetch(`/api/job/${jobId}`);
                const job  = await resp.json();
                const subtitle = document.getElementById('aimSubtitle');

                // Step 1 — extracting document text
                if (job.status === 'queued' || job.status === 'extracting') {
                    this._aimStep(1, 'active', 'Reading document...');
                    if (subtitle) subtitle.textContent = 'Extracting text from your document...';
                }

                // Step 2 — generating prompts with DeepSeek
                if (job.status === 'generating_prompts') {
                    this._aimStep(1, 'done', 'Document extracted ✓');
                    this._aimStep(2, 'active', 'DeepSeek analyzing content...');
                    if (subtitle) subtitle.textContent = 'Generating visual prompts from document content...';
                }

                // Step 3 — ERNIE generating images
                if (job.status === 'generating_images' || (job.ernie_total > 0 && job.status !== 'completed')) {
                    this._aimStep(1, 'done', 'Document extracted ✓');
                    this._aimStep(2, 'done', 'Prompts ready ✓');
                    const done  = job.ernie_done  || 0;
                    const total = job.ernie_total || numImages;
                    this._aimStep(3, done < total ? 'active' : 'done', `${done} / ${total} images ready`);
                    if (subtitle) subtitle.textContent = `Creating AI images — ${done} of ${total} complete`;

                    if (total !== slotsInitialised) {
                        slotsInitialised = total;
                        this._aimResizeGrid(total);
                    }

                    (job.ernie_slides || []).forEach((slideIdx, i) => {
                        if (!displayedImages.has(slideIdx)) {
                            displayedImages.add(slideIdx);
                            this._aimRevealImage(jobId, slideIdx, i);
                        }
                    });
                }

                if (job.status === 'completed') {
                    this._aimStep(1, 'done', 'Document extracted ✓');
                    this._aimStep(2, 'done', 'Prompts ready ✓');
                    this._aimStep(3, 'done', `${slotsInitialised} images generated ✓`);
                    if (subtitle) subtitle.textContent = '✅ Your AI images are ready!';

                    (job.ernie_slides || []).forEach((slideIdx, i) => {
                        if (!displayedImages.has(slideIdx)) {
                            displayedImages.add(slideIdx);
                            this._aimRevealImage(jobId, slideIdx, i);
                        }
                    });

                    // Inject download buttons into the aim-download container
                    const dl = document.getElementById('aimDownload');
                    if (dl && !document.getElementById('aimDlPptx')) {
                        dl.innerHTML = `
                            <a id="aimDlPptx" class="aim-download-btn"
                               href="/api/job/${jobId}/export-images/pptx" download>
                                ⬇ Download PPTX
                            </a>
                            <a id="aimDlPdf" class="aim-download-btn aim-download-btn-pdf"
                               href="/api/job/${jobId}/export-images/pdf" download>
                                ⬇ Download PDF
                            </a>
                            <button class="aim-close-btn"
                                    onclick="document.getElementById('aiImagesModal').remove()">
                                Close
                            </button>`;
                        dl.style.display = 'flex';
                    }
                    return;
                }

                if (job.status === 'failed') {
                    this._aiModalError(job.error || 'Generation failed');
                    return;
                }

                attempts++;
                if (attempts < maxAttempts) setTimeout(poll, 1500);

            } catch (err) {
                console.error('[AI Images] Poll error:', err);
                attempts++;
                if (attempts < maxAttempts) setTimeout(poll, 2000);
            }
        };

        poll();
    }

    _aimStep(num, state, desc) {
        const step = document.getElementById(`aim-step-${num}`);
        const descEl = document.getElementById(`aim-desc-${num}`);
        if (!step) return;
        step.className = `aim-step aim-step-${state}`;
        if (descEl && desc) descEl.textContent = desc;
    }

    _aimResizeGrid(count) {
        const grid = document.getElementById('aimGrid');
        if (!grid) return;
        grid.innerHTML = '';
        for (let i = 0; i < count; i++) {
            grid.innerHTML += `<div class="aim-card aim-waiting" id="aim-card-${i}">
                <div class="aim-spinner"></div>
                <span class="aim-card-label">Waiting...</span>
            </div>`;
        }
    }

    _aimRevealImage(jobId, slideIdx, cardIndex) {
        const card = document.getElementById(`aim-card-${cardIndex}`);
        if (!card) return;
        const img = document.createElement('img');
        img.src = `/api/job/${jobId}/ernie-image/${slideIdx}`;
        img.alt = `Slide ${slideIdx + 1}`;
        img.onload = () => {
            card.classList.remove('aim-waiting');
            card.classList.add('aim-has-image');
            card.innerHTML = '';
            card.appendChild(img);
            const lbl = document.createElement('span');
            lbl.className = 'aim-card-label';
            lbl.textContent = `Slide ${slideIdx + 1}`;
            card.appendChild(lbl);
        };
        img.onerror = () => {
            // Image not yet saved — retry after 2s
            setTimeout(() => this._aimRevealImage(jobId, slideIdx, cardIndex), 2000);
        };
    }

    _aiModalError(msg) {
        const err  = document.getElementById('aimError');
        const text = document.getElementById('aimErrorText');
        if (err)  err.style.display  = 'block';
        if (text) text.textContent   = msg;
    }

    _injectAimStyles() {
        if (document.getElementById('aimStyles')) return;
        const s = document.createElement('style');
        s.id = 'aimStyles';
        s.textContent = `
        .aim-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.72);
            display: flex; align-items: center; justify-content: center;
            z-index: 9999; padding: 20px;
        }
        .aim-modal {
            background: #fff; border-radius: 20px;
            width: 100%; max-width: 680px; max-height: 90vh;
            overflow-y: auto; padding: 36px;
            box-shadow: 0 24px 80px rgba(0,0,0,0.25);
        }
        .aim-header { display: flex; align-items: center; gap: 14px; margin-bottom: 28px; }
        .aim-icon { font-size: 36px; }
        .aim-title { font-size: 1.3rem; font-weight: 700; color: #1e293b; margin: 0 0 4px; }
        .aim-subtitle { font-size: 0.85rem; color: #64748b; margin: 0; }

        .aim-steps { display: flex; flex-direction: column; gap: 0; margin-bottom: 28px; }
        .aim-step {
            display: flex; align-items: flex-start; gap: 14px;
            padding: 14px 0; border-bottom: 1px solid #f1f5f9;
            opacity: 0.4; transition: opacity 0.3s;
        }
        .aim-step:last-child { border-bottom: none; }
        .aim-step-active, .aim-step-done { opacity: 1; }
        .aim-step-indicator { width: 28px; height: 28px; flex-shrink: 0; position: relative; }
        .aim-step-ring {
            width: 28px; height: 28px; border-radius: 50%;
            border: 2.5px solid #e2e8f0; background: #fff;
        }
        .aim-step-active .aim-step-ring {
            border-color: #6366f1; border-top-color: transparent;
            animation: aimSpin 0.8s linear infinite;
        }
        .aim-step-done .aim-step-ring {
            background: #6366f1; border-color: #6366f1;
        }
        .aim-step-done .aim-step-ring::after {
            content: '✓'; position: absolute; inset: 0;
            display: flex; align-items: center; justify-content: center;
            color: #fff; font-size: 13px; font-weight: 700;
        }
        @keyframes aimSpin { to { transform: rotate(360deg); } }
        .aim-step-body { display: flex; flex-direction: column; gap: 2px; }
        .aim-step-name { font-weight: 600; font-size: 0.9rem; color: #1e293b; }
        .aim-step-desc { font-size: 0.78rem; color: #64748b; }

        .aim-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 14px; margin-bottom: 24px;
        }
        .aim-card {
            border-radius: 12px; overflow: hidden;
            aspect-ratio: 4/3; position: relative;
            border: 2px solid #e2e8f0; background: #f8fafc;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            transition: all 0.3s;
        }
        .aim-card.aim-has-image { border-color: #6366f1; }
        .aim-card img { width: 100%; height: 100%; object-fit: cover; animation: aimFadeIn 0.5s ease; }
        @keyframes aimFadeIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        .aim-spinner {
            width: 28px; height: 28px;
            border: 3px solid #e2e8f0; border-top-color: #6366f1;
            border-radius: 50%; animation: aimSpin 0.8s linear infinite;
            margin-bottom: 8px;
        }
        .aim-card-label {
            position: absolute; bottom: 0; left: 0; right: 0;
            background: rgba(0,0,0,0.5); color: #fff;
            font-size: 11px; text-align: center; padding: 4px;
        }
        .aim-waiting .aim-card-label { position: static; background: none; color: #94a3b8; font-size: 11px; }

        .aim-download { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
        .aim-download-btn {
            display: inline-flex; align-items: center; gap: 8px;
            padding: 12px 24px; border-radius: 10px;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: #fff; font-weight: 700; font-size: 0.95rem;
            text-decoration: none; transition: all 0.2s;
        }
        .aim-download-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(99,102,241,0.4); }
        .aim-download-btn-pdf { background: linear-gradient(135deg, #ef4444, #f97316); }
        .aim-download-btn-pdf:hover { box-shadow: 0 6px 20px rgba(239,68,68,0.4); }
        .aim-close-btn {
            padding: 12px 20px; border-radius: 10px;
            border: 2px solid #e2e8f0; background: #fff;
            color: #64748b; font-weight: 600; cursor: pointer;
        }
        .aim-error { color: #ef4444; margin-top: 12px; }
        `;
        document.head.appendChild(s);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.templateGallery = new TemplateGallery();
});
