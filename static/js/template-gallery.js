// Template Gallery Component
class TemplateGallery {
    constructor() {
        this.templates = [];
        this.colors = [];
        this.selectedTemplate = 'modern';
        this.selectedColor = 'default';
        this.selectedNumImages = 3;
        this.selectedAiColor = 'indigo';
        this.selectedAiStyle = 'dark-tech';
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

        const FEATURED_IDS = ['modern', 'minimal', 'tech', 'creative', 'corporate', 'elegant', 'startup', 'magazine', 'academic', 'nature', 'retro', 'luxury', 'dark-neon', 'glassmorphism', 'prestige', 'split-bold', 'blueprint', 'aurora'];
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
        const isDefaultSelected = this.selectedColor === 'default';

        let html = `
            <div class="color-category">
                <h4 class="color-category-title">No Override</h4>
                <div class="color-grid">
                    <div class="color-card default-color-card ${isDefaultSelected ? 'selected' : ''}" data-color-id="default">
                        <div class="color-preview default-color-preview">
                            <span class="default-color-icon">✦</span>
                        </div>
                        <div class="color-name">Default</div>
                        ${isDefaultSelected ? '<div class="color-selected-badge">✓</div>' : ''}
                    </div>
                </div>
            </div>
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

            const styleBtn = e.target.closest('.ai-style-btn');
            if (styleBtn && styleBtn.dataset.aiStyle) {
                this.selectAiStyle(styleBtn.dataset.aiStyle);
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
            if (colorNameEl)    colorNameEl.textContent    = this.selectedColor === 'default'
                ? 'Default (Template Colors)'
                : (color ? color.name : this.selectedColor);
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

    selectAiStyle(style) {
        this.selectedAiStyle = style;
        const input = document.getElementById('aiStyle');
        if (input) input.value = style;
        document.querySelectorAll('.ai-style-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.aiStyle === style);
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
        formData.append('ai_style', this.selectedAiStyle);

        const btn = document.getElementById('generateWithImagesBtn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Starting...'; }

        // Clear any previous session result
        this._lastAiJob = null;
        const viewBtn = document.getElementById('viewLastResultsBtn');
        if (viewBtn) viewBtn.style.display = 'none';

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

                <!-- Live timing bar — shown once ERNIE starts -->
                <div class="aim-timing" id="aimTiming" style="display:none;">
                    <div class="aim-timing-row">
                        <div class="aim-timing-stat">
                            <span class="aim-timing-lbl">⏱ Elapsed</span>
                            <span class="aim-timing-val" id="aimElapsed">0:00</span>
                        </div>
                        <div class="aim-timing-stat">
                            <span class="aim-timing-lbl">🖼 Avg / image</span>
                            <span class="aim-timing-val" id="aimImgTime">—</span>
                        </div>
                        <div class="aim-timing-stat" style="flex:1;">
                            <span class="aim-timing-lbl">📊 Images done</span>
                            <span class="aim-timing-val" id="aimProgressText">0 / ?</span>
                        </div>
                    </div>
                    <div class="aim-progress-track">
                        <div class="aim-progress-fill" id="aimProgressFill" style="width:0%"></div>
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

        // ── Timing state ──────────────────────────────────────────────────────
        const startTime    = Date.now();
        let ernieStart     = null;   // when ERNIE phase began
        let prevDone       = 0;
        let completionTimes = [];    // seconds each image took (cumulative avg)
        let timerInterval  = null;

        const fmt = (ms) => {
            const s = Math.floor(ms / 1000);
            return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        };

        // Start elapsed timer immediately from job submission
        timerInterval = setInterval(() => {
            const el = document.getElementById('aimElapsed');
            if (el) el.textContent = fmt(Date.now() - startTime);
        }, 1000);

        const showTimingBar = () => {
            const timingEl = document.getElementById('aimTiming');
            if (timingEl) timingEl.style.display = 'block';
        };

        const stopTimer = () => {
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        };
        // ─────────────────────────────────────────────────────────────────────

        const poll = async () => {
            try {
                const resp = await fetch(`/api/job/${jobId}`);
                const job  = await resp.json();
                const subtitle = document.getElementById('aimSubtitle');

                // Step 1 — extracting
                if (job.status === 'queued' || job.status === 'extracting') {
                    this._aimStep(1, 'active', 'Reading document...');
                    if (subtitle) subtitle.textContent = 'Extracting text from your document...';
                }

                // Step 2 — prompts
                if (job.status === 'generating_prompts') {
                    this._aimStep(1, 'done', 'Document extracted ✓');
                    this._aimStep(2, 'active', 'DeepSeek analyzing content...');
                    if (subtitle) subtitle.textContent = 'Generating visual prompts from document content...';
                }

                // Step 3 — ERNIE images
                if (job.status === 'generating_images' || (job.ernie_total > 0 && job.status !== 'completed')) {
                    if (!ernieStart) { ernieStart = Date.now(); showTimingBar(); }

                    this._aimStep(1, 'done', 'Document extracted ✓');
                    this._aimStep(2, 'done', 'Prompts ready ✓');
                    const done  = job.ernie_done  || 0;
                    const total = job.ernie_total || numImages;
                    this._aimStep(3, done < total ? 'active' : 'done', `${done} / ${total} images ready`);
                    if (subtitle) subtitle.textContent = `Creating AI images — ${done} of ${total} complete`;

                    // Track per-image timing
                    if (done > prevDone && ernieStart) {
                        const secPerImg = Math.round((Date.now() - ernieStart) / done / 1000);
                        completionTimes.push(secPerImg);
                        const avgSec = Math.round(completionTimes.reduce((a,b)=>a+b,0) / completionTimes.length);
                        const imgEl = document.getElementById('aimImgTime');
                        if (imgEl) imgEl.textContent = `~${avgSec}s`;
                        prevDone = done;
                    }

                    // Update progress bar
                    const pct = total > 0 ? Math.round(done / total * 100) : 0;
                    const fill = document.getElementById('aimProgressFill');
                    const prog = document.getElementById('aimProgressText');
                    if (fill) fill.style.width = pct + '%';
                    if (prog) prog.textContent = `${done} / ${total}`;

                    if (total !== slotsInitialised) {
                        slotsInitialised = total;
                        this._aimResizeGrid(total);
                    }

                    (job.ernie_slides || []).forEach((slideIdx, i) => {
                        if (!displayedImages.has(slideIdx)) {
                            displayedImages.add(slideIdx);
                            const secEach = completionTimes.length > 0
                                ? Math.round(completionTimes.reduce((a,b)=>a+b,0)/completionTimes.length)
                                : null;
                            this._aimRevealImage(jobId, slideIdx, i, secEach);
                        }
                    });
                }

                if (job.status === 'completed') {
                    stopTimer();
                    const totalSec  = Math.round((Date.now() - startTime) / 1000);
                    const timeStr   = totalSec >= 60
                        ? `${Math.floor(totalSec/60)}m ${totalSec%60}s`
                        : `${totalSec}s`;

                    this._aimStep(1, 'done', 'Document extracted ✓');
                    this._aimStep(2, 'done', 'Prompts ready ✓');
                    this._aimStep(3, 'done', `${slotsInitialised} images generated ✓`);
                    if (subtitle) subtitle.textContent = `✅ Done in ${timeStr}!`;

                    // Final timer freeze
                    const el = document.getElementById('aimElapsed');
                    if (el) el.textContent = fmt(Date.now() - startTime);
                    const fill = document.getElementById('aimProgressFill');
                    const prog = document.getElementById('aimProgressText');
                    if (fill) fill.style.width = '100%';
                    if (prog) prog.textContent = `${slotsInitialised} / ${slotsInitialised}`;

                    (job.ernie_slides || []).forEach((slideIdx, i) => {
                        if (!displayedImages.has(slideIdx)) {
                            displayedImages.add(slideIdx);
                            this._aimRevealImage(jobId, slideIdx, i, null);
                        }
                    });

                    const dl = document.getElementById('aimDownload');
                    if (dl && !document.getElementById('aimDlPptx')) {
                        const slideIndices = job.ernie_slides || [];

                        // Save session result so modal can be reopened after close
                        const avgSec = completionTimes.length > 0
                            ? `~${Math.round(completionTimes.reduce((a,b)=>a+b,0)/completionTimes.length)}s`
                            : '—';
                        this._lastAiJob = {
                            jobId, slideIndices, numImages: slotsInitialised,
                            totalTime: fmt(Date.now() - startTime),
                            avgImgTime: avgSec,
                        };

                        dl.innerHTML = `
                            <a id="aimDlPptx" class="aim-download-btn"
                               href="/api/job/${jobId}/export-images/pptx" download>
                                ⬇ Download PPTX
                            </a>
                            <a id="aimDlPdf" class="aim-download-btn aim-download-btn-pdf"
                               href="/api/job/${jobId}/export-images/pdf" download>
                                ⬇ Download PDF
                            </a>
                            <button class="aim-download-btn aim-download-btn-magic"
                                    onclick="templateGallery.openMagicLayout('${jobId}', ${JSON.stringify(slideIndices)})">
                                🎨 Magic Layout
                            </button>
                            <button class="aim-close-btn"
                                    onclick="templateGallery._closeAiModal()">
                                Close
                            </button>`;
                        dl.style.display = 'flex';
                    }
                    return;
                }

                if (job.status === 'failed') {
                    stopTimer();
                    this._aiModalError(job.error || 'Generation failed');
                    return;
                }

                attempts++;
                if (attempts < maxAttempts) setTimeout(poll, 1500);
                else stopTimer();

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

    _aimRevealImage(jobId, slideIdx, cardIndex, durationSec) {
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

            if (durationSec) {
                const badge = document.createElement('div');
                badge.className = 'aim-time-badge';
                badge.textContent = `⏱ ${durationSec}s`;
                card.appendChild(badge);
            }

        };
        img.onerror = () => {
            setTimeout(() => this._aimRevealImage(jobId, slideIdx, cardIndex, durationSec), 2000);
        };
    }

    _closeAiModal() {
        document.getElementById('aiImagesModal')?.remove();
        if (this._lastAiJob) {
            const btn = document.getElementById('viewLastResultsBtn');
            if (btn) btn.style.display = 'block';
        }
    }


    reopenAiModal() {
        if (!this._lastAiJob) return;
        const { jobId, slideIndices, numImages, totalTime, avgImgTime } = this._lastAiJob;

        this._showAiImagesModal(numImages);

        // Show timing bar immediately with stored final values
        const timing = document.getElementById('aimTiming');
        if (timing) timing.style.display = 'block';
        const elapsedEl = document.getElementById('aimElapsed');
        const imgTEl    = document.getElementById('aimImgTime');
        const fill      = document.getElementById('aimProgressFill');
        const prog      = document.getElementById('aimProgressText');
        if (elapsedEl) elapsedEl.textContent = totalTime  || '—';
        if (imgTEl)    imgTEl.textContent    = avgImgTime || '—';
        if (fill)      fill.style.width      = '100%';
        if (prog)      prog.textContent      = `${slideIndices.length} / ${slideIndices.length}`;

        setTimeout(() => {
            this._aimStep(1, 'done', 'Document extracted ✓');
            this._aimStep(2, 'done', 'Prompts ready ✓');
            this._aimStep(3, 'done', `${slideIndices.length} images generated ✓`);

            const subtitle = document.getElementById('aimSubtitle');
            if (subtitle) subtitle.textContent = '✅ Your AI images are ready!';

            // Reveal all images
            slideIndices.forEach((slideIdx, i) => {
                this._aimRevealImage(jobId, slideIdx, i, null);
            });

            // Download buttons
            const dl = document.getElementById('aimDownload');
            if (dl) {
                dl.innerHTML = `
                    <a id="aimDlPptx" class="aim-download-btn"
                       href="/api/job/${jobId}/export-images/pptx" download>⬇ Download PPTX</a>
                    <a id="aimDlPdf" class="aim-download-btn aim-download-btn-pdf"
                       href="/api/job/${jobId}/export-images/pdf" download>⬇ Download PDF</a>
                    <button class="aim-download-btn aim-download-btn-magic"
                            onclick="templateGallery.openMagicLayout('${jobId}', ${JSON.stringify(slideIndices)})">
                        🎨 Magic Layout
                    </button>
                    <button class="aim-close-btn" onclick="templateGallery._closeAiModal()">Close</button>`;
                dl.style.display = 'flex';
            }
        }, 100);
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
        .aim-download-btn-magic { background: linear-gradient(135deg, #0ea5e9, #06b6d4); border: none; cursor: pointer; }
        .aim-download-btn-magic:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(6,182,212,0.4); }
        .aim-close-btn {
            padding: 12px 20px; border-radius: 10px;
            border: 2px solid #e2e8f0; background: #fff;
            color: #64748b; font-weight: 600; cursor: pointer;
        }
        .aim-error { color: #ef4444; margin-top: 12px; }
        .aim-timing {
            background: linear-gradient(135deg,#f0f4ff,#faf5ff);
            border: 1px solid #e0e7ff; border-radius: 12px;
            padding: 14px 18px; margin-bottom: 20px;
        }
        .aim-timing-row { display: flex; gap: 28px; margin-bottom: 12px; flex-wrap: wrap; }
        .aim-timing-stat { display: flex; flex-direction: column; gap: 2px; }
        .aim-timing-lbl { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
        .aim-timing-val { font-size: 1.1rem; font-weight: 800; color: #1e293b; font-variant-numeric: tabular-nums; }
        .aim-progress-track { height: 8px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
        .aim-progress-fill {
            height: 100%; border-radius: 999px; transition: width 0.6s ease;
            background: linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7);
        }
        .aim-time-badge {
            position: absolute; top: 6px; right: 6px;
            background: rgba(0,0,0,0.65); color: #fff;
            font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 700;
        }

        /* ── Magic Layout Modal ────────────────────────────────────────────── */
        .ml-overlay {
            position: fixed; inset: 0; z-index: 9999;
            background: rgba(0,0,0,0.85); backdrop-filter: blur(6px);
            display: flex; align-items: center; justify-content: center;
        }
        .ml-modal {
            background: #0f172a; border-radius: 16px;
            width: 95vw; max-width: 1300px; height: 90vh;
            display: flex; flex-direction: column; overflow: hidden;
            box-shadow: 0 24px 80px rgba(0,0,0,0.6);
        }
        .ml-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 16px 24px; border-bottom: 1px solid #1e293b;
            flex-shrink: 0;
        }
        .ml-header-title { color: #f1f5f9; font-size: 18px; font-weight: 700; }
        .ml-header-sub   { color: #64748b; font-size: 13px; margin-top: 2px; }
        .ml-header-actions { display: flex; gap: 10px; align-items: center; }
        .ml-btn-save {
            padding: 9px 22px; border-radius: 8px; border: none; cursor: pointer;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: #fff; font-weight: 700; font-size: 14px;
            transition: opacity 0.2s;
        }
        .ml-btn-save:hover { opacity: 0.85; }
        .ml-btn-save:disabled { opacity: 0.4; cursor: not-allowed; }
        .ml-btn-close {
            padding: 9px 18px; border-radius: 8px; cursor: pointer;
            background: #1e293b; border: 1px solid #334155;
            color: #94a3b8; font-weight: 600; font-size: 14px;
        }
        .ml-btn-close:hover { background: #334155; }
        .ml-body {
            display: flex; flex: 1; overflow: hidden;
        }
        .ml-sidebar {
            width: 180px; flex-shrink: 0;
            background: #0a0f1e; border-right: 1px solid #1e293b;
            overflow-y: auto; padding: 12px 8px; display: flex; flex-direction: column; gap: 10px;
        }
        .ml-thumb {
            position: relative; border-radius: 8px; overflow: hidden;
            border: 2px solid transparent; cursor: pointer; transition: border-color 0.2s;
            aspect-ratio: 4/3; background: #1e293b;
        }
        .ml-thumb:hover   { border-color: #6366f1; }
        .ml-thumb.active  { border-color: #22d3ee; }
        .ml-thumb img     { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ml-thumb-label {
            position: absolute; bottom: 0; left: 0; right: 0;
            background: rgba(0,0,0,0.6); color: #e2e8f0; font-size: 10px;
            text-align: center; padding: 3px;
        }
        .ml-thumb-saved {
            position: absolute; top: 4px; right: 4px;
            background: #22c55e; color: #fff; font-size: 10px;
            padding: 2px 6px; border-radius: 4px; font-weight: 700;
        }
        .ml-editor-area {
            flex: 1; display: flex; flex-direction: column; overflow: hidden;
        }
        .ml-editor-toolbar {
            padding: 8px 16px; background: #0a0f1e; border-bottom: 1px solid #1e293b;
            display: flex; align-items: center; gap: 10px; flex-shrink: 0;
        }
        .ml-editor-hint { color: #64748b; font-size: 13px; }
        .ml-editor-wrap {
            flex: 1; display: flex; align-items: center; justify-content: center;
            overflow: hidden; background: #111827; position: relative;
        }
        #mlEditorContainer { width: 100%; height: 100%; }
        .ml-placeholder {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            color: #475569; gap: 12px; user-select: none;
        }
        .ml-placeholder-icon { font-size: 48px; }
        .ml-placeholder-text { font-size: 15px; }
        .ml-save-status {
            padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 600;
            display: none;
        }
        .ml-save-status.ok    { display: inline-block; background: #166534; color: #4ade80; }
        .ml-save-status.error { display: inline-block; background: #7f1d1d; color: #fca5a5; }
        .ml-tool-btn {
            padding: 5px 11px; border: 1px solid #334155; border-radius: 6px;
            background: #1e293b; color: #94a3b8; cursor: pointer; font-size: 12px;
            transition: all 0.15s; white-space: nowrap;
        }
        .ml-tool-btn:hover  { background: #334155; color: #f1f5f9; }
        .ml-tool-btn.active { background: #6366f1; color: #fff; border-color: #6366f1; }
        `;
        document.head.appendChild(s);
    }

