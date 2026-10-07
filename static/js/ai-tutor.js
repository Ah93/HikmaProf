// AI Tutor — self-contained, no overlap with desktop-ui.js
// Upload a document, chat about it. History is kept client-side and replayed
// (bounded) with each question; the server re-reads the stored document text.
const aiTutor = (() => {
    let jobId        = null;
    let history      = [];   // [{role: 'user'|'assistant', content}]
    let busy         = false;
    const MAX_CLIENT_HISTORY = 20;

    const el = id => document.getElementById(id);

    function showOnly(cardId) {
        ['at-upload-card', 'at-preparing-card', 'at-chat-card'].forEach(id => {
            const node = el(id);
            if (node) node.style.display = id === cardId ? '' : 'none';
        });
    }

    // ── File upload ─────────────────────────────────────────────
    function initUpload() {
        const zone  = el('atDropZone');
        const input = el('atFileInput');
        if (!zone || !input) return;

        zone.addEventListener('click', () => input.click());
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = '#2AADA6'; });
        zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
        zone.addEventListener('drop', e => {
            e.preventDefault(); zone.style.borderColor = '';
            if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
        });
        input.addEventListener('change', () => { if (input.files[0]) setFile(input.files[0]); });

        const textarea = el('atInput');
        if (textarea) {
            textarea.addEventListener('input', autoResize);
            textarea.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                }
            });
        }
    }

    function setFile(file) {
        el('atFileName').textContent = file.name;
        el('atFileSize').textContent = formatSize(file.size);
        el('atFileInfo').style.display = 'flex';
        el('atDropZone').style.display = 'none';
        el('atFileInput')._file = file;
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function autoResize() {
        const ta = el('atInput');
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    }

    // ── Start session ───────────────────────────────────────────
    async function start() {
        const input = el('atFileInput');
        const file  = input && input._file;
        if (!file) { alert('Please select a document first.'); return; }

        showOnly('at-preparing-card');

        try {
            const fd = new FormData();
            fd.append('file', file);

            const resp = await fetch('/api/tutor/start', { method: 'POST', body: fd });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || 'Could not start tutor session');
            }
            const data = await resp.json();

            jobId   = data.job_id;
            history = [];
            el('atDocTitle').textContent = data.title || 'Your Document';
            el('atChatWindow').innerHTML = '';
            renderSuggested(data.suggested_questions || []);
            addMessage('assistant',
                `I've read through **${escMd(data.title || 'your document')}**. Ask me anything about it — ` +
                `concepts, definitions, how ideas connect — and I'll walk you through it.`);

            showOnly('at-chat-card');
            el('atInput').focus();

        } catch (err) {
            alert(err.message);
            showOnly('at-upload-card');
        }
    }

    function renderSuggested(questions) {
        const wrap = el('atSuggested');
        if (!questions.length) { wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
        wrap.style.display = 'flex';
        wrap.innerHTML = questions.map(q =>
            `<button class="at-chip" onclick="aiTutor.askSuggested(this)">${esc(q)}</button>`
        ).join('');
    }

    function askSuggested(btn) {
        if (busy) return;
        el('atInput').value = btn.textContent;
        send();
    }

    // ── Chat ────────────────────────────────────────────────────
    async function send() {
        if (busy || !jobId) return;
        const ta = el('atInput');
        const question = ta.value.trim();
        if (!question) return;

        hideSuggested();
        addMessage('user', question);
        history.push({ role: 'user', content: question });
        ta.value = '';
        autoResize();
        setBusy(true);
        const typingEl = addTyping();

        try {
            const resp = await fetch(`/api/tutor/${jobId}/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, history: history.slice(0, -1) })
            });
            removeTyping(typingEl);

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || 'The tutor could not answer that. Please try again.');
            }
            const data = await resp.json();
            addMessage('assistant', data.answer || '');
            history.push({ role: 'assistant', content: data.answer || '' });
            if (history.length > MAX_CLIENT_HISTORY) history = history.slice(-MAX_CLIENT_HISTORY);

        } catch (err) {
            removeTyping(typingEl);
            addMessage('error', err.message);
        } finally {
            setBusy(false);
            ta.focus();
        }
    }

    function setBusy(val) {
        busy = val;
        el('atSendBtn').disabled = val;
        el('atInput').disabled = val;
    }

    function hideSuggested() {
        const wrap = el('atSuggested');
        if (wrap) wrap.style.display = 'none';
    }

    // ── Message rendering ──────────────────────────────────────
    function addMessage(role, text) {
        const win = el('atChatWindow');
        const row = document.createElement('div');
        row.className = `at-row at-row-${role}`;

        if (role === 'assistant') {
            row.innerHTML = `<div class="at-avatar">🎓</div><div class="at-bubble at-bubble-assistant">${renderMarkdownLite(text)}</div>`;
        } else if (role === 'error') {
            row.innerHTML = `<div class="at-bubble at-bubble-error">⚠️ ${esc(text)}</div>`;
        } else {
            row.innerHTML = `<div class="at-bubble at-bubble-user">${esc(text)}</div>`;
        }

        win.appendChild(row);
        scrollToBottom();
    }

    function addTyping() {
        const win = el('atChatWindow');
        const row = document.createElement('div');
        row.className = 'at-row at-row-assistant';
        row.innerHTML = `<div class="at-avatar">🎓</div><div class="at-bubble at-bubble-assistant at-typing"><span></span><span></span><span></span></div>`;
        win.appendChild(row);
        scrollToBottom();
        return row;
    }

    function removeTyping(node) {
        if (node && node.parentNode) node.parentNode.removeChild(node);
    }

    function scrollToBottom() {
        const win = el('atChatWindow');
        win.scrollTop = win.scrollHeight;
    }

    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // esc() for text that will be interpolated into an already-markdown string
    function escMd(s) { return esc(s); }

    // Minimal, safe markdown: escapes first, then formats **bold**, bullet
    // lines, numbered lines, and paragraph breaks. No raw HTML ever passes through.
    function renderMarkdownLite(raw) {
        const safe = esc(raw);
        const lines = safe.split('\n');
        let html = '';
        let inList = false;

        const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };

        lines.forEach(line => {
            const trimmed = line.trim();
            const bulletMatch = trimmed.match(/^[-*]\s+(.*)/);
            const numberedMatch = trimmed.match(/^\d+[.)]\s+(.*)/);

            if (bulletMatch || numberedMatch) {
                if (!inList) { html += '<ul class="at-list">'; inList = true; }
                html += `<li>${inlineFormat(bulletMatch ? bulletMatch[1] : numberedMatch[1])}</li>`;
            } else if (trimmed === '') {
                closeList();
            } else {
                closeList();
                html += `<p>${inlineFormat(trimmed)}</p>`;
            }
        });
        closeList();
        return html || '<p></p>';
    }

    function inlineFormat(text) {
        return text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/`(.+?)`/g, '<code>$1</code>');
    }

    // ── Reset ───────────────────────────────────────────────────
    function reset() {
        jobId = null;
        history = [];
        busy = false;
        const input = el('atFileInput');
        if (input) { input.value = ''; input._file = null; }
        el('atFileInfo').style.display = 'none';
        el('atDropZone').style.display = '';
        el('atChatWindow').innerHTML = '';
        el('atInput').value = '';
        showOnly('at-upload-card');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUpload);
    } else {
        initUpload();
    }

    return { start, send, askSuggested, reset };
})();
