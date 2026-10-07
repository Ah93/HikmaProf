// Lecture Notes — self-contained, no overlap with desktop-ui.js
const lectureNotes = (() => {
    let lastNotes = null;

    const el = id => document.getElementById(id);

    function showOnly(cardId) {
        ['ln-upload-card', 'ln-generating-card', 'ln-results-card'].forEach(id => {
            const node = el(id);
            if (node) node.style.display = id === cardId ? '' : 'none';
        });
    }

    // ── File upload ─────────────────────────────────────────────
    function initUpload() {
        const zone  = el('lnDropZone');
        const input = el('lnFileInput');
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
        el('lnFileName').textContent = file.name;
        el('lnFileSize').textContent = formatSize(file.size);
        el('lnFileInfo').style.display = 'flex';
        el('lnDropZone').style.display = 'none';
        el('lnFileInput')._file = file;
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    // ── Main ────────────────────────────────────────────────────
    async function start() {
        const input = el('lnFileInput');
        const file  = input && input._file;
        if (!file) { alert('Please select a document first.'); return; }

        const language = (el('lnLanguage') || {}).value || 'en';
        showOnly('ln-generating-card');
        el('lnStatusTitle').textContent = 'Writing your lecture notes…';

        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('language', language);

            const resp = await fetch('/api/lecture-notes', { method: 'POST', body: fd });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || 'Lecture notes generation failed');
            }
            const data = await resp.json();
            lastNotes = data;
            renderNotes(data);
            showOnly('ln-results-card');

        } catch (err) {
            el('lnStatusTitle').textContent = '❌ ' + err.message;
            setTimeout(() => showOnly('ln-upload-card'), 3000);
        }
    }

    // ── Render ──────────────────────────────────────────────────
    function renderNotes(d) {
        el('lnDocTitle').textContent = d.title || 'Lecture Notes';

        const wrap = el('lnSections');
        wrap.innerHTML = (d.sections || []).map((s, i) => `
            <div class="ln-section">
                <div class="ln-section-heading">${i + 1}. ${esc(s.heading)}</div>
                <p class="ln-section-body">${esc(s.body)}</p>
                ${(s.key_terms || []).length ? `
                    <div class="ln-key-terms">
                        ${s.key_terms.map(kt => `
                            <div class="ln-key-term">
                                <span class="ln-key-term-name">${esc(kt.term)}</span>
                                <span class="ln-key-term-note">${esc(kt.note)}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('');

        const sp = el('lnSummaryPoints');
        sp.innerHTML = (d.summary_points || []).map((t, i) => `
            <div class="ss-takeaway">
                <span class="ss-takeaway-num">${i + 1}</span>
                <span>${esc(t)}</span>
            </div>
        `).join('');
    }

    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── DOCX export ─────────────────────────────────────────────
    async function downloadDocx() {
        if (!lastNotes) return;
        const btn = el('lnDocxBtn');
        const originalText = btn.textContent;
        btn.textContent = '⏳ Preparing…';
        btn.disabled = true;

        try {
            const resp = await fetch('/api/lecture-notes/docx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(lastNotes)
            });
            if (!resp.ok) throw new Error('Export failed');

            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${(lastNotes.title || 'lecture-notes').replace(/[^\w\- ]/g, '')}.docx`;
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
        lastNotes = null;
        const input = el('lnFileInput');
        if (input) { input.value = ''; input._file = null; }
        el('lnFileInfo').style.display = 'none';
        el('lnDropZone').style.display = '';
        showOnly('ln-upload-card');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUpload);
    } else {
        initUpload();
    }

    return { start, downloadDocx, reset };
})();