    // ── Magic Layout ───────────────────────────────────────────────────────────
    openMagicLayout(jobId, slideIndices) {
        document.getElementById('mlOverlay')?.remove();

        this._mlJobId       = jobId;
        this._mlSlides      = slideIndices;
        this._mlFabric      = null;
        this._mlActiveSlide = null;
        this._mlHistory     = [];
        this._mlSaved       = new Set();

        const thumbs = slideIndices.map((idx, i) => `
            <div class="ml-thumb" id="ml-thumb-${idx}" onclick="templateGallery._mlSelectSlide(${idx})">
                <img src="/api/job/${jobId}/ernie-image/${idx}?t=${Date.now()}" alt="Slide ${i+1}">
                <div class="ml-thumb-label">Slide ${i + 1}</div>
            </div>`).join('');

        const overlay = document.createElement('div');
        overlay.id = 'mlOverlay';
        overlay.className = 'ml-overlay';
        overlay.innerHTML = `
            <div class="ml-modal">
                <div class="ml-header">
                    <div>
                        <div class="ml-header-title">🎨 Magic Layout — Image Editor</div>
                        <div class="ml-header-sub">Select a slide thumbnail to edit, then save your changes</div>
                    </div>
                    <div class="ml-header-actions">
                        <span class="ml-save-status" id="mlSaveStatus"></span>
                        <button class="ml-btn-save" id="mlBtnSave" disabled onclick="templateGallery._mlSave()">
                            💾 Save Changes
                        </button>
                        <a class="ml-btn-save" style="text-decoration:none;background:linear-gradient(135deg,#059669,#10b981)"
                           href="/api/job/${jobId}/export-images/pptx" download>
                            ⬇ Download PPTX
                        </a>
                        <button class="ml-btn-close" onclick="document.getElementById('mlOverlay').remove()">✕ Close</button>
                    </div>
                </div>
                <div class="ml-body">
                    <div class="ml-sidebar">${thumbs}</div>
                    <div class="ml-editor-area">
                        <div class="ml-editor-wrap">
                            <div id="mlEditorContainer"></div>
                            <div class="ml-placeholder" id="mlPlaceholder">
                                <div class="ml-placeholder-icon">🖼️</div>
                                <div class="ml-placeholder-text">Click a slide on the left to start editing</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        // Create editor ONCE after modal is in the DOM
        setTimeout(() => this._mlInitEditor(), 150);
    }

    _mlInitEditor() {
        const container = document.getElementById('mlEditorContainer');
        if (!container || this._mlFabric) return;

        const wrap = container.closest('.ml-editor-wrap');
        const w = Math.max(wrap ? wrap.clientWidth  - 20 : 880, 600);
        const h = Math.max(wrap ? wrap.clientHeight - 60 : 480, 400);

        container.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:0;';
        container.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center;background:#0a0f1e;padding:8px 12px;
                        width:${w}px;box-sizing:border-box;border-radius:8px 8px 0 0;flex-wrap:wrap;border-bottom:1px solid #1e293b;">
                <button onclick="templateGallery._mlTool('draw')"   class="ml-tool-btn active" id="ml-t-draw">✏️ Draw</button>
                <button onclick="templateGallery._mlTool('select')" class="ml-tool-btn"        id="ml-t-select">👆 Select</button>
                <button onclick="templateGallery._mlTool('text')"   class="ml-tool-btn"        id="ml-t-text">T Text</button>
                <button onclick="templateGallery._mlTool('rect')"   class="ml-tool-btn"        id="ml-t-rect">▭ Cover</button>
                <span style="width:1px;background:#334155;height:22px;"></span>
                <input type="color" id="mlColor" value="#ff0000" title="Color"
                       style="width:30px;height:28px;border:2px solid #334155;border-radius:4px;cursor:pointer;background:none;padding:1px;"
                       oninput="templateGallery._mlColorChange(this.value)">
                <span style="color:#64748b;font-size:12px;">Size</span>
                <input type="range" id="mlBrushSize" min="1" max="50" value="6" style="width:70px;"
                       oninput="templateGallery._mlBrushSize(this.value)">
                <span style="width:1px;background:#334155;height:22px;"></span>
                <button onclick="templateGallery._mlUndo()"         class="ml-tool-btn">↩ Undo</button>
                <button onclick="templateGallery._mlClearDrawing()" class="ml-tool-btn" style="color:#f87171;">🗑 Clear</button>
            </div>
            <canvas id="mlCanvas" width="${w}" height="${h}"
                    style="display:block;border:1px solid #1e293b;border-top:none;"></canvas>
        `;

        this._mlFabric = new fabric.Canvas('mlCanvas', { isDrawingMode: true });
        this._mlFabric.freeDrawingBrush.color = '#ff0000';
        this._mlFabric.freeDrawingBrush.width = 6;
        this._mlFabric.on('object:added',    () => this._mlSnap());
        this._mlFabric.on('object:modified', () => this._mlSnap());

        // Double-click to re-edit placed text
        this._mlFabric.on('mouse:dblclick', (opt) => {
            const obj = opt.target;
            if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
                obj.enterEditing();
                obj.selectAll();
                this._mlFabric.renderAll();
            }
        });

