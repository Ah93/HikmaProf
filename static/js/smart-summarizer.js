// Smart Summarizer — self-contained, no overlap with desktop-ui.js
const smartSummarizer = (() => {
    let lastSummary = null;

    const el = id => document.getElementById(id);

    function showOnly(cardId) {
        ['ss-upload-card', 'ss-generating-card', 'ss-results-card'].forEach(id => {
            const node = el(id);
            if (node) node.style.display = id === cardId ? '' : 'none';
        });
    }

    // ── File upload ─────────────────────────────────────────────
    function initUpload() {
        const zone  = el('ssDropZone');
        const input = el('ssFileInput');
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
        el('ssFileName').textContent = file.name;
        el('ssFileSize').textContent = formatSize(file.size);
        el('ssFileInfo').style.display = 'flex';
        el('ssDropZone').style.display = 'none';
        el('ssFileInput')._file = file;
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    // ── Main ────────────────────────────────────────────────────
    async function start() {
        const input = el('ssFileInput');
        const file  = input && input._file;
        if (!file) { alert('Please select a document first.'); return; }

        const language = (el('ssLanguage') || {}).value || 'en';
        showOnly('ss-generating-card');
        el('ssStatusTitle').textContent = 'Summarising your document…';

        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('language', language);

            const resp = await fetch('/api/summarize', { method: 'POST', body: fd });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || 'Summarization failed');
            }
            const data = await resp.json();
            lastSummary = data;
            renderResults(data);
            showOnly('ss-results-card');

        } catch (err) {
            el('ssStatusTitle').textContent = '❌ ' + err.message;
            setTimeout(() => showOnly('ss-upload-card'), 3000);
        }
    }

    // ── Render results ──────────────────────────────────────────
    function renderResults(d) {
        el('ssDocTitle').textContent = d.title || 'Document Summary';
        el('ssOverview').textContent  = d.overview || '';

        // Key concepts
        const kc = el('ssKeyConcepts');
        kc.innerHTML = (d.key_concepts || []).map(c =>
            `<div class="ss-concept">
                <div class="ss-concept-term">${esc(c.term)}</div>
                <div class="ss-concept-def">${esc(c.explanation)}</div>
            </div>`
        ).join('');

        // Main arguments
        const ma = el('ssMainArguments');
        ma.innerHTML = (d.main_arguments || []).map(a =>
            `<li class="ss-list-item">${esc(a)}</li>`
        ).join('');

        // Takeaways
        const tk = el('ssTakeaways');
        tk.innerHTML = (d.bullet_takeaways || []).map((t, i) =>
            `<div class="ss-takeaway">
                <span class="ss-takeaway-num">${i + 1}</span>
                <span>${esc(t)}</span>
            </div>`
        ).join('');
    }

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── Copy to clipboard ───────────────────────────────────────
    function copy() {
        if (!lastSummary) return;
        const d = lastSummary;
        let text = `${d.title || 'Summary'}\n${'='.repeat(40)}\n\n`;
        text += `OVERVIEW\n${d.overview}\n\n`;
        text += `KEY CONCEPTS\n${(d.key_concepts || []).map(c => `• ${c.term}: ${c.explanation}`).join('\n')}\n\n`;
        text += `MAIN ARGUMENTS\n${(d.main_arguments || []).map(a => `• ${a}`).join('\n')}\n\n`;
        text += `KEY TAKEAWAYS\n${(d.bullet_takeaways || []).map((t, i) => `${i + 1}. ${t}`).join('\n')}`;

        navigator.clipboard.writeText(text).then(() => {
            const btn = el('ssCopyBtn');
            if (btn) { btn.textContent = '✅ Copied!'; setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000); }
        }).catch(() => alert('Copy failed — please copy manually.'));
    }

    // ── DOCX export ─────────────────────────────────────────────
    async function downloadDocx() {
        if (!lastSummary) return;
        const btn = el('ssDocxBtn');
        const originalText = btn.textContent;
        btn.textContent = '⏳ Preparing…';
        btn.disabled = true;

        try {
            const resp = await fetch('/api/summarize/docx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(lastSummary)
            });
            if (!resp.ok) throw new Error('Export failed');

            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${(lastSummary.title || 'summary').replace(/[^\w\- ]/g, '')}.docx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            alert('Could not export DOCX: ' + err.message);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    // ── Reset ───────────────────────────────────────────────────
    function reset() {
        lastSummary = null;
        const input = el('ssFileInput');
        if (input) { input.value = ''; input._file = null; }
        el('ssFileInfo').style.display = 'none';
        el('ssDropZone').style.display = '';
        showOnly('ss-upload-card');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUpload);
    } else {
        initUpload();
    }

    return { start, copy, downloadDocx, reset };
})();
