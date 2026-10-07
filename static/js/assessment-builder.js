// Assessment — self-contained, no overlap with desktop-ui.js
// Uploads a document, generates a quiz + true/false + flashcards, then opens
// the existing assessment modal (assessment.js) to take it and claim a certificate.
const assessmentBuilder = (() => {
    const el = id => document.getElementById(id);

    function showOnly(cardId) {
        ['asm-upload-card', 'asm-generating-card'].forEach(id => {
            const node = el(id);
            if (node) node.style.display = id === cardId ? '' : 'none';
        });
    }

    // ── File upload ─────────────────────────────────────────────
    function initUpload() {
        const zone  = el('asmDropZone');
        const input = el('asmFileInput');
        if (!zone || !input) return;

        zone.addEventListener('click', () => input.click());
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = '#2AADA6'; });
        zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
        zone.addEventListener('drop', e => {
            e.preventDefault(); zone.style.borderColor = '';
            if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
        });
        input.addEventListener('change', () => { if (input.files[0]) setFile(input.files[0]); });
    }

    function setFile(file) {
        el('asmFileName').textContent = file.name;
        el('asmFileSize').textContent = formatSize(file.size);
        el('asmFileInfo').style.display = 'flex';
        el('asmDropZone').style.display = 'none';
        el('asmFileInput')._file = file;
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    // ── Main ────────────────────────────────────────────────────
    async function start() {
        const input = el('asmFileInput');
        const file  = input && input._file;
        if (!file) { alert('Please select a document first.'); return; }

        showOnly('asm-generating-card');
        el('asmStatusTitle').textContent = 'Building your assessment…';

        try {
            const fd = new FormData();
            fd.append('file', file);

            const resp = await fetch('/api/assessment/generate', { method: 'POST', body: fd });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || 'Assessment generation failed');
            }
            const data = await resp.json();

            window.assessmentUI && assessmentUI.open(data.job_id);
            reset();

        } catch (err) {
            el('asmStatusTitle').textContent = '❌ ' + err.message;
            setTimeout(() => showOnly('asm-upload-card'), 3000);
        }
    }

    // ── Reset ───────────────────────────────────────────────────
    function reset() {
        const input = el('asmFileInput');
        if (input) { input.value = ''; input._file = null; }
        el('asmFileInfo').style.display = 'none';
        el('asmDropZone').style.display = '';
        showOnly('asm-upload-card');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUpload);
    } else {
        initUpload();
    }

    return { start, reset };
})();