        // Delete selected object with Delete/Backspace (not while editing text)
        document.getElementById('mlOverlay')?.addEventListener('keydown', (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && this._mlFabric) {
                const obj = this._mlFabric.getActiveObject();
                if (obj && !obj.isEditing) {
                    this._mlFabric.remove(obj);
                    this._mlFabric.renderAll();
                    this._mlSnap();
                }
            }
        });
    }

    async _mlSelectSlide(slideIdx) {
        document.querySelectorAll('.ml-thumb').forEach(t => t.classList.remove('active'));
        document.getElementById(`ml-thumb-${slideIdx}`)?.classList.add('active');
        this._mlActiveSlide = slideIdx;

        const placeholder = document.getElementById('mlPlaceholder');
        if (placeholder) placeholder.style.display = 'none';

        // Wait for Fabric canvas to be ready
        let tries = 0;
        while (!this._mlFabric && tries++ < 20) await new Promise(r => setTimeout(r, 100));
        if (!this._mlFabric) return;

        // Fetch image as base64 data URL
        let dataUrl;
        try {
            const resp = await fetch(`/api/job/${this._mlJobId}/ernie-image/${slideIdx}?t=${Date.now()}`);
            if (!resp.ok) throw new Error('Image not found');
            const blob = await resp.blob();
            dataUrl = await new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onload  = () => res(reader.result);
                reader.onerror = rej;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error('[MagicLayout] Could not fetch image:', e);
            return;
        }

        // Load into Fabric.js as background image
        const canvas = this._mlFabric;
        canvas.getObjects().forEach(o => canvas.remove(o));
        this._mlHistory = [];

        fabric.Image.fromURL(dataUrl, (img) => {
            const scaleX = canvas.width  / img.width;
            const scaleY = canvas.height / img.height;
            const scale  = Math.min(scaleX, scaleY);
            canvas.setBackgroundImage(img, () => {
                canvas.renderAll();
                this._mlSnap();
            }, {
                scaleX: scale, scaleY: scale,
                left: Math.max(0, (canvas.width  - img.width  * scale) / 2),
                top:  Math.max(0, (canvas.height - img.height * scale) / 2),
            });
        });

        document.getElementById('mlBtnSave').disabled = false;
    }

    _mlTool(name) {
        const canvas = this._mlFabric;
        if (!canvas) return;

        // Clean up any previous rect handlers
        if (this._mlRectCleanup) { this._mlRectCleanup(); this._mlRectCleanup = null; }

        document.querySelectorAll('.ml-tool-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`ml-t-${name}`)?.classList.add('active');

        canvas.isDrawingMode = (name === 'draw');
        canvas.selection     = (name === 'select');

        if (name === 'rect') {
            canvas.isDrawingMode = false;
            canvas.selection     = false;
            let rect, startX, startY, isDown = false;

            const onDown = (opt) => {
                isDown = true;
                const p = canvas.getPointer(opt.e);
                startX = p.x; startY = p.y;
                rect = new fabric.Rect({
                    left: startX, top: startY, width: 0, height: 0,
                    fill: document.getElementById('mlColor')?.value || '#ffffff',
                    selectable: true, strokeWidth: 0,
                });
                canvas.add(rect);
            };
            const onMove = (opt) => {
                if (!isDown || !rect) return;
                const p = canvas.getPointer(opt.e);
                rect.set({
                    left: Math.min(p.x, startX), top: Math.min(p.y, startY),
                    width: Math.abs(p.x - startX), height: Math.abs(p.y - startY),
                });
                canvas.renderAll();
            };
            const onUp = () => {
                if (!isDown) return;
                isDown = false; rect = null;
                this._mlSnap();
                this._mlTool('select');
            };

            canvas.on('mouse:down', onDown);
            canvas.on('mouse:move', onMove);
            canvas.on('mouse:up',   onUp);
            this._mlRectCleanup = () => {
                canvas.off('mouse:down', onDown);
                canvas.off('mouse:move', onMove);
                canvas.off('mouse:up',   onUp);
            };
        }

        if (name === 'text') {
            canvas.isDrawingMode = false;
            canvas.selection     = false;
            canvas.once('mouse:down', (opt) => {
                const p    = canvas.getPointer(opt.e);
                const text = new fabric.IText('Type here', {
                    left: p.x, top: p.y,
                    fontSize: 22, fontWeight: 'bold',
                    fill: document.getElementById('mlColor')?.value || '#ff0000',
                });
                canvas.add(text);
                canvas.setActiveObject(text);
                canvas.renderAll();
                setTimeout(() => {
                    text.enterEditing();
                    text.selectAll();
                    canvas.renderAll();
                }, 50);
                this._mlTool('select');
            });
        }
    }

    _mlColorChange(val) {
        if (!this._mlFabric) return;
        this._mlFabric.freeDrawingBrush.color = val;
        const obj = this._mlFabric.getActiveObject();
        if (obj) {
            obj.set(obj.type === 'i-text' || obj.type === 'text' ? 'fill' : 'stroke', val);
            this._mlFabric.renderAll();
        }
    }

    _mlBrushSize(val) {
        if (this._mlFabric) this._mlFabric.freeDrawingBrush.width = parseInt(val);
    }

    _mlSnap() {
        if (!this._mlFabric) return;
        this._mlHistory.push(JSON.stringify(this._mlFabric.toJSON(['backgroundImage'])));
    }

    _mlUndo() {
        if (!this._mlFabric || this._mlHistory.length < 2) return;
        this._mlHistory.pop();
        this._mlFabric.loadFromJSON(
            JSON.parse(this._mlHistory[this._mlHistory.length - 1]),
            () => this._mlFabric.renderAll()
        );
    }

    _mlClearDrawing() {
        if (!this._mlFabric) return;
        this._mlFabric.getObjects().forEach(o => this._mlFabric.remove(o));
        this._mlFabric.renderAll();
        this._mlSnap();
    }

    async _mlSave() {
        if (!this._mlFabric || this._mlActiveSlide === null) return;

        const btn    = document.getElementById('mlBtnSave');
        const status = document.getElementById('mlSaveStatus');
        btn.disabled = true;
        btn.textContent = '⏳ Saving...';
        status.className = 'ml-save-status';
        status.style.display = 'none';

        try {
            const dataUrl = this._mlFabric.toDataURL({ format: 'png', multiplier: 1 });
            const resp = await fetch(`/api/job/${this._mlJobId}/ernie-image/${this._mlActiveSlide}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_data: dataUrl }),
            });
            if (!resp.ok) throw new Error((await resp.json()).error || 'Save failed');

            // Refresh thumbnail
            const thumb = document.querySelector(`#ml-thumb-${this._mlActiveSlide} img`);
            if (thumb) thumb.src = `/api/job/${this._mlJobId}/ernie-image/${this._mlActiveSlide}?t=${Date.now()}`;

            // Show saved badge
            let badge = document.querySelector(`#ml-thumb-${this._mlActiveSlide} .ml-thumb-saved`);
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'ml-thumb-saved';
                badge.textContent = '✓ Saved';
                document.getElementById(`ml-thumb-${this._mlActiveSlide}`)?.appendChild(badge);
            }

            this._mlSaved.add(this._mlActiveSlide);
            status.textContent = '✓ Image saved!';
            status.className = 'ml-save-status ok';

        } catch (err) {
            status.textContent = '✗ ' + err.message;
            status.className = 'ml-save-status error';
        } finally {
            btn.disabled = false;
            btn.textContent = '💾 Save Changes';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.templateGallery = new TemplateGallery();
});
