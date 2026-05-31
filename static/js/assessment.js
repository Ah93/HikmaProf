/* ── Assessment UI ───────────────────────────────────────────────── */
class AssessmentUI {
    constructor() {
        this.data        = null;   // full assessment JSON
        this.currentJobId = null;
        // quiz state
        this.qIndex      = 0;
        this.answers     = [];     // -1 = unanswered
        this.reviewMode  = false;
        // flashcard state
        this.fcIndex     = 0;
        this.fcOrder     = [];
        this.fcFlipped   = false;
    }

    /* ── Open modal ──────────────────────────────────────────────── */
    async open(jobId) {
        this.currentJobId = jobId;
        this.data         = null;
        this._resetState();
        this._showLoading(true);
        this._setVisible(true);

        try {
            // Try cached first
            let resp = await fetch(`${APP_PREFIX}/api/job/${jobId}/assessment`);
            if (!resp.ok) {
                // Generate
                resp = await fetch(`${APP_PREFIX}/api/job/${jobId}/assessment/generate`, { method: 'POST' });
            }
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to generate assessment');
            }
            this.data = await resp.json();
            this._initState();
            this._showLoading(false);
            this._render();
        } catch (e) {
            this._showError(e.message);
        }
    }

    close() {
        const overlay = document.getElementById('assessmentOverlay');
        overlay.classList.remove('visible');
        setTimeout(() => { overlay.style.display = 'none'; }, 280);
    }

    /* ── Tab switching ───────────────────────────────────────────── */
    switchTab(tab) {
        document.querySelectorAll('.assessment-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        document.getElementById('quizPane').classList.toggle('active', tab === 'quiz');
        document.getElementById('flashcardsPane').classList.toggle('active', tab === 'flashcards');
        document.getElementById('quizPane').style.display      = tab === 'quiz'       ? 'block' : 'none';
        document.getElementById('flashcardsPane').style.display = tab === 'flashcards' ? 'block' : 'none';
    }

    /* ── Internal helpers ────────────────────────────────────────── */
    _setVisible(show) {
        const overlay = document.getElementById('assessmentOverlay');
        if (show) {
            overlay.style.display = 'flex';
            requestAnimationFrame(() => overlay.classList.add('visible'));
        }
    }

    _showLoading(show) {
        document.getElementById('assessmentLoading').style.display  = show ? 'flex'  : 'none';
        document.getElementById('quizPane').style.display            = show ? 'none'  : 'block';
        document.getElementById('flashcardsPane').style.display      = 'none';
        document.getElementById('assessmentFooter').style.display    = show ? 'none'  : 'flex';
        document.getElementById('assessmentTabs').style.display      = show ? 'none'  : 'flex';
        document.querySelector('.assessment-tab-divider').style.display = show ? 'none' : 'block';
    }

    _showError(msg) {
        document.getElementById('assessmentLoading').innerHTML = `
            <div style="text-align:center;padding:40px 20px">
                <div style="font-size:36px;margin-bottom:12px">⚠️</div>
                <div style="color:#f87171;font-size:15px;font-weight:600;margin-bottom:8px">Generation Failed</div>
                <div style="color:#666;font-size:13px;max-width:340px;margin:0 auto">${msg}</div>
                <button onclick="assessmentUI.close()" style="margin-top:20px;padding:8px 20px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#aaa;cursor:pointer;font-size:13px">Close</button>
            </div>`;
    }

    _resetState() {
        this.qIndex     = 0;
        this.answers    = [];
        this.reviewMode = false;
        this.fcIndex    = 0;
        this.fcOrder    = [];
        this.fcFlipped  = false;
    }

    _initState() {
        const q = this.data.questions || [];
        this.answers = new Array(q.length).fill(-1);
        this.fcOrder = (this.data.flashcards || []).map((_, i) => i);
    }

    /* ── Render everything ───────────────────────────────────────── */
    _render() {
        document.getElementById('assessmentTitle').textContent =
            this.data.title || 'Assessment';
        this._renderQuiz();
        this._renderFlashcards();
        this.switchTab('quiz');
    }

    /* ════════════════════════════════════════════════════════════ */
    /*  QUIZ                                                        */
    /* ════════════════════════════════════════════════════════════ */
    _renderQuiz() {
        const pane  = document.getElementById('quizPane');
        const total = (this.data.questions || []).length;
        if (!total) { pane.innerHTML = '<p style="color:#666;padding:20px">No questions generated.</p>'; return; }

        if (this.reviewMode) {
            this._renderReview(pane);
            return;
        }

        const answered  = this.answers.filter(a => a !== -1).length;
        const correct   = this._countCorrect();
        const q         = this.data.questions[this.qIndex];
        const userAns   = this.answers[this.qIndex];
        const answered1 = userAns !== -1;
        const letters   = ['A', 'B', 'C', 'D'];
        const pct       = Math.round((this.qIndex / total) * 100);

        pane.innerHTML = `
            <div class="quiz-progress-wrap">
                <div class="quiz-progress-bar">
                    <div class="quiz-progress-fill" style="width:${pct}%"></div>
                </div>
                <span class="quiz-progress-label">Q ${this.qIndex + 1} / ${total}</span>
                <span class="quiz-score-badge">${correct} / ${answered} correct</span>
            </div>

            <div class="question-card">
                <div class="question-number">Question ${this.qIndex + 1}</div>
                <div class="question-text">${this._esc(q.question)}</div>
                <div class="options-grid" id="optionsGrid">
                    ${(q.options || []).map((opt, i) => {
                        let cls = '';
                        if (answered1) {
                            if (i === q.correct)        cls = 'correct';
                            else if (i === userAns)     cls = 'wrong';
                        }
                        return `<button class="option-btn ${cls}"
                            onclick="assessmentUI._pickAnswer(${i})"
                            ${answered1 ? 'disabled' : ''}>
                            <span class="option-letter">${letters[i]}</span>
                            <span>${this._esc(opt)}</span>
                        </button>`;
                    }).join('')}
                </div>
                <div class="explanation-box ${answered1 ? 'visible' : ''}" id="explanationBox">
                    ${answered1 ? `<strong>${userAns === q.correct ? '✅ Correct!' : '❌ Incorrect.'}</strong> ${this._esc(q.explanation || '')}` : ''}
                </div>
            </div>

            <div class="quiz-nav">
                ${this.qIndex > 0
                    ? `<button class="btn-review" onclick="assessmentUI._prevQ()">← Back</button>`
                    : ''}
                ${answered1
                    ? (this.qIndex < total - 1
                        ? `<button class="btn-quiz-next" onclick="assessmentUI._nextQ()">Next →</button>`
                        : `<button class="btn-quiz-next" onclick="assessmentUI._showScore()">See Results 🎉</button>`)
                    : `<button class="btn-quiz-next" disabled>Select an answer</button>`
                }
            </div>`;
    }

    _pickAnswer(i) {
        if (this.answers[this.qIndex] !== -1) return;
        this.answers[this.qIndex] = i;
        this._renderQuiz();
    }

    _nextQ() {
        if (this.qIndex < (this.data.questions.length - 1)) {
            this.qIndex++;
            this._renderQuiz();
        }
    }

    _prevQ() {
        if (this.qIndex > 0) {
            this.qIndex--;
            this._renderQuiz();
        }
    }

    _countCorrect() {
        return (this.data.questions || []).filter((q, i) => this.answers[i] === q.correct).length;
    }

    _showScore() {
        const total   = this.data.questions.length;
        const correct = this._countCorrect();
        const pct     = Math.round((correct / total) * 100);
        const { grade, color, msg } = this._grade(pct);

        const pane = document.getElementById('quizPane');
        pane.innerHTML = `
            <div class="score-screen visible">
                <div class="score-circle" style="border-color:${color};box-shadow:0 0 40px ${color}44">
                    <div class="score-percent" style="color:${color}">${pct}%</div>
                    <div class="score-fraction">${correct} / ${total}</div>
                </div>
                <div class="score-grade" style="color:${color}">${grade}</div>
                <div class="score-message">${msg}</div>
                <div class="score-actions">
                    <button class="btn-retry" onclick="assessmentUI._retryQuiz()">🔄 Retry Quiz</button>
                    <button class="btn-review" onclick="assessmentUI._enterReview()">📋 Review Answers</button>
                </div>
            </div>`;
    }

    _grade(pct) {
        if (pct >= 90) return { grade: 'Excellent!', color: '#10b981', msg: 'Outstanding performance. You mastered this material.' };
        if (pct >= 75) return { grade: 'Good Job!',  color: '#3b82f6', msg: 'Solid understanding. A bit more review will make it perfect.' };
        if (pct >= 60) return { grade: 'Not Bad',    color: '#f59e0b', msg: 'Fair performance. Review the explanations to strengthen your knowledge.' };
        return          { grade: 'Keep Trying',      color: '#ef4444', msg: 'Keep studying — you\'ll get there with more practice.' };
    }

    _retryQuiz() {
        this.qIndex     = 0;
        this.answers    = new Array(this.data.questions.length).fill(-1);
        this.reviewMode = false;
        this._renderQuiz();
    }

    _enterReview() {
        this.reviewMode = true;
        this._renderQuiz();
    }

    _renderReview(pane) {
        const questions = this.data.questions || [];
        const letters   = ['A', 'B', 'C', 'D'];
        let html = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                <div style="font-size:15px;font-weight:700;color:#e8e0ff">Answer Review</div>
                <button class="btn-retry" onclick="assessmentUI._retryQuiz()">🔄 Try Again</button>
            </div>`;

        questions.forEach((q, i) => {
            const ua      = this.answers[i];
            const correct = ua === q.correct;
            html += `
                <div class="question-card review-item" style="margin-bottom:12px">
                    <span class="review-result-badge ${correct ? 'correct-badge' : 'wrong-badge'}">
                        ${correct ? '✅ Correct' : '❌ Incorrect'}
                    </span>
                    <div class="question-text" style="font-size:14px;margin-bottom:10px">${this._esc(q.question)}</div>
                    ${(q.options || []).map((opt, j) => {
                        let style = 'opacity:0.4';
                        if (j === q.correct) style = 'color:#6ee7b7;opacity:1;font-weight:600';
                        else if (j === ua)   style = 'color:#fca5a5;opacity:1';
                        return `<div style="font-size:13px;padding:4px 0;${style}">${letters[j]}. ${this._esc(opt)}</div>`;
                    }).join('')}
                    ${q.explanation ? `<div style="margin-top:10px;font-size:12px;color:#9d7aff;padding:8px 12px;background:rgba(120,80,255,0.08);border-radius:8px">${this._esc(q.explanation)}</div>` : ''}
                </div>`;
        });

        pane.innerHTML = html;
    }

    /* ════════════════════════════════════════════════════════════ */
    /*  FLASHCARDS                                                  */
    /* ════════════════════════════════════════════════════════════ */
    _renderFlashcards() {
        const pane  = document.getElementById('flashcardsPane');
        const cards = (this.data.flashcards || []);
        if (!cards.length) { pane.innerHTML = '<p style="color:#666;padding:20px">No flashcards generated.</p>'; return; }

        const total = cards.length;
        const idx   = this.fcOrder[this.fcIndex];
        const card  = cards[idx];

        // Dot indicators (max 8 shown)
        const dots  = this.fcOrder.slice(0, Math.min(total, 8)).map((_, i) =>
            `<div class="fc-dot ${i === this.fcIndex ? 'active' : ''}"></div>`
        ).join('');

        pane.innerHTML = `
            <div class="flashcard-progress">
                <span class="flashcard-count">Card ${this.fcIndex + 1} of ${total}</span>
                <button class="btn-shuffle" onclick="assessmentUI._shuffleCards()">🔀 Shuffle</button>
            </div>

            <div class="flashcard-scene ${this.fcFlipped ? 'flipped' : ''}" id="flashcardScene" onclick="assessmentUI._flipCard()">
                <div class="flashcard-inner">
                    <div class="flashcard-face flashcard-front">
                        <div class="flashcard-label">Term</div>
                        <div class="flashcard-term">${this._esc(card.term)}</div>
                        <div class="flashcard-hint">Click to reveal definition</div>
                    </div>
                    <div class="flashcard-face flashcard-back">
                        <div class="flashcard-label">Definition</div>
                        <div class="flashcard-definition">${this._esc(card.definition)}</div>
                        <div class="flashcard-hint">Click to flip back</div>
                    </div>
                </div>
            </div>

            <div class="flashcard-nav">
                <button class="btn-fc-nav" onclick="assessmentUI._prevCard()" ${this.fcIndex === 0 ? 'disabled' : ''}>‹</button>
                <div class="fc-nav-dots">${dots}</div>
                <button class="btn-fc-nav" onclick="assessmentUI._nextCard()" ${this.fcIndex === total - 1 ? 'disabled' : ''}>›</button>
            </div>`;
    }

    _flipCard() {
        this.fcFlipped = !this.fcFlipped;
        const scene = document.getElementById('flashcardScene');
        if (scene) scene.classList.toggle('flipped', this.fcFlipped);
    }

    _nextCard() {
        if (this.fcIndex < this.fcOrder.length - 1) {
            this.fcIndex++;
            this.fcFlipped = false;
            this._renderFlashcards();
        }
    }

    _prevCard() {
        if (this.fcIndex > 0) {
            this.fcIndex--;
            this.fcFlipped = false;
            this._renderFlashcards();
        }
    }

    _shuffleCards() {
        for (let i = this.fcOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.fcOrder[i], this.fcOrder[j]] = [this.fcOrder[j], this.fcOrder[i]];
        }
        this.fcIndex   = 0;
        this.fcFlipped = false;
        this._renderFlashcards();
    }

    /* ════════════════════════════════════════════════════════════ */
    /*  Assessments Panel — job list                               */
    /* ════════════════════════════════════════════════════════════ */
    async loadJobList() {
        const container = document.getElementById('assessmentJobsList');
        if (!container) return;
        container.innerHTML = `<div class="assessments-empty"><div class="assessments-empty-icon">⏳</div><div class="assessments-empty-text">Loading jobs...</div></div>`;

        try {
            const resp = await fetch(`${APP_PREFIX}/api/jobs`);
            if (!resp.ok) throw new Error('Failed to load jobs');
            const data = await resp.json();
            // Filter jobs that have a slide plan (these are fully generated presentations)
            const jobs = (data.jobs || []).filter(j => j.has_slide_plan);

            if (!jobs.length) {
                container.innerHTML = `
                    <div class="assessments-empty">
                        <div class="assessments-empty-icon">📭</div>
                        <div class="assessments-empty-text">No presentations yet.<br>Generate one first to create an assessment!</div>
                    </div>`;
                return;
            }

            // Fetch titles from slide plans in parallel
            const cards = await Promise.all(jobs.map(async job => {
                // Assessment already cached — detected from files list
                const hasAssessment = (job.files || []).includes('assessment.json');

                // Get presentation title from slide plan
                let title = job.job_id.slice(0, 12);
                try {
                    const sr = await fetch(`${APP_PREFIX}/api/job/${job.job_id}/slide-plan-data`);
                    if (sr.ok) {
                        const sp = await sr.json();
                        const meta = sp.presentationMetadata || sp.metadata || {};
                        if (meta.title) title = meta.title;
                    }
                } catch (_) {}

                const date = job.created_at
                    ? new Date(job.created_at).toLocaleDateString()
                    : '';

                return `
                    <div class="assessment-job-card" onclick="assessmentUI.open('${job.job_id}')">
                        <div class="assessment-job-icon">📊</div>
                        <div class="assessment-job-info">
                            <div class="assessment-job-name">${this._esc(title)}</div>
                            <div class="assessment-job-meta">${date}</div>
                        </div>
                        <span class="${hasAssessment ? 'assessment-has-badge' : 'assessment-no-badge'}">
                            ${hasAssessment ? '✓ Ready' : '+ Generate'}
                        </span>
                    </div>`;
            }));

            container.innerHTML = cards.join('');
        } catch (e) {
            container.innerHTML = `<div class="assessments-empty"><div class="assessments-empty-icon">⚠️</div><div class="assessments-empty-text">${e.message}</div></div>`;
        }
    }

    /* ════════════════════════════════════════════════════════════ */
    /*  Export PDF                                                  */
    /* ════════════════════════════════════════════════════════════ */
    exportPDF() {
        if (!this.data) return;
        const letters = ['A', 'B', 'C', 'D'];
        let html = `<div class="assessment-print-root">
            <h1>${this._esc(this.data.title || 'Assessment')}</h1>
            <h2 style="font-size:15px;margin-bottom:16px;color:#333">Quiz — Multiple Choice</h2>`;

        (this.data.questions || []).forEach((q, i) => {
            html += `<div class="print-question">
                <h3>${i + 1}. ${this._esc(q.question)}</h3>
                ${(q.options || []).map((o, j) =>
                    `<div class="print-option">${letters[j]}. ${this._esc(o)}</div>`
                ).join('')}
                <div class="print-answer">Answer: ${letters[q.correct]}. ${this._esc((q.options || [])[q.correct] || '')} — ${this._esc(q.explanation || '')}</div>
            </div>`;
        });

        html += `<div style="page-break-before:always"></div>
            <h2 style="font-size:15px;margin:20px 0 16px;color:#333">Flashcards</h2>`;

        (this.data.flashcards || []).forEach(fc => {
            html += `<div class="print-flashcard">
                <strong>${this._esc(fc.term)}</strong><br>
                <span style="color:#444">${this._esc(fc.definition)}</span>
            </div>`;
        });

        html += '</div>';

        const win = window.open('', '_blank');
        win.document.write(`<!DOCTYPE html><html><head><title>${this._esc(this.data.title || 'Assessment')}</title>
            <link rel="stylesheet" href="${APP_PREFIX}/static/css/assessment.css">
            </head><body>${html}</body></html>`);
        win.document.close();
        win.onload = () => win.print();
    }

    /* ── Utility ─────────────────────────────────────────────────── */
    _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

// Initialise globally
const assessmentUI = new AssessmentUI();
window.assessmentUI = assessmentUI;
