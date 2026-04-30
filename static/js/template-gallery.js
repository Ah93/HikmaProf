// Template Gallery Component
class TemplateGallery {
    constructor() {
        this.templates = [];
        this.colors = [];
        this.selectedTemplate = 'modern';
        this.selectedColor = 'blue';
        this.init();
    }

    async init() {
        await this.loadTemplates();
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

    renderTemplateGallery() {
        const container = document.getElementById('templateGallery');
        if (!container) return;

        // Show only 8 curated, modern templates
        const FEATURED_IDS = ['modern', 'minimal', 'tech', 'creative', 'corporate', 'elegant', 'startup', 'magazine'];
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

        // Group colors by category
        const lightColors = this.colors.filter(c => c.category === 'light');
        const darkColors = this.colors.filter(c => c.category === 'dark');

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
        // Template selection
        document.addEventListener('click', (e) => {
            const templateCard = e.target.closest('.template-card');
            if (templateCard) {
                const templateId = templateCard.dataset.templateId;
                this.selectTemplate(templateId);
            }

            const colorCard = e.target.closest('.color-card');
            if (colorCard) {
                const colorId = colorCard.dataset.colorId;
                this.selectColor(colorId);
            }
        });

        // Change button - opens gallery
        const changeBtn = document.getElementById('changeTemplateBtn');
        if (changeBtn) {
            changeBtn.addEventListener('click', () => {
                this.showGallery();
            });
        }

        // Confirm button - closes gallery and updates display
        const confirmBtn = document.getElementById('confirmTemplateBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                this.hideGallery();
                this.updateSelectedDisplay();
            });
        }
    }

    showGallery() {
        const gallery = document.getElementById('templateGallerySection');
        const display = document.getElementById('selectedTemplateDisplay');
        if (gallery) gallery.style.display = 'block';
        if (display) display.style.display = 'none';
    }

    hideGallery() {
        const gallery = document.getElementById('templateGallerySection');
        const display = document.getElementById('selectedTemplateDisplay');
        if (gallery) gallery.style.display = 'none';
        if (display) display.style.display = 'block';
    }

    updateSelectedDisplay() {
        // Update the selected template name display
        const templateNameEl = document.getElementById('selectedTemplateName');
        const colorNameEl = document.getElementById('selectedColorName');

        if (templateNameEl) {
            const template = this.templates.find(t => t.id === this.selectedTemplate);
            templateNameEl.textContent = template ? template.name : this.selectedTemplate;
        }

        if (colorNameEl) {
            const color = this.colors.find(c => c.id === this.selectedColor);
            colorNameEl.textContent = color ? color.name : this.selectedColor;
        }
    }

    selectTemplate(templateId) {
        this.selectedTemplate = templateId;

        // Update hidden input
        const input = document.getElementById('templateStyle');
        if (input) input.value = templateId;

        // Update UI
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

        // Update display immediately
        this.updateSelectedDisplay();
        console.log('Selected template:', templateId);
    }

    selectColor(colorId) {
        this.selectedColor = colorId;

        // Update hidden input
        const input = document.getElementById('colorScheme');
        if (input) input.value = colorId;

        // Update UI
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

        // Update display immediately
        this.updateSelectedDisplay();
        console.log('Selected color:', colorId);
    }
}

// Initialize template gallery when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.templateGallery = new TemplateGallery();
});
