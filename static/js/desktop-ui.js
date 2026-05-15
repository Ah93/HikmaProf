// Desktop UI Controller
const APP_PREFIX = window.APP_PREFIX || '';

class DesktopUI {
    constructor() {
        this.currentPanel = 'pdf-to-ppt';
        this.templates = [];
        this.colors = [];
        this.selectedTemplate = 'modern';
        this.selectedColor = 'blue';
        this.currentJobId = null;
        this.currentSlidePlan = null;
        this.init();
    }

    async init() {
        this.setupNavigation();
        this.setupFileUploads();
        await this.loadTemplatesAndColors();
        this.renderCompactTemplates();
        this.renderCompactColors();
        this.addRecentJobsStyles();
        console.log('Desktop UI initialized');
    }

    // Navigation
    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const panel = item.dataset.panel;
                if (panel) {
                    this.switchPanel(panel);
                }
            });
        });
    }

    switchPanel(panelId) {
        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.panel === panelId) {
                item.classList.add('active');
            }
        });

        // Update panels
        document.querySelectorAll('.panel-section').forEach(panel => {
            panel.classList.remove('active');
        });
        const targetPanel = document.getElementById(`panel-${panelId}`);
        if (targetPanel) {
            targetPanel.classList.add('active');
        }

        // Update page title
        const titles = {
            'pdf-to-ppt': ['AI-Powered Course & Knowledge Creation', 'Convert research, notes and manuscripts into complete teaching material: slides, lessons, and video-ready outputs'],
            'ppt-to-video': ['PowerPoint to Video', 'Add avatar narration to your slides'],
            'pdf-to-both': ['Complete Workflow', 'Generate both presentation and video'],
            'templates': ['Template Gallery', 'Browse and preview all templates'],
            'recent': ['Recent Jobs', 'View your presentation history'],
            'help': ['Help & Documentation', 'Learn how to use the platform']
        };

        if (titles[panelId]) {
            document.getElementById('pageTitle').textContent = titles[panelId][0];
            document.getElementById('pageSubtitle').textContent = titles[panelId][1];
        }

        this.currentPanel = panelId;

        // Load recent jobs when switching to that panel
        if (panelId === 'recent') {
            this.loadRecentJobs();
            this.startJobsPolling();
        } else {
            this.stopJobsPolling();
        }
    }

    // File Upload Handlers
    setupFileUploads() {
        // PDF to PPT file upload
        this.setupDropZone('fileDropZone', 'fileInput', (file) => {
            document.getElementById('fileSelectedInfo').style.display = 'flex';
            document.getElementById('fileName').textContent = file.name;
            document.getElementById('fileSize').textContent = this.formatFileSize(file.size);
        });

        // PPT file upload
        this.setupDropZone('pptDropZone', 'pptFileInput');

        // Transcript file upload
        this.setupDropZone('transcriptDropZone', 'transcriptFileInput');

        // PDF to Both file upload
        this.setupDropZone('fileBothDropZone', 'fileBothInput');

        // Form submissions
        this.setupFormSubmission('uploadFormPdfToPpt', APP_PREFIX + '/api/generate', 'pdf-to-ppt');
        this.setupFormSubmission('uploadFormPptToVideo', APP_PREFIX + '/api/generate-video', 'ppt-to-video');
        this.setupFormSubmission('uploadFormPdfToBoth', APP_PREFIX + '/api/generate', 'pdf-to-both');
    }

    setupDropZone(dropZoneId, inputId, onFileSelect) {
        const dropZone = document.getElementById(dropZoneId);
        const fileInput = document.getElementById(inputId);

        if (!dropZone || !fileInput) return;

        // Click to upload
        dropZone.addEventListener('click', () => fileInput.click());

        // File selected
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && onFileSelect) {
                onFileSelect(file);
            }
        });

        // Drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) {
                fileInput.files = e.dataTransfer.files;
                if (onFileSelect) {
                    onFileSelect(file);
                }
            }
        });
    }

    setupFormSubmission(formId, endpoint, mode) {
        const form = document.getElementById(formId);
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(form);
            formData.append('generation_mode', mode);

            // Add selected template and color (read from hidden inputs updated by gallery)
            formData.set('template_style', document.getElementById('templateStyle')?.value || this.selectedTemplate);
            formData.set('color_scheme', document.getElementById('colorScheme')?.value || this.selectedColor);

            try {
                const button = form.querySelector('.btn-primary');
                button.disabled = true;
                button.textContent = '⏳ Processing...';

                const response = await fetch(endpoint, {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (result.job_id) {
                    // Show notification and switch to Recent Jobs tab
                    this.showNotification(`✅ Job started! ID: ${result.job_id.substring(0, 8)}...`, 'success');

                    // Switch to Recent Jobs tab to show progress there
                    setTimeout(() => {
                        this.switchPanel('recent');
                    }, 500);

                    button.disabled = false;
                    button.textContent = '✨ Generate';
                } else {
                    this.showNotification('❌ Error: ' + (result.error || 'Unknown error'), 'error');
                    button.disabled = false;
                    button.textContent = '✨ Generate';
                }
            } catch (error) {
                this.showNotification('❌ Error: ' + error.message, 'error');
                button.disabled = false;
                button.textContent = '✨ Generate';
            }
        });
    }

    // Templates and Colors
    async loadTemplatesAndColors() {
        try {
            const response = await fetch(APP_PREFIX + '/api/templates');
            const data = await response.json();
            this.templates = data.templates || [];
            this.colors = data.colors || [];
            console.log(`Loaded ${this.templates.length} templates and ${this.colors.length} colors`);
        } catch (error) {
            console.error('Failed to load templates:', error);
        }
    }

    renderCompactTemplates() {
        const select = document.getElementById('templateSelect');
        if (!select) return;

        // Show ALL templates grouped by category
        const categories = {
            'professional': 'Professional',
            'modern': 'Modern & Tech',
            'creative': 'Creative',
            'elegant': 'Elegant',
            'minimal': 'Minimal'
        };

        // Group templates by category
        const grouped = {};
        this.templates.forEach(template => {
            const cat = template.category || 'other';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(template);
        });

        let html = '';
        Object.keys(categories).forEach(catKey => {
            if (grouped[catKey] && grouped[catKey].length > 0) {
                html += `<optgroup label="${categories[catKey]}">`;
                html += grouped[catKey].map(template => `
                    <option value="${template.id}"
                            ${template.id === this.selectedTemplate ? 'selected' : ''}
                            title="${template.description || template.name}">
                        ${template.name}
                    </option>
                `).join('');
                html += `</optgroup>`;
            }
        });

        select.innerHTML = html;
        // Sync hidden input
        const hiddenInput = document.getElementById('templateStyle');
        if (hiddenInput) hiddenInput.value = this.selectedTemplate;
    }

    renderCompactColors() {
        const container = document.getElementById('colorGridCompact');
        if (!container) return;

        // Show ALL colors grouped by light/dark
        const lightColors = this.colors.filter(c => c.category === 'light');
        const darkColors = this.colors.filter(c => c.category === 'dark');

        let html = '';

        // Light colors section
        html += `<div class="color-category-section">
            <div class="color-category-label">Light Themes</div>
            <div class="color-category-grid">`;
        html += lightColors.map(color => `
            <div class="color-option ${color.id === this.selectedColor ? 'selected' : ''}"
                 data-color-id="${color.id}"
                 style="background: ${color.primary}"
                 onclick="desktopUI.selectColor('${color.id}')"
                 title="${color.name}">
            </div>
        `).join('');
        html += `</div></div>`;

        // Dark colors section
        if (darkColors.length > 0) {
            html += `<div class="color-category-section">
                <div class="color-category-label">Dark Themes</div>
                <div class="color-category-grid">`;
            html += darkColors.map(color => `
                <div class="color-option ${color.id === this.selectedColor ? 'selected' : ''}"
                     data-color-id="${color.id}"
                     style="background: ${color.primary}"
                     onclick="desktopUI.selectColor('${color.id}')"
                     title="${color.name}">
                </div>
            `).join('');
            html += `</div></div>`;
        }

        container.innerHTML = html;
    }

    selectTemplate(templateId) {
        this.selectedTemplate = templateId;
        const select = document.getElementById('templateSelect');
        if (select) select.value = templateId;
        const hiddenInput = document.getElementById('templateStyle');
        if (hiddenInput) hiddenInput.value = templateId;
        console.log('Selected template:', templateId);
    }

    selectLayout(layoutId, labelEl) {
        document.querySelectorAll('.layout-option').forEach(el => el.classList.remove('selected'));
        if (labelEl) labelEl.classList.add('selected');
        const radio = document.querySelector(`input[name="slide_layout"][value="${layoutId}"]`);
        if (radio) radio.checked = true;
    }

    selectColor(colorId) {
        this.selectedColor = colorId;
        document.querySelectorAll('.color-option').forEach(option => {
            option.classList.remove('selected');
            if (option.dataset.colorId === colorId) {
                option.classList.add('selected');
            }
        });
        console.log('Selected color:', colorId);
    }

    // Slide Editor Template/Color Methods
    getTemplateName(templateId) {
        const template = this.templates.find(t => t.id === templateId);
        return template ? template.name : templateId;
    }

    getColorName(colorId) {
        const color = this.colors.find(c => c.id === colorId);
        return color ? color.name : colorId;
    }

    toggleEditorSettings() {
        const panel = document.getElementById('editorSettingsPanel');
        const arrow = document.getElementById('settingsArrow');
        if (panel) {
            const isVisible = panel.style.display !== 'none';
            panel.style.display = isVisible ? 'none' : 'block';
            if (arrow) arrow.textContent = isVisible ? '▼' : '▲';
        }
    }

    renderEditorTemplates(currentTemplate) {
        return this.templates.map(template => `
            <div class="template-option-editor ${template.id === currentTemplate ? 'selected' : ''}"
                 data-template-id="${template.id}"
                 onclick="desktopUI.selectEditorTemplate('${template.id}')"
                 title="${template.description || template.name}">
                <div class="template-option-name">${template.name}</div>
            </div>
        `).join('');
    }

    renderEditorColors(currentColor) {
        return this.colors.map(color => `
            <div class="color-option-editor ${color.id === currentColor ? 'selected' : ''}"
                 data-color-id="${color.id}"
                 style="background: ${color.primary}"
                 onclick="desktopUI.selectEditorColor('${color.id}')"
                 title="${color.name}">
            </div>
        `).join('');
    }

    selectEditorTemplate(templateId) {
        // Update current selection
        this.selectedTemplate = templateId;

        // Update slidePlan metadata
        if (this.currentSlidePlan) {
            if (!this.currentSlidePlan.metadata) {
                this.currentSlidePlan.metadata = {};
            }
            this.currentSlidePlan.metadata.template = templateId;
        }

        // Update hidden form field
        const input = document.getElementById('templateStyle');
        if (input) input.value = templateId;

        // Update UI in editor
        document.querySelectorAll('.template-option-editor').forEach(option => {
            option.classList.remove('selected');
            if (option.dataset.templateId === templateId) {
                option.classList.add('selected');
            }
        });

        // Update display name
        const nameEl = document.getElementById('currentTemplateName');
        if (nameEl) nameEl.textContent = this.getTemplateName(templateId);

        console.log('Selected editor template:', templateId);
    }

    onLanguageChange(lang) {
        // Language selection is handled server-side only
    }

    selectEditorColor(colorId) {
        // Update current selection
        this.selectedColor = colorId;

        // Update slidePlan metadata
        if (this.currentSlidePlan) {
            if (!this.currentSlidePlan.metadata) {
                this.currentSlidePlan.metadata = {};
            }
            this.currentSlidePlan.metadata.colorScheme = colorId;
        }

        // Update hidden form field
        const input = document.getElementById('colorScheme');
        if (input) input.value = colorId;

        // Update UI in editor
        document.querySelectorAll('.color-option-editor').forEach(option => {
            option.classList.remove('selected');
            if (option.dataset.colorId === colorId) {
                option.classList.add('selected');
            }
        });

        // Update display name
        const nameEl = document.getElementById('currentColorName');
        if (nameEl) nameEl.textContent = this.getColorName(colorId);

        console.log('Selected editor color:', colorId);
    }

    // Progress Modal
    showProgressModal(jobId) {
        // Remove existing modal if any
        const existingModal = document.getElementById('progressModal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'progressModal';
        modal.className = 'progress-modal';
        modal.innerHTML = `
            <div class="progress-modal-content">
                <div class="progress-modal-header">
                    <h3>🚀 Generating Presentation</h3>
                    <span class="job-id">Job ID: ${jobId}</span>
                </div>
                <div class="progress-modal-body">
                    <div class="progress-status" id="progressStatus">Starting...</div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" id="progressBarFill" style="width: 0%"></div>
                    </div>
                    <div class="progress-percent" id="progressPercentText">0%</div>
                    <div class="progress-step" id="progressStep"></div>
                </div>
                <div class="progress-modal-footer" id="progressModalFooter" style="display: none;">
                    <a href="#" id="downloadLink" class="btn-primary" style="display: none;">📥 Download PPTX</a>
                    <a href="#" id="videoLink" class="btn-secondary" style="display: none;">🎥 Download Video</a>
                    <button onclick="desktopUI.closeProgressModal()" class="btn-secondary">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Add modal styles if not already present
        if (!document.getElementById('progressModalStyles')) {
            const styles = document.createElement('style');
            styles.id = 'progressModalStyles';
            styles.textContent = `
                .progress-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                }
                .progress-modal-content {
                    background: #1e1e2e;
                    border-radius: 16px;
                    padding: 32px;
                    width: min(620px, 92vw);
                    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                    border: 1px solid rgba(255,255,255,0.1);
                }
                .progress-modal-header {
                    text-align: center;
                    margin-bottom: 24px;
                }
                .progress-modal-header h3 {
                    color: #fff;
                    font-size: 24px;
                    margin: 0 0 8px 0;
                }
                .job-id {
                    color: #888;
                    font-size: 12px;
                    font-family: monospace;
                }
                .progress-modal-body {
                    text-align: center;
                }
                .progress-status {
                    color: #fff;
                    font-size: 18px;
                    margin-bottom: 16px;
                    font-weight: 500;
                }
                .progress-bar-container {
                    background: #2a2a3e;
                    border-radius: 10px;
                    height: 20px;
                    overflow: hidden;
                    margin-bottom: 12px;
                }
                .progress-bar-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #2AADA6, #1D2D5C);
                    border-radius: 10px;
                    transition: width 0.3s ease;
                }
                .progress-percent {
                    color: #2AADA6;
                    font-size: 28px;
                    font-weight: bold;
                    margin-bottom: 8px;
                }
                .progress-step {
                    color: #888;
                    font-size: 14px;
                    min-height: 20px;
                }
                .progress-modal-footer {
                    margin-top: 24px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    justify-content: center;
                }
                .progress-modal-footer .btn-primary,
                .progress-modal-footer .btn-secondary {
                    padding: 9px 16px;
                    border-radius: 8px;
                    font-size: 13px;
                    cursor: pointer;
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    white-space: nowrap;
                    flex: 1 1 auto;
                    justify-content: center;
                    min-width: 0;
                    max-width: 100%;
                }
                .progress-modal-footer .btn-primary {
                    background: linear-gradient(135deg, #2AADA6, #1D2D5C);
                    color: white;
                    border: none;
                }
                .progress-modal-footer .btn-secondary {
                    background: #2a2a3e;
                    color: #fff;
                    border: 1px solid rgba(255,255,255,0.2);
                }
                .progress-modal-footer .btn-secondary:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
            `;
            document.head.appendChild(styles);
        }
    }

    closeProgressModal() {
        const modal = document.getElementById('progressModal');
        if (modal) modal.remove();
    }

    updateProgress(percent, status, step) {
        const fill = document.getElementById('progressBarFill');
        const percentText = document.getElementById('progressPercentText');
        const statusText = document.getElementById('progressStatus');
        const stepText = document.getElementById('progressStep');

        if (fill) fill.style.width = `${percent}%`;
        if (percentText) percentText.textContent = `${percent}%`;
        if (statusText) statusText.textContent = status;
        if (stepText) stepText.textContent = step || '';
    }

    async pollJobStatus(jobId, button) {
        let attempts = 0;
        const maxAttempts = 600; // 10 minutes max
        let lastSignature = '';

        const poll = async () => {
            try {
                const response = await fetch(`${APP_PREFIX}/api/job/${jobId}`);
                if (!response.ok) throw new Error('Failed to get job status');

                const job = await response.json();
                const signature = `${job.status}|${job.progress || 0}|${job.step || ''}`;

                // Update progress based on status
                if (job.status === 'queued') {
                    this.updateProgress(5, 'Queued...', 'Waiting to start');
                } else if (job.status === 'parsing') {
                    this.updateProgress(job.progress || 15, 'Parsing Document', job.step_description || 'Extracting content');
                } else if (job.status === 'analyzing') {
                    this.updateProgress(job.progress || 40, 'AI Analysis', job.step_description || 'Planning slides');
                } else if (job.status === 'awaiting_approval') {
                    this.updateProgress(50, 'Preview Ready', 'Review slides before continuing');
                    await this.showPreviewReady(jobId, job.slide_plan);
                    button.disabled = false;
                    button.textContent = '✨ Generate';
                    return; // Stop polling
                } else if (job.status === 'generating') {
                    this.updateProgress(job.progress || 70, 'Generating PowerPoint', job.step_description || 'Creating slides');
                } else if (job.status === 'video_generation') {
                    this.updateProgress(job.progress || 75, 'Generating Video', job.step_description || 'Processing video');
                } else if (job.status === 'completed') {
                    this.updateProgress(100, '✅ Complete!', 'Your presentation is ready');
                    this.showDownloadLinks(jobId, job);
                    button.disabled = false;
                    button.textContent = '✨ Generate';
                    return; // Stop polling
                } else if (job.status === 'failed') {
                    this.updateProgress(0, '❌ Failed', job.error || 'Unknown error');
                    document.getElementById('progressModalFooter').style.display = 'flex';
                    button.disabled = false;
                    button.textContent = '✨ Generate';
                    return; // Stop polling
                }

                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(poll, 1000);
                } else {
                    this.updateProgress(0, '⏱️ Timeout', 'Job took too long');
                    button.disabled = false;
                    button.textContent = '✨ Generate';
                }
            } catch (error) {
                console.error('Polling error:', error);
                this.updateProgress(0, '❌ Error', error.message);
                button.disabled = false;
                button.textContent = '✨ Generate';
            }
        };

        poll();
    }

    async showPreviewReady(jobId, slidePlan) {
        // Store for later use
        this.currentJobId = jobId;
        this.currentSlidePlan = slidePlan;

        // If slide plan not provided, try to fetch it
        if (!slidePlan || !slidePlan.slides) {
            console.log('Slide plan not in job status, fetching from API...');
            try {
                const response = await fetch(`${APP_PREFIX}/api/job/${jobId}/slide-plan-data`);
                if (response.ok) {
                    this.currentSlidePlan = await response.json();
                    slidePlan = this.currentSlidePlan;
                    console.log('Fetched slide plan:', slidePlan);
                }
            } catch (e) {
                console.error('Failed to fetch slide plan:', e);
            }
        }

        console.log('showPreviewReady - jobId:', jobId, 'slidePlan:', slidePlan);

        const footer = document.getElementById('progressModalFooter');
        footer.style.display = 'flex';
        footer.innerHTML = `
            <button onclick="desktopUI.showSlideEditor('${jobId}')" class="btn-primary">📝 View & Edit Slides</button>
            <button onclick="desktopUI.continueGeneration('${jobId}')" class="btn-secondary">⏩ Skip & Generate</button>
            <button onclick="desktopUI.closeProgressModal()" class="btn-secondary">Cancel</button>
        `;

        if (slidePlan && slidePlan.slides) {
            document.getElementById('progressStep').textContent = `${slidePlan.slides.length} slides planned - Click "View & Edit" to review`;
        } else {
            document.getElementById('progressStep').textContent = 'Slides ready - Click "View & Edit" to review';
        }
    }

    async showSlideEditor(jobId) {
        // Close progress modal
        this.closeProgressModal();

        // Create slide editor modal
        const existingEditor = document.getElementById('slideEditorModal');
        if (existingEditor) existingEditor.remove();

        let slidePlan = this.currentSlidePlan;

        // If no slide plan, try to fetch it
        if (!slidePlan || !slidePlan.slides) {
            console.log('Fetching slide plan for editor...');
            try {
                const response = await fetch(`${APP_PREFIX}/api/job/${jobId}/slide-plan-data`);
                if (response.ok) {
                    slidePlan = await response.json();
                    this.currentSlidePlan = slidePlan;
                    console.log('Fetched slide plan for editor:', slidePlan);
                }
            } catch (e) {
                console.error('Failed to fetch slide plan:', e);
            }
        }

        if (!slidePlan || !slidePlan.slides) {
            alert('No slide plan available. The document may still be processing.');
            return;
        }

        console.log('Opening slide editor with', slidePlan.slides.length, 'slides');

        // Initialize current slide index
        this.currentSlideIndex = 0;
        this.totalSlides = slidePlan.slides.length;

        const modal = document.createElement('div');
        modal.id = 'slideEditorModal';
        modal.className = 'slide-editor-modal';
        // Get current template/color from slidePlan metadata or defaults
        const currentTemplate = slidePlan.metadata?.template || this.selectedTemplate || 'modern';
        const currentColor = slidePlan.metadata?.colorScheme || this.selectedColor || 'blue';

        modal.innerHTML = `
            <div class="slide-editor-content">
                <div class="slide-editor-header">
                    <h3>📝 Review & Edit Slides</h3>
                    <span class="slide-counter" id="slideCounter">Slide 1 of ${this.totalSlides}</span>
                </div>
                <div class="slide-editor-settings">
                    <div class="settings-toggle" onclick="desktopUI.toggleEditorSettings()">
                        <span>🎨 Template & Color Settings</span>
                        <span class="settings-current">
                            <span id="currentTemplateName">${this.getTemplateName(currentTemplate)}</span> •
                            <span id="currentColorName">${this.getColorName(currentColor)}</span>
                        </span>
                        <span class="toggle-arrow" id="settingsArrow">▼</span>
                    </div>
                    <div class="settings-panel" id="editorSettingsPanel" style="display: none;">
                        <div class="settings-section">
                            <label class="settings-label">Template Style</label>
                            <div class="template-grid-editor" id="templateGridEditor">
                                ${this.renderEditorTemplates(currentTemplate)}
                            </div>
                        </div>
                        <div class="settings-section">
                            <label class="settings-label">Color Scheme</label>
                            <div class="color-grid-editor" id="colorGridEditor">
                                ${this.renderEditorColors(currentColor)}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="slide-editor-body" id="slideEditorBody">
                    ${this.renderSingleSlideEditor(slidePlan.slides, 0)}
                </div>
                <div class="slide-editor-nav">
                    <button onclick="desktopUI.prevSlide()" class="btn-nav" id="prevSlideBtn" disabled>← Previous</button>
                    <div class="slide-dots" id="slideDots">
                        ${slidePlan.slides.map((_, i) => `<span class="slide-dot ${i === 0 ? 'active' : ''}" onclick="desktopUI.goToSlide(${i})"></span>`).join('')}
                    </div>
                    <button onclick="desktopUI.nextSlide()" class="btn-nav" id="nextSlideBtn" ${this.totalSlides <= 1 ? 'disabled' : ''}>Next →</button>
                </div>
                <div class="slide-editor-footer">
                    <button onclick="desktopUI.saveAndContinue('${jobId}')" class="btn-primary">✅ Save & Generate</button>
                    <button onclick="desktopUI.saveEdits('${jobId}')" class="btn-secondary">💾 Save Edits</button>
                    <button onclick="desktopUI.closeSlideEditor()" class="btn-secondary">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Add slide editor styles
        this.addSlideEditorStyles();
    }

    renderSingleSlideEditor(slides, index) {
        const slide = slides[index];
        if (!slide) return '<div class="no-slide">No slide data</div>';

        const layoutOptions = [
            { id: 'title-slide', name: 'Title Slide', icon: '🎯' },
            { id: 'section-header', name: 'Section Header', icon: '📑' },
            { id: 'title-bullets', name: 'Title + Bullets', icon: '📝' },
            { id: 'title-two-columns', name: 'Two Columns', icon: '📊' },
            { id: 'title-image-text', name: 'Image + Text', icon: '🖼️' },
            { id: 'title-chart', name: 'Chart', icon: '📈' },
            { id: 'title-table', name: 'Table', icon: '📋' },
            { id: 'title-cards', name: 'Cards', icon: '🃏' },
            { id: 'quote-slide', name: 'Quote', icon: '💬' },
            { id: 'conclusion', name: 'Conclusion', icon: '🎯' },
            { id: 'thank-you', name: 'Thank You', icon: '🙏' }
        ];

        const layout = slide.layout || 'title-bullets';
        const content = slide.content || {};
        const title = content.title || content.sectionTitle || '';
        const subtitle = content.subtitle || '';
        const bulletsArray = (content.bullets && Array.isArray(content.bullets))
            ? content.bullets.map(b => typeof b === 'string' ? b : (b.text || ''))
            : [];
        const bullets = bulletsArray.join('\n');
        const keyTakeawaysArray = (content.keyTakeaways && Array.isArray(content.keyTakeaways))
            ? content.keyTakeaways
            : [];
        const keyTakeaways = keyTakeawaysArray.join('\n');
        const notes = slide.speakerNotes || '';

        // Two columns content - handle both string and object formats
        const leftColumn = content.leftColumn || { bullets: [] };
        const rightColumn = content.rightColumn || { bullets: [] };
        const leftBullets = (leftColumn.bullets || []).map(b => typeof b === 'string' ? b : (b.text || '')).join('\n');
        const rightBullets = (rightColumn.bullets || []).map(b => typeof b === 'string' ? b : (b.text || '')).join('\n');

        // Table content
        const table = content.table || { headers: [], rows: [] };
        const tableHeaders = (table.headers || []).join(' | ');
        const tableRows = (table.rows || []).map(r => (r || []).join(' | ')).join('\n');

        // Quote content
        const quote = content.quote || '';
        const author = content.author || '';

        // Image content
        const imagePrompt = content.imagePrompt || content.imageDescription || '';
        const imagePath = content.imagePath || '';

        // Cards content
        const cards = content.cards || [];
        const cardsText = cards.map(c => `${c.title || ''}: ${c.description || ''}`).join('\n');

        const previewHtml = this.renderSlidePreview(layout, title, bulletsArray, keyTakeawaysArray, content);

        // Build content editor based on layout
        let contentEditor = '';

        switch(layout) {
            case 'title-slide':
                contentEditor = `
                    <div class="edit-field">
                        <label>Main Title</label>
                        <input type="text" class="edit-input edit-input-large" data-slide-index="${index}" data-field="title" value="${this.escapeHtml(title)}" oninput="desktopUI.updateSlidePreview(${index})" />
                    </div>
                    <div class="edit-field">
                        <label>Subtitle</label>
                        <input type="text" class="edit-input" data-slide-index="${index}" data-field="subtitle" value="${this.escapeHtml(subtitle)}" oninput="desktopUI.updateSlidePreview(${index})" />
                    </div>
                    <div class="edit-field">
                        <label>Author(s)</label>
                        <input type="text" class="edit-input" data-slide-index="${index}" data-field="author" value="${this.escapeHtml(author)}" placeholder="e.g. John Smith, Jane Doe" />
                    </div>
                    <div class="edit-field">
                        <label>Year / Date</label>
                        <input type="text" class="edit-input" data-slide-index="${index}" data-field="date" value="${this.escapeHtml(content.date || '')}" placeholder="e.g. 2024" />
                    </div>
                `;
                break;

            case 'section-header':
                contentEditor = `
                    <div class="edit-field">
                        <label>Section Title</label>
                        <input type="text" class="edit-input edit-input-large" data-slide-index="${index}" data-field="title" value="${this.escapeHtml(title)}" oninput="desktopUI.updateSlidePreview(${index})" />
                    </div>
                    <div class="edit-field">
                        <label>Section Subtitle (optional)</label>
                        <input type="text" class="edit-input" data-slide-index="${index}" data-field="subtitle" value="${this.escapeHtml(subtitle)}" />
                    </div>
                `;
                break;

            case 'title-two-columns':
                contentEditor = `
                    <div class="edit-field">
                        <label>Title</label>
                        <input type="text" class="edit-input" data-slide-index="${index}" data-field="title" value="${this.escapeHtml(title)}" oninput="desktopUI.updateSlidePreview(${index})" />
                    </div>
                    <div class="edit-columns">
                        <div class="edit-column">
                            <div class="edit-field">
                                <label>Left Column Title</label>
                                <input type="text" class="edit-input" data-slide-index="${index}" data-field="leftColumnTitle" value="${this.escapeHtml(leftColumn.title || '')}" />
                            </div>
                            <div class="edit-field">
                                <label>Left Column Bullets</label>
                                <textarea class="edit-textarea" data-slide-index="${index}" data-field="leftColumnBullets" rows="4">${this.escapeHtml(leftBullets)}</textarea>
                            </div>
                        </div>
                        <div class="edit-column">
                            <div class="edit-field">
                                <label>Right Column Title</label>
                                <input type="text" class="edit-input" data-slide-index="${index}" data-field="rightColumnTitle" value="${this.escapeHtml(rightColumn.title || '')}" />
                            </div>
                            <div class="edit-field">
                                <label>Right Column Bullets</label>
                                <textarea class="edit-textarea" data-slide-index="${index}" data-field="rightColumnBullets" rows="4">${this.escapeHtml(rightBullets)}</textarea>
                            </div>
                        </div>
                    </div>
                `;
                break;

            case 'title-table':
                contentEditor = `
                    <div class="edit-field">
                        <label>Title</label>
                        <input type="text" class="edit-input" data-slide-index="${index}" data-field="title" value="${this.escapeHtml(title)}" oninput="desktopUI.updateSlidePreview(${index})" />
                    </div>
                    <div class="edit-field">
                        <label>Table Caption</label>
                        <input type="text" class="edit-input" data-slide-index="${index}" data-field="tableCaption" value="${this.escapeHtml(table.caption || '')}" placeholder="Optional table description" />
                    </div>
                    <div class="edit-field table-builder-section">
                        <label>Table Data</label>
                        <div class="table-builder-controls">
                            <button type="button" class="btn-small" onclick="desktopUI.addTableColumn(${index})">+ Column</button>
                            <button type="button" class="btn-small" onclick="desktopUI.addTableRow(${index})">+ Row</button>
                            <button type="button" class="btn-small btn-danger-small" onclick="desktopUI.removeTable(${index})">Remove Table</button>
                        </div>
                        <div id="tableBuilder${index}" class="table-builder-wrapper">
                            ${this.renderTableBuilder(index, table)}
                        </div>
                    </div>
                `;
                break;

            case 'title-image-text':
                const hasImage = content.image && content.image.path;
                const imagePreviewHtml = hasImage ?
                    `<div class="image-preview-container"><img src="${this.escapeHtml(content.image.path)}" alt="${this.escapeHtml(content.image.alt || '')}" class="image-preview" /></div>` : '';

                contentEditor = `
                    <div class="edit-field">
                        <label>Title</label>
                        <input type="text" class="edit-input" data-slide-index="${index}" data-field="title" value="${this.escapeHtml(title)}" oninput="desktopUI.updateSlidePreview(${index})" />
                    </div>
                    <div class="edit-field">
                        <label>Text Content (one bullet per line)</label>
                        <textarea class="edit-textarea" data-slide-index="${index}" data-field="bullets" rows="4" oninput="desktopUI.updateSlidePreview(${index})">${this.escapeHtml(bullets)}</textarea>
                    </div>
                    <div class="edit-field image-upload-section">
                        <label>🖼️ Upload Image</label>
                        <div class="image-editor-group">
                            <div class="file-input-wrapper">
                                <input class="image-file-input" type="file" accept="image/*" data-slide-index="${index}" onchange="desktopUI.handleImageUpload(event)" />
                                <span class="file-input-label">Click to upload image (Max 5MB)</span>
                            </div>
                            ${imagePreviewHtml}
                            <div class="image-options">
                                <input class="edit-input" type="text" data-slide-index="${index}" data-field="imageAlt" placeholder="Image description/alt text" value="${this.escapeHtml(content.image?.alt || '')}" />
                                <select class="edit-input" data-slide-index="${index}" data-field="imagePosition">
                                    <option value="center" ${content.image?.position === 'center' ? 'selected' : ''}>Center</option>
                                    <option value="left" ${content.image?.position === 'left' ? 'selected' : ''}>Left</option>
                                    <option value="right" ${content.image?.position === 'right' ? 'selected' : ''}>Right</option>
                                </select>
                                ${hasImage ? `<button type="button" class="btn-small btn-danger-small" onclick="desktopUI.removeImage(${index})">Remove Image</button>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="edit-field">
                        <label>Or describe image for AI generation</label>
                        <textarea class="edit-textarea" data-slide-index="${index}" data-field="imagePrompt" rows="2" placeholder="Describe the image you want...">${this.escapeHtml(imagePrompt)}</textarea>
                    </div>
                `;
                break;

            case 'quote-slide':
                contentEditor = `
                    <div class="edit-field">
                        <label>Quote</label>
                        <textarea class="edit-textarea edit-textarea-large" data-slide-index="${index}" data-field="quote" rows="4" oninput="desktopUI.updateSlidePreview(${index})">${this.escapeHtml(quote)}</textarea>
                    </div>
                    <div class="edit-field">
                        <label>Author / Attribution</label>
                        <input type="text" class="edit-input" data-slide-index="${index}" data-field="author" value="${this.escapeHtml(author)}" />
                    </div>
                `;
                break;

            case 'title-cards':
                contentEditor = `
                    <div class="edit-field">
                        <label>Title</label>
                        <input type="text" class="edit-input" data-slide-index="${index}" data-field="title" value="${this.escapeHtml(title)}" oninput="desktopUI.updateSlidePreview(${index})" />
                    </div>
                    <div class="edit-field">
                        <label>Cards (format: Title: Description, one per line)</label>
                        <textarea class="edit-textarea" data-slide-index="${index}" data-field="cards" rows="6" placeholder="Card Title: Card description&#10;Another Card: Another description">${this.escapeHtml(cardsText)}</textarea>
                    </div>
                `;
                break;

            case 'title-chart':
                contentEditor = `
                    <div class="edit-field">
                        <label>Title</label>
                        <input type="text" class="edit-input" data-slide-index="${index}" data-field="title" value="${this.escapeHtml(title)}" oninput="desktopUI.updateSlidePreview(${index})" />
                    </div>
                    <div class="edit-field">
                        <label>Chart Type</label>
                        <select class="edit-input" data-slide-index="${index}" data-field="chartType">
                            <option value="bar" ${content.chartType === 'bar' ? 'selected' : ''}>Bar Chart</option>
                            <option value="line" ${content.chartType === 'line' ? 'selected' : ''}>Line Chart</option>
                            <option value="pie" ${content.chartType === 'pie' ? 'selected' : ''}>Pie Chart</option>
                            <option value="doughnut" ${content.chartType === 'doughnut' ? 'selected' : ''}>Doughnut Chart</option>
                        </select>
                    </div>
                    <div class="edit-field">
                        <label>Chart Data (format: Label: Value, one per line)</label>
                        <textarea class="edit-textarea" data-slide-index="${index}" data-field="chartData" rows="5" placeholder="Q1: 100&#10;Q2: 150&#10;Q3: 200">${this.escapeHtml((content.chartData || []).map(d => `${d.label}: ${d.value}`).join('\n'))}</textarea>
                    </div>
                `;
                break;

            case 'conclusion':
            case 'thank-you':
                contentEditor = `
                    <div class="edit-field">
                        <label>Title</label>
                        <input type="text" class="edit-input" data-slide-index="${index}" data-field="title" value="${this.escapeHtml(title)}" oninput="desktopUI.updateSlidePreview(${index})" />
                    </div>
                    <div class="edit-field">
                        <label>Key Takeaways (one per line)</label>
                        <textarea class="edit-textarea" data-slide-index="${index}" data-field="keyTakeaways" rows="5" oninput="desktopUI.updateSlidePreview(${index})">${this.escapeHtml(keyTakeaways)}</textarea>
                    </div>
                `;
                break;

            default: // title-bullets and others
                contentEditor = `
                    <div class="edit-field">
                        <label>Title</label>
                        <input type="text" class="edit-input" data-slide-index="${index}" data-field="title" value="${this.escapeHtml(title)}" oninput="desktopUI.updateSlidePreview(${index})" />
                    </div>
                    <div class="edit-field">
                        <label>Bullet Points (one per line)</label>
                        <textarea class="edit-textarea" data-slide-index="${index}" data-field="bullets" rows="5" oninput="desktopUI.updateSlidePreview(${index})">${this.escapeHtml(bullets)}</textarea>
                    </div>

                    <!-- Add Image as New Slide -->
                    <div class="edit-field">
                        <label>🖼️ Add Image (inserts a new slide after this one)</label>
                        <div class="image-editor-group">
                            <div class="file-input-wrapper">
                                <input class="image-file-input" type="file" accept="image/*" data-slide-index="${index}" onchange="desktopUI.handleImageAsNewSlide(event)" />
                                <span class="file-input-label">Click to upload — a new image slide will be added below</span>
                            </div>
                            <input class="edit-input" type="text" id="imageCaption${index}" placeholder="Image caption (optional)" style="margin-top:8px;" />
                        </div>
                    </div>

                    <!-- Add Table as New Slide -->
                    <div class="edit-field">
                        <label>📊 Add Table (inserts a new slide after this one)</label>
                        <div class="table-editor-group">
                            <input class="edit-input" type="text" id="tableCaption${index}" placeholder="Table caption (optional)" style="margin-bottom:8px;" />
                            <button type="button" class="btn-small" onclick="desktopUI.initTableAsNewSlide(${index})">➕ Create Table Slide</button>
                        </div>
                    </div>
                `;
        }

        return `
            <div class="slide-editor-single" data-slide-index="${index}">
                <div class="slide-editor-toolbar">
                    <button class="toolbar-btn" onclick="desktopUI.addSlide(${index})" title="Add slide after this one">➕ Add Slide</button>
                    <button class="toolbar-btn danger" onclick="desktopUI.deleteSlide(${index})" title="Delete this slide" ${slides.length <= 1 ? 'disabled' : ''}>🗑️ Delete</button>
                    <button class="toolbar-btn" onclick="desktopUI.duplicateSlide(${index})" title="Duplicate this slide">📋 Duplicate</button>
                    <button class="toolbar-btn" onclick="desktopUI.moveSlide(${index}, -1)" title="Move up" ${index === 0 ? 'disabled' : ''}>⬆️ Move Up</button>
                    <button class="toolbar-btn" onclick="desktopUI.moveSlide(${index}, 1)" title="Move down" ${index >= slides.length - 1 ? 'disabled' : ''}>⬇️ Move Down</button>
                </div>
                <div class="slide-editor-columns">
                    <!-- Visual Preview -->
                    <div class="slide-preview-column">
                        <div class="slide-preview-mockup" id="slidePreview${index}">
                            ${previewHtml}
                        </div>
                        <div class="slide-layout-selector">
                            <label>Layout:</label>
                            <select class="slide-layout-select" data-slide-index="${index}" data-field="layout" onchange="desktopUI.onLayoutChange(${index})">
                                ${layoutOptions.map(opt => `<option value="${opt.id}" ${opt.id === layout ? 'selected' : ''}>${opt.icon} ${opt.name}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <!-- Edit Fields -->
                    <div class="slide-edit-column">
                        ${contentEditor}
                    </div>
                </div>
            </div>
        `;
    }

    onLayoutChange(index) {
        if (!this.currentSlidePlan || !this.currentSlidePlan.slides[index]) return;

        // Get the new layout value BEFORE saving (which would read it from the dropdown)
        const layoutSelect = document.querySelector(`[data-slide-index="${index}"][data-field="layout"]`);
        const newLayout = layoutSelect ? layoutSelect.value : 'title-bullets';

        // Save current content EXCEPT layout (preserve existing content)
        this.saveCurrentSlideDataPreserveContent(index);

        // Now update the layout
        this.currentSlidePlan.slides[index].layout = newLayout;

        // Re-render with new layout
        this.updateSlideEditorView();
    }

    saveCurrentSlideDataPreserveContent(index) {
        // Save only content fields, not layout - used when changing layouts to preserve content
        if (!this.currentSlidePlan || !this.currentSlidePlan.slides) return;

        const slide = this.currentSlidePlan.slides[index];
        if (!slide) return;

        slide.content = slide.content || {};

        const getVal = (field) => {
            const el = document.querySelector(`[data-slide-index="${index}"][data-field="${field}"]`);
            return el ? el.value : null;
        };

        // Save title (always present)
        const title = getVal('title');
        if (title !== null) {
            if (slide.layout === 'section-header') {
                slide.content.sectionTitle = title;
            }
            slide.content.title = title;
        }

        // Save subtitle if exists
        const subtitle = getVal('subtitle');
        if (subtitle !== null) slide.content.subtitle = subtitle;

        // Save bullets if field exists - must be array of objects with text property
        const bullets = getVal('bullets');
        if (bullets !== null) {
            slide.content.bullets = bullets.split('\n').filter(l => l.trim()).map(text => ({ text }));
        }

        // Save key takeaways if field exists
        const takeaways = getVal('keyTakeaways');
        if (takeaways !== null) {
            slide.content.keyTakeaways = takeaways.split('\n').filter(l => l.trim());
        }

        // Save speaker notes
        const notes = getVal('speakerNotes');
        if (notes !== null) slide.speakerNotes = notes;

        // Save two columns if fields exist
        const leftColTitle = getVal('leftColumnTitle');
        const leftColBullets = getVal('leftColumnBullets');
        if (leftColTitle !== null || leftColBullets !== null) {
            slide.content.leftColumn = slide.content.leftColumn || {};
            if (leftColTitle !== null) slide.content.leftColumn.title = leftColTitle;
            if (leftColBullets !== null) slide.content.leftColumn.bullets = leftColBullets.split('\n').filter(l => l.trim()).map(text => ({ text }));
        }

        const rightColTitle = getVal('rightColumnTitle');
        const rightColBullets = getVal('rightColumnBullets');
        if (rightColTitle !== null || rightColBullets !== null) {
            slide.content.rightColumn = slide.content.rightColumn || {};
            if (rightColTitle !== null) slide.content.rightColumn.title = rightColTitle;
            if (rightColBullets !== null) slide.content.rightColumn.bullets = rightColBullets.split('\n').filter(l => l.trim()).map(text => ({ text }));
        }

        // Save quote / title-slide author+date fields
        const quote = getVal('quote');
        const author = getVal('author');
        const date = getVal('date');
        if (quote !== null) slide.content.quote = quote;
        if (author !== null) slide.content.author = author;
        if (date !== null) slide.content.date = date;
    }

    addSlide(afterIndex) {
        if (!this.currentSlidePlan || !this.currentSlidePlan.slides) return;

        this.saveCurrentSlideData();

        const newSlide = {
            layout: 'title-bullets',
            content: {
                title: 'New Slide',
                bullets: ['Add your content here']
            },
            speakerNotes: ''
        };

        this.currentSlidePlan.slides.splice(afterIndex + 1, 0, newSlide);
        this.totalSlides = this.currentSlidePlan.slides.length;
        this.currentSlideIndex = afterIndex + 1;
        this.updateSlideEditorView();
        this.updateSlideDots();
    }

    deleteSlide(index) {
        if (!this.currentSlidePlan || !this.currentSlidePlan.slides) return;
        if (this.currentSlidePlan.slides.length <= 1) {
            alert('Cannot delete the last slide');
            return;
        }

        if (!confirm('Are you sure you want to delete this slide?')) return;

        this.currentSlidePlan.slides.splice(index, 1);
        this.totalSlides = this.currentSlidePlan.slides.length;

        if (this.currentSlideIndex >= this.totalSlides) {
            this.currentSlideIndex = this.totalSlides - 1;
        }

        this.updateSlideEditorView();
        this.updateSlideDots();
    }

    duplicateSlide(index) {
        if (!this.currentSlidePlan || !this.currentSlidePlan.slides) return;

        this.saveCurrentSlideData();

        const slideToDuplicate = this.currentSlidePlan.slides[index];
        const duplicatedSlide = JSON.parse(JSON.stringify(slideToDuplicate));
        duplicatedSlide.content.title = (duplicatedSlide.content.title || '') + ' (Copy)';

        this.currentSlidePlan.slides.splice(index + 1, 0, duplicatedSlide);
        this.totalSlides = this.currentSlidePlan.slides.length;
        this.currentSlideIndex = index + 1;
        this.updateSlideEditorView();
        this.updateSlideDots();
    }

    moveSlide(index, direction) {
        if (!this.currentSlidePlan || !this.currentSlidePlan.slides) return;

        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.currentSlidePlan.slides.length) return;

        this.saveCurrentSlideData();

        const slides = this.currentSlidePlan.slides;
        [slides[index], slides[newIndex]] = [slides[newIndex], slides[index]];

        this.currentSlideIndex = newIndex;
        this.updateSlideEditorView();
    }

    updateSlideDots() {
        const dotsContainer = document.getElementById('slideDots');
        if (dotsContainer && this.currentSlidePlan) {
            dotsContainer.innerHTML = this.currentSlidePlan.slides.map((_, i) =>
                `<span class="slide-dot ${i === this.currentSlideIndex ? 'active' : ''}" onclick="desktopUI.goToSlide(${i})"></span>`
            ).join('');
        }

        const counter = document.getElementById('slideCounter');
        if (counter) {
            counter.textContent = `Slide ${this.currentSlideIndex + 1} of ${this.totalSlides}`;
        }
    }

    saveCurrentSlideData() {
        // Save current slide data to slidePlan before navigating
        if (!this.currentSlidePlan || !this.currentSlidePlan.slides) return;

        const index = this.currentSlideIndex;
        const slide = this.currentSlidePlan.slides[index];
        if (!slide) return;

        slide.content = slide.content || {};

        const getVal = (field) => {
            const el = document.querySelector(`[data-slide-index="${index}"][data-field="${field}"]`);
            return el ? el.value : null;
        };

        // Layout
        const layout = getVal('layout');
        if (layout) slide.layout = layout;

        // Title
        const title = getVal('title');
        if (title !== null) {
            if (slide.layout === 'section-header') {
                slide.content.sectionTitle = title;
            }
            slide.content.title = title;
        }

        // Subtitle
        const subtitle = getVal('subtitle');
        if (subtitle !== null) slide.content.subtitle = subtitle;

        // Bullets - must be array of objects with text property for PPTX generator
        const bullets = getVal('bullets');
        if (bullets !== null) {
            slide.content.bullets = bullets.split('\n').filter(l => l.trim()).map(text => ({ text }));
        }

        // Key Takeaways
        const takeaways = getVal('keyTakeaways');
        if (takeaways !== null) {
            slide.content.keyTakeaways = takeaways.split('\n').filter(l => l.trim());
        }

        // Two Columns - bullets must be array of objects with text property
        const leftColTitle = getVal('leftColumnTitle');
        const leftColBullets = getVal('leftColumnBullets');
        const rightColTitle = getVal('rightColumnTitle');
        const rightColBullets = getVal('rightColumnBullets');

        if (leftColTitle !== null || leftColBullets !== null) {
            slide.content.leftColumn = {
                title: leftColTitle || '',
                bullets: leftColBullets ? leftColBullets.split('\n').filter(l => l.trim()).map(text => ({ text })) : []
            };
        }
        if (rightColTitle !== null || rightColBullets !== null) {
            slide.content.rightColumn = {
                title: rightColTitle || '',
                bullets: rightColBullets ? rightColBullets.split('\n').filter(l => l.trim()).map(text => ({ text })) : []
            };
        }

        // Table - collect from table builder
        const tableCaption = getVal('tableCaption');
        if (tableCaption !== null && slide.content.table) {
            slide.content.table.caption = tableCaption;
        }
        // Note: Table data is updated via updateTableCell method

        // Quote / title-slide author + date
        const quote = getVal('quote');
        const author = getVal('author');
        const date = getVal('date');
        if (quote !== null) slide.content.quote = quote;
        if (author !== null) slide.content.author = author;
        if (date !== null) slide.content.date = date;

        // Image - handle file uploads and alt/position
        const imageAlt = getVal('imageAlt');
        const imagePosition = getVal('imagePosition');
        const imagePrompt = getVal('imagePrompt');

        if (imageAlt !== null || imagePosition !== null) {
            if (!slide.content.image) {
                slide.content.image = { path: '', alt: '', position: 'center' };
            }
            if (imageAlt !== null) slide.content.image.alt = imageAlt;
            if (imagePosition !== null) slide.content.image.position = imagePosition;
        }
        if (imagePrompt !== null) slide.content.imagePrompt = imagePrompt;

        // Cards
        const cardsText = getVal('cards');
        if (cardsText !== null) {
            slide.content.cards = cardsText.split('\n').filter(l => l.trim()).map(line => {
                const parts = line.split(':');
                return {
                    title: parts[0]?.trim() || '',
                    description: parts.slice(1).join(':').trim() || ''
                };
            });
        }

        // Chart
        const chartType = getVal('chartType');
        const chartData = getVal('chartData');
        if (chartType !== null) slide.content.chartType = chartType;
        if (chartData !== null) {
            slide.content.chartData = chartData.split('\n').filter(l => l.trim()).map(line => {
                const parts = line.split(':');
                return {
                    label: parts[0]?.trim() || '',
                    value: parseFloat(parts[1]?.trim()) || 0
                };
            });
        }

        // Speaker Notes
        const notes = getVal('speakerNotes');
        if (notes !== null) slide.speakerNotes = notes;
    }

    goToSlide(index) {
        if (index < 0 || index >= this.totalSlides) return;

        // Save current slide data before navigating
        this.saveCurrentSlideData();

        this.currentSlideIndex = index;
        this.updateSlideEditorView();
    }

    prevSlide() {
        if (this.currentSlideIndex > 0) {
            this.goToSlide(this.currentSlideIndex - 1);
        }
    }

    nextSlide() {
        if (this.currentSlideIndex < this.totalSlides - 1) {
            this.goToSlide(this.currentSlideIndex + 1);
        }
    }

    updateSlideEditorView() {
        const body = document.getElementById('slideEditorBody');
        const counter = document.getElementById('slideCounter');
        const prevBtn = document.getElementById('prevSlideBtn');
        const nextBtn = document.getElementById('nextSlideBtn');
        const dots = document.querySelectorAll('.slide-dot');

        if (body && this.currentSlidePlan) {
            body.innerHTML = this.renderSingleSlideEditor(this.currentSlidePlan.slides, this.currentSlideIndex);
        }

        if (counter) {
            counter.textContent = `Slide ${this.currentSlideIndex + 1} of ${this.totalSlides}`;
        }

        if (prevBtn) {
            prevBtn.disabled = this.currentSlideIndex === 0;
        }

        if (nextBtn) {
            nextBtn.disabled = this.currentSlideIndex >= this.totalSlides - 1;
        }

        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === this.currentSlideIndex);
        });
    }


    renderSlidePreview(layout, title, bullets, keyTakeaways, content = {}) {
        const safeTitle = this.escapeHtml(title || 'Slide Title');

        if (layout === 'title-slide') {
            return `
                <div class="preview-title-slide">
                    <div class="preview-main-title">${safeTitle}</div>
                    <div class="preview-subtitle">${this.escapeHtml(content.subtitle || 'Presentation')}</div>
                </div>
            `;
        } else if (layout === 'section-header') {
            return `
                <div class="preview-section-header">
                    <div class="preview-section-title">${safeTitle}</div>
                    ${content.subtitle ? `<div class="preview-section-subtitle">${this.escapeHtml(content.subtitle)}</div>` : ''}
                </div>
            `;
        } else if (layout === 'conclusion' || layout === 'thank-you') {
            const items = keyTakeaways.length ? keyTakeaways : ['Key point 1', 'Key point 2'];
            return `
                <div class="preview-conclusion">
                    <div class="preview-title">${safeTitle}</div>
                    <div class="preview-takeaways">
                        ${items.slice(0, 4).map(t => `<div class="preview-takeaway">✓ ${this.escapeHtml(t)}</div>`).join('')}
                    </div>
                </div>
            `;
        } else if (layout === 'title-two-columns') {
            const left = content.leftColumn || { bullets: [] };
            const right = content.rightColumn || { bullets: [] };
            return `
                <div class="preview-two-columns">
                    <div class="preview-title">${safeTitle}</div>
                    <div class="preview-columns-container">
                        <div class="preview-col">
                            ${left.title ? `<div class="preview-col-title">${this.escapeHtml(left.title)}</div>` : ''}
                            ${(left.bullets || []).slice(0, 3).map(b => {
                                const text = typeof b === 'string' ? b : (b.text || '');
                                return `<div class="preview-bullet">• ${this.escapeHtml(text.substring(0, 25))}</div>`;
                            }).join('')}
                        </div>
                        <div class="preview-col">
                            ${right.title ? `<div class="preview-col-title">${this.escapeHtml(right.title)}</div>` : ''}
                            ${(right.bullets || []).slice(0, 3).map(b => {
                                const text = typeof b === 'string' ? b : (b.text || '');
                                return `<div class="preview-bullet">• ${this.escapeHtml(text.substring(0, 25))}</div>`;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
        } else if (layout === 'title-table') {
            const table = content.table || { headers: [], rows: [] };
            return `
                <div class="preview-table">
                    <div class="preview-title">${safeTitle}</div>
                    <div class="preview-table-grid">
                        <div class="preview-table-header">
                            ${(table.headers || []).slice(0, 4).map(h => `<span>${this.escapeHtml(h.substring(0, 10))}</span>`).join('')}
                        </div>
                        ${(table.rows || []).slice(0, 2).map(row => `
                            <div class="preview-table-row">
                                ${(row || []).slice(0, 4).map(c => `<span>${this.escapeHtml((c || '').substring(0, 10))}</span>`).join('')}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else if (layout === 'quote-slide') {
            return `
                <div class="preview-quote">
                    <div class="preview-quote-mark">"</div>
                    <div class="preview-quote-text">${this.escapeHtml((content.quote || 'Your quote here').substring(0, 80))}${(content.quote || '').length > 80 ? '...' : ''}</div>
                    ${content.author ? `<div class="preview-quote-author">— ${this.escapeHtml(content.author)}</div>` : ''}
                </div>
            `;
        } else if (layout === 'title-image-text') {
            return `
                <div class="preview-image-text">
                    <div class="preview-title">${safeTitle}</div>
                    <div class="preview-image-text-container">
                        <div class="preview-image-placeholder">🖼️</div>
                        <div class="preview-text-side">
                            ${bullets.slice(0, 3).map(b => {
                                const text = typeof b === 'string' ? b : (b.text || '');
                                return `<div class="preview-bullet">• ${this.escapeHtml(text.substring(0, 30))}</div>`;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
        } else if (layout === 'title-cards') {
            const cards = content.cards || [];
            return `
                <div class="preview-cards">
                    <div class="preview-title">${safeTitle}</div>
                    <div class="preview-cards-container">
                        ${cards.slice(0, 3).map(c => `
                            <div class="preview-card">
                                <div class="preview-card-title">${this.escapeHtml((c.title || '').substring(0, 15))}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else if (layout === 'title-chart') {
            return `
                <div class="preview-chart">
                    <div class="preview-title">${safeTitle}</div>
                    <div class="preview-chart-placeholder">
                        📊 ${content.chartType || 'Bar'} Chart
                    </div>
                </div>
            `;
        } else {
            // Default: title-bullets and other layouts
            const items = bullets.length ? bullets : ['Bullet point 1', 'Bullet point 2', 'Bullet point 3'];
            return `
                <div class="preview-title-bullets">
                    <div class="preview-title">${safeTitle}</div>
                    <div class="preview-bullets">
                        ${items.slice(0, 5).map(b => {
                            const text = typeof b === 'string' ? b : (b.text || '');
                            return `<div class="preview-bullet">• ${this.escapeHtml(text.substring(0, 50))}${text.length > 50 ? '...' : ''}</div>`;
                        }).join('')}
                    </div>
                </div>
            `;
        }
    }

    updateSlidePreview(index) {
        const container = document.getElementById(`slidePreview${index}`);
        if (!container) return;

        const getVal = (field) => {
            const el = document.querySelector(`[data-slide-index="${index}"][data-field="${field}"]`);
            return el ? el.value : '';
        };

        const layout = getVal('layout') || 'title-bullets';
        const title = getVal('title');
        const bullets = getVal('bullets').split('\n').filter(l => l.trim());
        const keyTakeaways = getVal('keyTakeaways').split('\n').filter(l => l.trim());

        // Build content object for preview
        const content = {
            subtitle: getVal('subtitle'),
            leftColumn: {
                title: getVal('leftColumnTitle'),
                bullets: getVal('leftColumnBullets').split('\n').filter(l => l.trim())
            },
            rightColumn: {
                title: getVal('rightColumnTitle'),
                bullets: getVal('rightColumnBullets').split('\n').filter(l => l.trim())
            },
            table: {
                headers: getVal('tableHeaders').split('|').map(h => h.trim()).filter(h => h),
                rows: getVal('tableRows').split('\n').filter(l => l.trim()).map(row => row.split('|').map(c => c.trim()))
            },
            quote: getVal('quote'),
            author: getVal('author'),
            cards: getVal('cards').split('\n').filter(l => l.trim()).map(line => {
                const parts = line.split(':');
                return { title: parts[0]?.trim() || '', description: parts.slice(1).join(':').trim() || '' };
            }),
            chartType: getVal('chartType'),
            chartData: getVal('chartData').split('\n').filter(l => l.trim()).map(line => {
                const parts = line.split(':');
                return { label: parts[0]?.trim() || '', value: parseFloat(parts[1]) || 0 };
            })
        };

        container.innerHTML = this.renderSlidePreview(layout, title, bullets, keyTakeaways, content);
    }

    collectEditedSlidePlan() {
        if (!this.currentSlidePlan || !this.currentSlidePlan.slides) return null;

        // Save current slide data before collecting
        this.saveCurrentSlideData();

        // Return a copy of the edited slide plan
        return JSON.parse(JSON.stringify(this.currentSlidePlan));
    }

    async saveEdits(jobId) {
        try {
            const editedPlan = this.collectEditedSlidePlan();
            if (!editedPlan) {
                alert('No edits to save');
                return;
            }

            const response = await fetch(`${APP_PREFIX}/api/job/${jobId}/slide-plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slide_plan: editedPlan })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.slide_plan) {
                    this.currentSlidePlan = data.slide_plan;
                }
                alert('Edits saved successfully!');
            } else {
                const error = await response.json();
                alert('Failed to save: ' + (error.error || 'Unknown error'));
            }
        } catch (error) {
            alert('Error saving edits: ' + error.message);
        }
    }

    async saveAndContinue(jobId) {
        try {
            // First save edits
            const editedPlan = this.collectEditedSlidePlan();
            if (editedPlan) {
                const saveResponse = await fetch(`${APP_PREFIX}/api/job/${jobId}/slide-plan`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slide_plan: editedPlan })
                });

                if (!saveResponse.ok) {
                    const error = await saveResponse.json();
                    alert('Failed to save edits: ' + (error.error || 'Unknown error'));
                    return;
                }
            }

            // Close editor and show progress modal
            this.closeSlideEditor();
            this.showProgressModal(jobId);
            this.updateProgress(55, 'Generating...', 'Creating PowerPoint from your edited slides');

            // Continue generation
            const response = await fetch(`${APP_PREFIX}/api/job/${jobId}/continue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skip_validation: true })
            });

            if (response.ok) {
                const button = document.querySelector('form .btn-primary') || { disabled: false, textContent: '' };
                this.pollJobStatus(jobId, button);
            } else {
                const error = await response.json();
                this.updateProgress(0, '❌ Failed', error.error || 'Failed to continue');
            }
        } catch (error) {
            this.updateProgress(0, '❌ Error', error.message);
        }
    }

    closeSlideEditor() {
        const editor = document.getElementById('slideEditorModal');
        if (editor) editor.remove();
    }

    addSlideEditorStyles() {
        if (document.getElementById('slideEditorStyles')) return;

        const styles = document.createElement('style');
        styles.id = 'slideEditorStyles';
        styles.textContent = `
            .slide-editor-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10001;
            }
            .slide-editor-content {
                background: #1e1e2e;
                border-radius: 16px;
                width: 90%;
                max-width: 900px;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                border: 1px solid rgba(255,255,255,0.1);
            }
            .slide-editor-header {
                padding: 20px 24px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .slide-editor-header h3 {
                color: #fff;
                margin: 0;
                font-size: 20px;
            }
            .slide-count {
                color: #888;
                font-size: 14px;
            }
            .slide-editor-settings {
                border-bottom: 1px solid rgba(255,255,255,0.1);
            }
            .settings-toggle {
                padding: 12px 24px;
                display: flex;
                align-items: center;
                gap: 12px;
                cursor: pointer;
                color: #a0a0a0;
                font-size: 14px;
                transition: background 0.2s;
            }
            .settings-toggle:hover {
                background: rgba(255,255,255,0.05);
                color: #fff;
            }
            .settings-current {
                margin-left: auto;
                color: #2AADA6;
                font-weight: 500;
            }
            .toggle-arrow {
                color: #666;
                font-size: 12px;
            }
            .settings-panel {
                padding: 16px 24px;
                background: rgba(0,0,0,0.2);
            }
            .settings-section {
                margin-bottom: 16px;
            }
            .settings-section:last-child {
                margin-bottom: 0;
            }
            .settings-label {
                display: block;
                color: #888;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 10px;
            }
            .template-grid-editor {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .template-option-editor {
                padding: 8px 14px;
                background: rgba(255,255,255,0.08);
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .template-option-editor:hover {
                background: rgba(255,255,255,0.12);
                border-color: rgba(255,255,255,0.25);
            }
            .template-option-editor.selected {
                background: linear-gradient(135deg, #2AADA6, #1D2D5C);
                border-color: #2AADA6;
            }
            .template-option-editor .template-option-name {
                color: #fff;
                font-size: 12px;
                font-weight: 500;
            }
            .color-grid-editor {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .color-option-editor {
                width: 32px;
                height: 32px;
                border-radius: 6px;
                cursor: pointer;
                border: 2px solid transparent;
                transition: all 0.2s;
            }
            .color-option-editor:hover {
                transform: scale(1.1);
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            .color-option-editor.selected {
                border-color: #fff;
                box-shadow: 0 0 0 2px #2AADA6;
            }
            .slide-editor-body {
                flex: 1;
                overflow-y: auto;
                padding: 24px;
            }
            .slide-editor-toolbar {
                display: flex;
                gap: 8px;
                margin-bottom: 16px;
                padding-bottom: 16px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                flex-wrap: wrap;
            }
            .toolbar-btn {
                padding: 8px 12px;
                background: #2a2a3e;
                color: #fff;
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .toolbar-btn:hover:not(:disabled) {
                background: #3a3a4e;
                border-color: #2AADA6;
            }
            .toolbar-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }
            .toolbar-btn.danger:hover:not(:disabled) {
                background: rgba(239, 68, 68, 0.2);
                border-color: #ef4444;
                color: #ef4444;
            }
            .edit-columns {
                display: flex;
                gap: 16px;
            }
            .edit-column {
                flex: 1;
                background: rgba(0,0,0,0.2);
                padding: 12px;
                border-radius: 8px;
            }
            .edit-input-large {
                font-size: 18px;
                font-weight: 600;
            }
            .edit-textarea-large {
                font-size: 16px;
                font-style: italic;
            }
            .slide-layout-select {
                padding: 8px 12px;
                background: #1e1e2e;
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 6px;
                color: #fff;
                font-size: 13px;
                cursor: pointer;
            }
            .slide-layout-select:focus {
                outline: none;
                border-color: #2AADA6;
            }
            .edit-field label {
                display: block;
                color: #888;
                font-size: 12px;
                margin-bottom: 6px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .edit-input, .edit-textarea {
                width: 100%;
                padding: 12px 14px;
                background: #1e1e2e;
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 8px;
                color: #fff;
                font-size: 14px;
                font-family: inherit;
            }
            .edit-input:focus, .edit-textarea:focus {
                outline: none;
                border-color: #2AADA6;
                box-shadow: 0 0 0 2px rgba(42, 173, 166, 0.2);
            }
            .slide-editor-footer {
                padding: 16px 24px;
                border-top: 1px solid rgba(255,255,255,0.1);
                display: flex;
                gap: 12px;
                justify-content: flex-end;
            }
            .slide-editor-nav {
                padding: 12px 24px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-top: 1px solid rgba(255,255,255,0.1);
                background: rgba(0,0,0,0.2);
            }
            .btn-nav {
                padding: 10px 20px;
                background: #2a2a3e;
                color: #fff;
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
            }
            .btn-nav:hover:not(:disabled) {
                background: #3a3a4e;
                border-color: #2AADA6;
            }
            .btn-nav:disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }
            .slide-dots {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                justify-content: center;
                max-width: 60%;
            }
            .slide-dot {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: rgba(255,255,255,0.3);
                cursor: pointer;
                transition: all 0.2s;
            }
            .slide-dot:hover {
                background: rgba(255,255,255,0.5);
            }
            .slide-dot.active {
                background: #2AADA6;
                transform: scale(1.2);
            }
            .slide-counter {
                color: #888;
                font-size: 14px;
                font-weight: 500;
            }
            .slide-editor-single {
                height: 100%;
            }
            .slide-editor-columns {
                display: flex;
                gap: 24px;
                height: 100%;
            }
            .slide-preview-column {
                flex: 0 0 320px;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .slide-edit-column {
                flex: 1;
                display: flex;
                flex-direction: column;
            }
            .slide-layout-selector {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .slide-layout-selector label {
                color: #888;
                font-size: 13px;
            }
            .slide-preview-mockup {
                aspect-ratio: 16/9;
                background: linear-gradient(135deg, #2AADA6 0%, #1D2D5C 100%);
                border-radius: 8px;
                padding: 20px;
                color: white;
                font-size: 12px;
                overflow: hidden;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            .preview-title-slide {
                height: 100%;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
            }
            .preview-main-title {
                font-size: 18px;
                font-weight: 700;
                margin-bottom: 8px;
            }
            .preview-subtitle {
                font-size: 11px;
                opacity: 0.8;
            }
            .preview-section-header {
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .preview-section-title {
                font-size: 20px;
                font-weight: 700;
                text-align: center;
            }
            .preview-title-bullets, .preview-conclusion {
                height: 100%;
                display: flex;
                flex-direction: column;
            }
            .preview-title {
                font-size: 15px;
                font-weight: 700;
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 2px solid rgba(255,255,255,0.3);
            }
            .preview-bullets, .preview-takeaways {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .preview-bullet, .preview-takeaway {
                font-size: 11px;
                line-height: 1.4;
                opacity: 0.9;
            }
            .preview-section-subtitle {
                font-size: 12px;
                opacity: 0.7;
                margin-top: 8px;
            }
            .preview-two-columns {
                height: 100%;
                display: flex;
                flex-direction: column;
            }
            .preview-columns-container {
                flex: 1;
                display: flex;
                gap: 10px;
            }
            .preview-col {
                flex: 1;
                background: rgba(255,255,255,0.1);
                border-radius: 4px;
                padding: 8px;
            }
            .preview-col-title {
                font-size: 10px;
                font-weight: 600;
                margin-bottom: 6px;
                border-bottom: 1px solid rgba(255,255,255,0.3);
                padding-bottom: 4px;
            }
            .preview-table {
                height: 100%;
                display: flex;
                flex-direction: column;
            }
            .preview-table-grid {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .preview-table-header {
                display: flex;
                gap: 4px;
                background: rgba(255,255,255,0.2);
                padding: 4px;
                border-radius: 3px;
                font-size: 9px;
                font-weight: 600;
            }
            .preview-table-header span {
                flex: 1;
                text-align: center;
            }
            .preview-table-row {
                display: flex;
                gap: 4px;
                background: rgba(255,255,255,0.1);
                padding: 4px;
                border-radius: 3px;
                font-size: 8px;
            }
            .preview-table-row span {
                flex: 1;
                text-align: center;
            }
            .preview-quote {
                height: 100%;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
                padding: 10px;
            }
            .preview-quote-mark {
                font-size: 36px;
                opacity: 0.5;
                line-height: 1;
            }
            .preview-quote-text {
                font-size: 12px;
                font-style: italic;
                line-height: 1.4;
                margin: 8px 0;
            }
            .preview-quote-author {
                font-size: 10px;
                opacity: 0.7;
            }
            .preview-image-text {
                height: 100%;
                display: flex;
                flex-direction: column;
            }
            .preview-image-text-container {
                flex: 1;
                display: flex;
                gap: 10px;
            }
            .preview-image-placeholder {
                flex: 1;
                background: rgba(255,255,255,0.1);
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
            }
            .preview-text-side {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .preview-cards {
                height: 100%;
                display: flex;
                flex-direction: column;
            }
            .preview-cards-container {
                flex: 1;
                display: flex;
                gap: 8px;
            }
            .preview-card {
                flex: 1;
                background: rgba(255,255,255,0.15);
                border-radius: 4px;
                padding: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .preview-card-title {
                font-size: 9px;
                font-weight: 600;
                text-align: center;
            }
            .preview-chart {
                height: 100%;
                display: flex;
                flex-direction: column;
            }
            .preview-chart-placeholder {
                flex: 1;
                background: rgba(255,255,255,0.1);
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
            }
            .edit-field {
                margin-bottom: 16px;
            }
            .edit-field:last-child {
                margin-bottom: 0;
            }
            .edit-textarea {
                resize: vertical;
                min-height: 100px;
            }
            @media (max-width: 768px) {
                .slide-editor-columns {
                    flex-direction: column;
                }
                .slide-preview-column {
                    flex: none;
                }
                .slide-dots {
                    display: none;
                }
            }

            /* Image Upload Styles */
            .image-upload-section {
                background: rgba(0,0,0,0.2);
                padding: 16px;
                border-radius: 8px;
                border: 1px dashed rgba(255,255,255,0.2);
            }
            .image-editor-group {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .file-input-wrapper {
                position: relative;
                display: block;
                width: 100%;
            }
            .file-input-wrapper input[type="file"] {
                position: absolute;
                opacity: 0;
                width: 100%;
                height: 100%;
                cursor: pointer;
                z-index: 1;
            }
            .file-input-label {
                display: block;
                padding: 16px;
                background: linear-gradient(135deg, rgba(42, 173, 166, 0.1) 0%, rgba(29, 45, 92, 0.1) 100%);
                border: 2px dashed #2AADA6;
                border-radius: 8px;
                text-align: center;
                color: #2AADA6;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }
            .file-input-wrapper:hover .file-input-label {
                background: linear-gradient(135deg, #2AADA6 0%, #1D2D5C 100%);
                color: white;
                border-color: transparent;
            }
            .image-preview-container {
                max-width: 200px;
                margin: 8px 0;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            .image-preview {
                width: 100%;
                height: auto;
                display: block;
            }
            .image-options {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .btn-small {
                padding: 6px 12px;
                font-size: 12px;
                border-radius: 4px;
                cursor: pointer;
                border: 1px solid rgba(255,255,255,0.2);
                background: #2a2a3e;
                color: #fff;
                transition: all 0.2s;
            }
            .btn-small:hover {
                background: #3a3a4e;
                border-color: #2AADA6;
            }
            .btn-danger-small {
                background: rgba(239, 68, 68, 0.2);
                border-color: rgba(239, 68, 68, 0.5);
                color: #ef4444;
            }
            .btn-danger-small:hover {
                background: rgba(239, 68, 68, 0.4);
            }

            /* Table Builder Styles */
            .table-builder-section {
                background: rgba(0,0,0,0.2);
                padding: 16px;
                border-radius: 8px;
            }
            .table-builder-controls {
                display: flex;
                gap: 8px;
                margin-bottom: 12px;
                flex-wrap: wrap;
            }
            .table-builder-wrapper {
                overflow-x: auto;
                max-height: 300px;
            }
            .table-builder {
                width: 100%;
                border-collapse: collapse;
                background: #1e1e2e;
                border-radius: 8px;
                overflow: hidden;
            }
            .table-builder thead {
                background: linear-gradient(135deg, rgba(42, 173, 166, 0.3) 0%, rgba(29, 45, 92, 0.3) 100%);
            }
            .table-builder th, .table-builder td {
                padding: 8px;
                border: 1px solid rgba(255,255,255,0.1);
                text-align: left;
            }
            .table-cell-wrapper {
                display: flex;
                gap: 4px;
                align-items: center;
            }
            .table-cell {
                padding: 8px 10px;
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 4px;
                background: #1e1e2e;
                color: #fff;
                font-size: 13px;
                width: 100%;
                min-width: 80px;
            }
            .table-cell:focus {
                outline: none;
                border-color: #2AADA6;
            }
            .table-header-cell {
                font-weight: 600;
                background: rgba(42, 173, 166, 0.1);
            }
            .table-cell-delete {
                padding: 4px 8px;
                background: rgba(239, 68, 68, 0.2);
                border: none;
                border-radius: 4px;
                color: #ef4444;
                cursor: pointer;
                font-size: 14px;
                line-height: 1;
                transition: all 0.2s;
            }
            .table-cell-delete:hover {
                background: rgba(239, 68, 68, 0.4);
            }
            .table-row-actions {
                white-space: nowrap;
            }
            .btn-tiny {
                padding: 4px 8px;
                font-size: 11px;
                border-radius: 3px;
                cursor: pointer;
                border: none;
                transition: all 0.2s;
            }
            .btn-danger-tiny {
                background: rgba(239, 68, 68, 0.2);
                color: #ef4444;
            }
            .btn-danger-tiny:hover {
                background: rgba(239, 68, 68, 0.4);
            }
            .table-builder tbody tr:nth-child(odd) {
                background: rgba(255,255,255,0.02);
            }
            .table-builder tbody tr:hover {
                background: rgba(42, 173, 166, 0.1);
            }
        `;
        document.body.appendChild(styles);
    }

    async continueGeneration(jobId) {
        try {
            document.getElementById('progressModalFooter').style.display = 'none';
            this.updateProgress(55, 'Continuing...', 'Generating PowerPoint');

            const response = await fetch(`${APP_PREFIX}/api/job/${jobId}/continue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skip_validation: true })
            });

            if (response.ok) {
                // Resume polling
                const button = document.querySelector('.btn-primary[disabled]') ||
                               document.querySelector('form .btn-primary');
                this.pollJobStatus(jobId, button || { disabled: false, textContent: '' });
            } else {
                const error = await response.json();
                this.updateProgress(0, '❌ Failed', error.error || 'Failed to continue');
            }
        } catch (error) {
            this.updateProgress(0, '❌ Error', error.message);
        }
    }

    showDownloadLinks(jobId, job) {
        const footer = document.getElementById('progressModalFooter');
        footer.style.display = 'flex';

        let html = '';
        if (job.download_url) {
            html += `<a href="${job.download_url}" class="btn-primary" download>📥 Download PPTX</a>`;
            html += `<button onclick="desktopUI.downloadPdf('${job.job_id}', this)" class="btn-secondary">📄 Download PDF</button>`;
            html += `<a href="${APP_PREFIX}/api/job/${job.job_id}/transcript" class="btn-secondary" download>📝 Download Transcript</a>`;
            html += `<button onclick="desktopUI.downloadVideoPresentation('${job.job_id}', this)" class="btn-secondary">🎬 Download Video Presentation</button>`;
        }
        if (job.video_url) {
            html += `<a href="${job.video_url}" class="btn-secondary" download>🎥 Download Video</a>`;
        }
        html += `<button onclick="desktopUI.closeProgressModal()" class="btn-secondary">Close</button>`;

        footer.innerHTML = html;
    }

    async downloadPdf(jobId, btn) {
        const originalText = btn ? btn.textContent : '';
        try {
            if (btn) { btn.disabled = true; btn.textContent = '⏳ Converting...'; }
            const response = await fetch(`${APP_PREFIX}/api/job/${jobId}/pdf`);
            if (!response.ok) {
                const err = await response.json().catch(() => ({ error: 'PDF conversion failed' }));
                throw new Error(err.error || 'PDF conversion failed');
            }
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `presentation-${jobId}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            alert('PDF download failed: ' + error.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = originalText; }
        }
    }

    async downloadVideoPresentation(jobId, btn) {
        const originalText = btn ? btn.textContent : '🎬 Download Video Presentation';
        const stageLabels = {
            'starting':           '⏳ Starting…',
            'converting_slides':  '⏳ Converting slides…',
            'rendering_slides':   '⏳ Rendering images…',
            'parsing_transcript': '⏳ Parsing transcript…',
            'generating_voice':   '⏳ Generating voice…',
            'composing_video':    '⏳ Composing video…',
            'finalizing':         '⏳ Finalizing…'
        };

        try {
            if (btn) { btn.disabled = true; btn.textContent = '⏳ Starting…'; }

            // Kick off background generation
            const startResp = await fetch(`${APP_PREFIX}/api/job/${jobId}/voice-video/generate`, { method: 'POST' });
            if (!startResp.ok) {
                const err = await startResp.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to start video generation');
            }
            const startData = await startResp.json();
            if (startData.error) throw new Error(startData.error);

            // If not already done, poll until completion
            if (startData.status !== 'done') {
                while (true) {
                    await new Promise(r => setTimeout(r, 2500));

                    const statusResp = await fetch(`${APP_PREFIX}/api/job/${jobId}/voice-video/status`);
                    const statusData = await statusResp.json();

                    if (statusData.status === 'error') {
                        throw new Error(statusData.error || 'Video generation failed');
                    }
                    if (statusData.status === 'done') break;

                    if (btn) {
                        const label = stageLabels[statusData.status] || '⏳ Processing…';
                        const pct   = statusData.progress > 0 ? ` ${statusData.progress}%` : '';
                        btn.textContent = `${label}${pct}`;
                    }
                }
            }

            // Trigger browser file download
            if (btn) btn.textContent = '⬇️ Downloading…';
            const a = document.createElement('a');
            a.href = `${APP_PREFIX}/api/job/${jobId}/voice-video/download`;
            a.download = `voice-presentation-${jobId}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

        } catch (error) {
            alert('Video generation failed: ' + error.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = originalText; }
        }
    }

    // Recent Jobs
    jobsPollingInterval = null;
    recentJobs = [];

    addRecentJobsStyles() {
        if (document.getElementById('recentJobsStyles')) return;

        const styles = document.createElement('style');
        styles.id = 'recentJobsStyles';
        styles.textContent = `
            .jobs-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .job-card {
                background: #2a2a3e;
                border-radius: 12px;
                padding: 16px;
                border: 1px solid rgba(255,255,255,0.1);
            }
            .job-card.in-progress {
                border-color: #2AADA6;
                animation: pulse-border 2s infinite;
            }
            @keyframes pulse-border {
                0%, 100% { border-color: #2AADA6; }
                50% { border-color: #1D2D5C; }
            }
            .job-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 12px;
            }
            .job-title {
                font-weight: 600;
                color: #fff;
                font-size: 16px;
                margin: 0;
            }
            .job-id {
                font-size: 11px;
                color: #666;
                font-family: monospace;
            }
            .job-status {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 4px 10px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 500;
            }
            .job-status.completed { background: rgba(16, 185, 129, 0.2); color: #10b981; }
            .job-status.failed { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
            .job-status.in-progress { background: rgba(42, 173, 166, 0.2); color: #2AADA6; }
            .job-status.queued { background: rgba(156, 163, 175, 0.2); color: #9ca3af; }
            .job-error-msg {
                margin: 8px 0 4px;
                padding: 8px 12px;
                background: rgba(239, 68, 68, 0.08);
                border-left: 3px solid #ef4444;
                border-radius: 4px;
                font-size: 12px;
                color: #ef4444;
                word-break: break-word;
            }
            .job-progress-section {
                margin: 12px 0;
            }
            .job-progress-bar {
                background: #1e1e2e;
                border-radius: 6px;
                height: 8px;
                overflow: hidden;
                margin-bottom: 6px;
            }
            .job-progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #2AADA6, #1D2D5C);
                border-radius: 6px;
                transition: width 0.3s ease;
            }
            .job-progress-text {
                display: flex;
                justify-content: space-between;
                font-size: 12px;
                color: #888;
            }
            .job-meta {
                display: flex;
                gap: 16px;
                font-size: 12px;
                color: #666;
                margin-top: 8px;
            }
            .job-actions {
                display: flex;
                gap: 8px;
                margin-top: 12px;
            }
            .job-actions a, .job-actions button {
                padding: 8px 16px;
                border-radius: 6px;
                font-size: 12px;
                text-decoration: none;
                cursor: pointer;
                border: none;
            }
            .job-actions .btn-primary {
                background: linear-gradient(135deg, #2AADA6, #1D2D5C);
                color: white;
            }
            .job-actions .btn-secondary {
                background: #3a3a4e;
                color: #fff;
            }
            .no-jobs {
                text-align: center;
                padding: 40px;
                color: #666;
            }
            .refresh-btn {
                background: #3a3a4e;
                color: #fff;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                margin-bottom: 16px;
            }
            .refresh-btn:hover {
                background: #4a4a5e;
            }
        `;
        document.head.appendChild(styles);
    }

    async loadRecentJobs() {
        const container = document.getElementById('recentJobsList');
        if (!container) return;

        try {
            // Get list of all jobs
            const jobsResponse = await fetch(APP_PREFIX + '/api/jobs');
            const jobsData = await jobsResponse.json();

            // Sort by created_at descending and take last 20
            const sortedJobs = (jobsData.jobs || [])
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 20);

            // Fetch detailed status for each job
            const detailedJobs = await Promise.all(
                sortedJobs.map(async (job) => {
                    try {
                        const statusResponse = await fetch(`${APP_PREFIX}/api/job/${job.job_id}`);
                        return await statusResponse.json();
                    } catch {
                        return { ...job, status: 'unknown' };
                    }
                })
            );

            this.recentJobs = detailedJobs;
            this.renderJobsList(container);
        } catch (error) {
            container.innerHTML = `<div class="no-jobs">❌ Error loading jobs: ${error.message}</div>`;
        }
    }

    renderJobsList(container) {
        if (!this.recentJobs || this.recentJobs.length === 0) {
            container.innerHTML = '<div class="no-jobs">📭 No recent jobs found</div>';
            return;
        }

        const html = `
            <button class="refresh-btn" onclick="desktopUI.loadRecentJobs()">🔄 Refresh</button>
            <div class="jobs-list">
                ${this.recentJobs.map(job => this.renderJobCard(job)).join('')}
            </div>
        `;
        container.innerHTML = html;
    }

    renderJobCard(job) {
        const isInProgress = ['queued', 'parsing', 'analyzing', 'generating', 'video_generation', 'awaiting_approval'].includes(job.status);
        const statusClass = job.status === 'completed' ? 'completed' :
                           job.status === 'failed' ? 'failed' :
                           isInProgress ? 'in-progress' : 'queued';

        const statusEmoji = {
            'completed': '✅',
            'failed': '❌',
            'queued': '⏳',
            'parsing': '📄',
            'analyzing': '🧠',
            'generating': '⚙️',
            'video_generation': '🎥',
            'awaiting_approval': '👁️'
        }[job.status] || '❓';

        const statusText = {
            'completed': 'Completed',
            'failed': 'Failed',
            'queued': 'Queued',
            'parsing': 'Parsing',
            'analyzing': 'Analyzing',
            'generating': 'Generating',
            'video_generation': 'Video Generation',
            'awaiting_approval': 'Awaiting Approval'
        }[job.status] || job.status;

        const progress = job.progress || 0;
        const filename = job.filename || job.output_name || 'Untitled';
        const template = job.template_style || 'modern';
        const color = job.color_scheme || 'blue';
        const createdAt = job.created_at ? new Date(job.created_at).toLocaleString() : '';

        let actionsHtml = '';
        if (job.status === 'completed') {
            if (job.download_url) {
                actionsHtml += `<a href="${job.download_url}" class="btn-primary" download>📥 Download PPTX</a>`;
                actionsHtml += `<button onclick="desktopUI.downloadPdf('${job.job_id}', this)" class="btn-secondary">📄 Download PDF</button>`;
                actionsHtml += `<a href="${APP_PREFIX}/api/job/${job.job_id}/transcript" class="btn-secondary" download>📝 Transcript</a>`;
                actionsHtml += `<button onclick="desktopUI.downloadVideoPresentation('${job.job_id}', this)" class="btn-secondary">🎬 Download Video Presentation</button>`;
            }
            if (job.video_url) {
                actionsHtml += `<a href="${job.video_url}" class="btn-secondary" download>🎥 Download Video</a>`;
            }
        } else if (job.status === 'awaiting_approval') {
            actionsHtml = `
                <button class="btn-primary" onclick="desktopUI.openSlideEditorFromList('${job.job_id}')">📝 View & Edit Slides</button>
                <button class="btn-secondary" onclick="desktopUI.continueJobFromList('${job.job_id}')">⏩ Skip & Generate</button>
            `;
        }

        const progressSection = isInProgress ? `
            <div class="job-progress-section">
                <div class="job-progress-bar">
                    <div class="job-progress-fill" style="width: ${progress}%"></div>
                </div>
                <div class="job-progress-text">
                    <span>${job.step || job.step_description || 'Processing...'}</span>
                    <span>${progress}%</span>
                </div>
            </div>
        ` : '';

        const errorSection = job.status === 'failed' && job.error ? `
            <div class="job-error-msg">⚠️ ${this.escapeHtml(job.error)}</div>
        ` : '';

        return `
            <div class="job-card ${isInProgress ? 'in-progress' : ''}" data-job-id="${job.job_id}">
                <div class="job-header">
                    <div>
                        <h4 class="job-title">${this.escapeHtml(filename)}</h4>
                        <div class="job-id">${job.job_id}</div>
                    </div>
                    <span class="job-status ${statusClass}">${statusEmoji} ${statusText}</span>
                </div>
                ${progressSection}
                ${errorSection}
                <div class="job-meta">
                    <span>🎨 ${template}</span>
                    <span>🎨 ${color}</span>
                    <span>📅 ${createdAt}</span>
                </div>
                ${actionsHtml ? `<div class="job-actions">${actionsHtml}</div>` : ''}
                <div class="job-delete-row">
                    <button class="job-delete-btn" onclick="desktopUI.confirmDeleteJob('${job.job_id}', '${this.escapeHtml(filename)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                        Delete
                    </button>
                </div>
            </div>
        `;
    }

    async openSlideEditorFromList(jobId) {
        try {
            // Fetch job status to get slide plan
            const response = await fetch(`${APP_PREFIX}/api/job/${jobId}`);
            const job = await response.json();

            if (job.slide_plan) {
                this.currentJobId = jobId;
                this.currentSlidePlan = job.slide_plan;
                this.showSlideEditor(jobId);
            } else {
                // Try to fetch slide plan directly
                const planResponse = await fetch(`${APP_PREFIX}/api/job/${jobId}/slide-plan-data`);
                if (planResponse.ok) {
                    const slidePlan = await planResponse.json();
                    this.currentJobId = jobId;
                    this.currentSlidePlan = slidePlan;
                    this.showSlideEditor(jobId);
                } else {
                    alert('No slide plan found for this job');
                }
            }
        } catch (error) {
            alert('Error loading slide plan: ' + error.message);
        }
    }

    async continueJobFromList(jobId) {
        try {
            const response = await fetch(`${APP_PREFIX}/api/job/${jobId}/continue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skip_validation: true })
            });

            if (response.ok) {
                // Show progress modal and poll
                this.showProgressModal(jobId);
                this.pollJobStatus(jobId, { disabled: false, textContent: '' });
            } else {
                const error = await response.json();
                alert('❌ Error: ' + (error.error || 'Failed to continue'));
            }
        } catch (error) {
            alert('❌ Error: ' + error.message);
        }
    }

    confirmDeleteJob(jobId, jobName) {
        document.getElementById('deleteJobName').textContent = jobName;
        const modal = document.getElementById('deleteJobModal');
        modal.dataset.jobId = jobId;
        modal.classList.add('active');
    }

    async executeDeleteJob() {
        const modal = document.getElementById('deleteJobModal');
        const jobId = modal.dataset.jobId;
        try {
            const res = await fetch(`${APP_PREFIX}/api/job/${jobId}`, { method: 'DELETE' });
            if (res.ok) {
                modal.classList.remove('active');
                this.loadRecentJobs();
            } else {
                alert('Failed to delete job. Please try again.');
            }
        } catch (e) {
            alert('Error deleting job.');
        }
    }

    closeDeleteModal() {
        document.getElementById('deleteJobModal').classList.remove('active');
    }

    startJobsPolling() {
        this.stopJobsPolling();
        // Poll every 2 seconds while on Recent Jobs panel
        this.jobsPollingInterval = setInterval(() => {
            if (this.currentPanel === 'recent') {
                this.loadRecentJobs();
            }
        }, 2000);
    }

    stopJobsPolling() {
        if (this.jobsPollingInterval) {
            clearInterval(this.jobsPollingInterval);
            this.jobsPollingInterval = null;
        }
    }

    // ========================================
    // Image Upload Handling
    // ========================================

    handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const slideIndex = parseInt(e.target.getAttribute('data-slide-index'), 10);

        // Validate file is an image
        if (!file.type.startsWith('image/')) {
            this.showNotification('Please select an image file', 'error');
            return;
        }

        // Check file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            this.showNotification('File size must be less than 5MB', 'error');
            return;
        }

        // Save current slide data first
        this.saveCurrentSlideData();

        // Convert to base64 for storage
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64Data = event.target.result;

            if (!this.currentSlidePlan.slides[slideIndex]) return;

            const slide = this.currentSlidePlan.slides[slideIndex];
            slide.content = slide.content || {};

            // Store image data
            if (!slide.content.image) {
                slide.content.image = { path: '', alt: '', position: 'center' };
            }
            slide.content.image.path = base64Data;

            // Re-render slide editor to show preview
            this.updateSlideEditorView();
            this.showNotification('Image uploaded successfully', 'success');
        };
        reader.readAsDataURL(file);
    }

    removeImage(slideIndex) {
        if (!this.currentSlidePlan || !this.currentSlidePlan.slides[slideIndex]) return;

        this.saveCurrentSlideData();

        this.currentSlidePlan.slides[slideIndex].content.image = null;
        this.updateSlideEditorView();
        this.showNotification('Image removed', 'info');
    }

    // Insert a new image slide immediately after the parent slide
    handleImageAsNewSlide(e) {
        const file = e.target.files[0];
        if (!file) return;

        const parentIndex = parseInt(e.target.getAttribute('data-slide-index'), 10);

        if (!file.type.startsWith('image/')) {
            this.showNotification('Please select an image file', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            this.showNotification('File size must be less than 5MB', 'error');
            return;
        }

        this.saveCurrentSlideData();

        const captionEl = document.getElementById(`imageCaption${parentIndex}`);
        const caption = captionEl ? captionEl.value.trim() : '';

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64Data = event.target.result;
            const parentSlide = this.currentSlidePlan.slides[parentIndex];
            const parentTitle = parentSlide?.content?.title || 'Figure';
            // Slide header = context label; description = user's caption (kept separate)
            const slideTitle = `${parentTitle} — Figure`;

            const newSlide = {
                layout: 'title-image-text',
                content: {
                    title: slideTitle,
                    image: { path: base64Data, alt: caption, position: 'center' },
                    bullets: []
                },
                speakerNotes: ''
            };

            this.currentSlidePlan.slides.splice(parentIndex + 1, 0, newSlide);
            this.totalSlides = this.currentSlidePlan.slides.length;
            this.currentSlideIndex = parentIndex + 1;
            this.updateSlideEditorView();
            this.updateSlideDots();
            this.showNotification('Image slide added — you can now edit its title and description', 'success');
        };
        reader.readAsDataURL(file);
    }

    // Insert a new table slide immediately after the parent slide
    initTableAsNewSlide(parentIndex) {
        if (!this.currentSlidePlan) return;

        this.saveCurrentSlideData();

        const captionEl = document.getElementById(`tableCaption${parentIndex}`);
        const caption = captionEl ? captionEl.value.trim() : '';

        const parentSlide = this.currentSlidePlan.slides[parentIndex];
        const parentTitle = parentSlide?.content?.title || 'Table';
        // Slide header = context label; description = user's caption (kept separate)
        const slideTitle = `${parentTitle} — Table`;

        const newSlide = {
            layout: 'title-table',
            content: {
                title: slideTitle,
                table: {
                    headers: ['Column 1', 'Column 2', 'Column 3'],
                    rows: [['', '', ''], ['', '', '']],
                    caption: caption
                }
            },
            speakerNotes: ''
        };

        this.currentSlidePlan.slides.splice(parentIndex + 1, 0, newSlide);
        this.totalSlides = this.currentSlidePlan.slides.length;
        this.currentSlideIndex = parentIndex + 1;
        this.updateSlideEditorView();
        this.updateSlideDots();
        this.showNotification('Table slide added — you can now edit its caption and fill in the data', 'success');
    }

    // ========================================
    // Table Builder
    // ========================================

    renderTableBuilder(index, tableData) {
        const headers = tableData.headers || ['Column 1', 'Column 2'];
        const rows = tableData.rows || [['', '']];

        let html = '<table class="table-builder">';

        // Headers row
        html += '<thead><tr>';
        headers.forEach((header, colIndex) => {
            html += `
                <th>
                    <div class="table-cell-wrapper">
                        <input type="text" class="table-cell table-header-cell" value="${this.escapeHtml(header)}"
                            data-slide-index="${index}" data-row="header" data-col="${colIndex}"
                            onchange="desktopUI.updateTableCell(${index}, 'header', ${colIndex}, this.value)"
                            placeholder="Header ${colIndex + 1}" />
                        ${headers.length > 1 ? `<button type="button" class="table-cell-delete" onclick="desktopUI.removeTableColumn(${index}, ${colIndex})">×</button>` : ''}
                    </div>
                </th>
            `;
        });
        html += '</tr></thead>';

        // Data rows
        html += '<tbody>';
        rows.forEach((row, rowIndex) => {
            html += '<tr>';
            for (let colIndex = 0; colIndex < headers.length; colIndex++) {
                const cellValue = row[colIndex] || '';
                html += `
                    <td>
                        <input type="text" class="table-cell" value="${this.escapeHtml(cellValue)}"
                            data-slide-index="${index}" data-row="${rowIndex}" data-col="${colIndex}"
                            onchange="desktopUI.updateTableCell(${index}, ${rowIndex}, ${colIndex}, this.value)"
                            placeholder="Cell" />
                    </td>
                `;
            }
            html += `
                <td class="table-row-actions">
                    ${rows.length > 1 ? `<button type="button" class="btn-tiny btn-danger-tiny" onclick="desktopUI.removeTableRow(${index}, ${rowIndex})">Delete Row</button>` : ''}
                </td>
            </tr>`;
        });
        html += '</tbody></table>';

        return html;
    }

    updateTableCell(slideIndex, row, col, value) {
        if (!this.currentSlidePlan || !this.currentSlidePlan.slides[slideIndex]) return;

        const slide = this.currentSlidePlan.slides[slideIndex];
        slide.content = slide.content || {};

        if (!slide.content.table) {
            slide.content.table = { headers: ['Column 1', 'Column 2'], rows: [['', '']], caption: '' };
        }

        if (row === 'header') {
            slide.content.table.headers[col] = value;
        } else {
            if (!slide.content.table.rows[row]) {
                slide.content.table.rows[row] = [];
            }
            slide.content.table.rows[row][col] = value;
        }
    }

    addTableColumn(slideIndex) {
        if (!this.currentSlidePlan || !this.currentSlidePlan.slides[slideIndex]) return;

        this.saveCurrentSlideData();

        const slide = this.currentSlidePlan.slides[slideIndex];
        slide.content = slide.content || {};

        if (!slide.content.table) {
            slide.content.table = { headers: ['Column 1', 'Column 2'], rows: [['', '']], caption: '' };
        }

        const newColIndex = slide.content.table.headers.length;
        slide.content.table.headers.push(`Column ${newColIndex + 1}`);
        slide.content.table.rows.forEach(row => {
            row.push('');
        });

        this.updateSlideEditorView();
    }

    addTableRow(slideIndex) {
        if (!this.currentSlidePlan || !this.currentSlidePlan.slides[slideIndex]) return;

        this.saveCurrentSlideData();

        const slide = this.currentSlidePlan.slides[slideIndex];
        slide.content = slide.content || {};

        if (!slide.content.table) {
            slide.content.table = { headers: ['Column 1', 'Column 2'], rows: [['', '']], caption: '' };
        }

        const newRow = new Array(slide.content.table.headers.length).fill('');
        slide.content.table.rows.push(newRow);

        this.updateSlideEditorView();
    }

    removeTableColumn(slideIndex, colIndex) {
        if (!this.currentSlidePlan || !this.currentSlidePlan.slides[slideIndex]) return;

        this.saveCurrentSlideData();

        const slide = this.currentSlidePlan.slides[slideIndex];
        if (!slide.content.table || slide.content.table.headers.length <= 1) {
            this.showNotification('Table must have at least one column', 'error');
            return;
        }

        slide.content.table.headers.splice(colIndex, 1);
        slide.content.table.rows.forEach(row => {
            row.splice(colIndex, 1);
        });

        this.updateSlideEditorView();
    }

    removeTableRow(slideIndex, rowIndex) {
        if (!this.currentSlidePlan || !this.currentSlidePlan.slides[slideIndex]) return;

        this.saveCurrentSlideData();

        const slide = this.currentSlidePlan.slides[slideIndex];
        if (!slide.content.table || slide.content.table.rows.length <= 1) {
            this.showNotification('Table must have at least one row', 'error');
            return;
        }

        slide.content.table.rows.splice(rowIndex, 1);
        this.updateSlideEditorView();
    }

    removeTable(slideIndex) {
        if (!this.currentSlidePlan || !this.currentSlidePlan.slides[slideIndex]) return;

        if (!confirm('Remove the table from this slide?')) return;

        this.saveCurrentSlideData();
        this.currentSlidePlan.slides[slideIndex].content.table = null;
        this.updateSlideEditorView();
        this.showNotification('Table removed', 'info');
    }

    initTableBuilder(slideIndex) {
        if (!this.currentSlidePlan || !this.currentSlidePlan.slides[slideIndex]) return;

        this.saveCurrentSlideData();

        const slide = this.currentSlidePlan.slides[slideIndex];
        slide.content = slide.content || {};

        // Initialize with empty 2x2 table
        slide.content.table = {
            headers: ['Column 1', 'Column 2'],
            rows: [['', ''], ['', '']],
            caption: ''
        };

        this.updateSlideEditorView();
        this.showNotification('Table created', 'success');
    }

    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    // Notifications
    showNotification(message, type = 'info') {
        // Remove existing notification
        const existing = document.getElementById('appNotification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.id = 'appNotification';
        notification.className = `app-notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        // Add styles if not present
        if (!document.getElementById('notificationStyles')) {
            const styles = document.createElement('style');
            styles.id = 'notificationStyles';
            styles.textContent = `
                .app-notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 16px 24px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    z-index: 10000;
                    animation: slideIn 0.3s ease;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                }
                .app-notification.success {
                    background: linear-gradient(135deg, #10b981, #059669);
                    color: white;
                }
                .app-notification.error {
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    color: white;
                }
                .app-notification.info {
                    background: linear-gradient(135deg, #2AADA6, #1D2D5C);
                    color: white;
                }
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(styles);
        }

        // Auto-remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Utilities
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
}

// Initialize when DOM is ready
let desktopUI;
document.addEventListener('DOMContentLoaded', () => {
    desktopUI = new DesktopUI();
    window.desktopUI = desktopUI; // Make it globally accessible
});
