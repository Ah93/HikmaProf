"""
Graph 3 — Radar chart: feature coverage across platforms.
Data source: Table 4 (commercial tools comparison), HikmaProf IEEE Access paper.

Encoding:  1.0 = fully supported (✓)
           0.5 = partial / via general prompt / external dependency (~)
           0.0 = not supported (×)
"""

import matplotlib
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

matplotlib.use('Agg')
matplotlib.rcParams.update({'font.family': 'DejaVu Sans'})

# ── Feature axes (10) — in radar order ──────────────────────────────────────
FEATURES = [
    'Auto Slide\nGeneration',
    'Template &\nCustomization',
    'Multilingual\nSlides',
    'Slide Editing\nPost-Gen',
    'Slide-to-Video\n(No Avatar)',
    'Slide-to-Video\n(AI Avatar)',
    'Voice\nCloning',
    'Personal\nAvatar',
    'Quiz\nGeneration',
    'Multi-speaker\nPodcast',
]

# ── Platform scores (same order as FEATURES) ─────────────────────────────────
# Footnoted × entries remain 0.0; ~ entries = 0.5
PLATFORM_DATA = {
    'Beautiful.ai':      [1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    'Gamma':             [1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0],
    'Presentations.AI':  [1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    'Canva AI':          [1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
    'Kimi Slides':       [1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0],
    'NotebookLM':        [1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.5],
    'HikmaProf':         [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
}

# ── Visual style ─────────────────────────────────────────────────────────────
STYLE = {
    'Beautiful.ai':     dict(color='#E07B54', lw=1.3, ls='--',         alpha=0.75),
    'Gamma':            dict(color='#F0C040', lw=1.3, ls='-.',         alpha=0.75),
    'Presentations.AI': dict(color='#9B8EC4', lw=1.3, ls=(0,(4,2)),   alpha=0.75),
    'Canva AI':         dict(color='#4BB3A2', lw=1.3, ls=':',         alpha=0.75),
    'Kimi Slides':      dict(color='#A0C878', lw=1.3, ls=(0,(2,2,4,2)), alpha=0.75),
    'NotebookLM':       dict(color='#E07BB5', lw=1.3, ls='--',        alpha=0.75),
    'HikmaProf':        dict(color='#2563EB', lw=2.8, ls='-',         alpha=1.00),
}

# ── Angles ───────────────────────────────────────────────────────────────────
N      = len(FEATURES)
angles = np.linspace(0, 2 * np.pi, N, endpoint=False).tolist()
angles += angles[:1]

# ── Plot ─────────────────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(9, 9), subplot_kw=dict(polar=True))

for name, scores in PLATFORM_DATA.items():
    vals = scores + scores[:1]
    s    = STYLE[name]
    ax.plot(angles, vals,
            lw=s['lw'], ls=s['ls'], color=s['color'], alpha=s['alpha'],
            zorder=10 if name == 'HikmaProf' else 3,
            label=name)
    ax.fill(angles, vals,
            color=s['color'],
            alpha=0.18 if name == 'HikmaProf' else 0.05,
            zorder=10 if name == 'HikmaProf' else 2)

# ── Grid & rings ─────────────────────────────────────────────────────────────
ax.set_ylim(0, 1.0)
ax.set_yticks([0.25, 0.5, 0.75, 1.0])
ax.set_yticklabels(['', 'Partial', '', 'Full'], fontsize=8, color='#777777')
ax.set_rlabel_position(12)

# Shaded band at 0.5 (partial support zone)
ring_a = np.linspace(0, 2 * np.pi, 300)
ax.fill_between(ring_a, 0.44, 0.56, color='#EEEEEE', alpha=0.55, zorder=0)

ax.grid(color='#CCCCCC', linewidth=0.55, linestyle='-')
ax.spines['polar'].set_color('#BBBBBB')
ax.spines['polar'].set_linewidth(0.8)

# ── Feature labels ───────────────────────────────────────────────────────────
ax.set_xticks(angles[:-1])
ax.set_xticklabels(FEATURES, fontsize=9, color='#1a1a1a', linespacing=1.3)
ax.tick_params(axis='x', pad=16)

# ── Legend ───────────────────────────────────────────────────────────────────
handles = [
    mpatches.Patch(
        facecolor='none',
        edgecolor=STYLE[n]['color'],
        linewidth=STYLE[n]['lw'],
        label=n,
        alpha=STYLE[n]['alpha'],
    )
    for n in PLATFORM_DATA
]
ax.legend(
    handles=handles,
    loc='upper left',
    bbox_to_anchor=(-0.32, 1.22),
    ncol=1,
    fontsize=9,
    framealpha=0.93,
    edgecolor='#cccccc',
    title='Platform',
    title_fontsize=9.5,
)

ax.set_title(
    'Feature Coverage Across AI Presentation & Podcast Platforms',
    fontsize=11.5, fontweight='bold', pad=30, color='#111111',
)

fig.text(
    0.5, -0.02,
    '1.0 = Fully Supported  ·  0.5 = Partial / External Dependency  ·  0.0 = Not Supported',
    ha='center', fontsize=8.5, color='#666666', style='italic',
)

fig.tight_layout()
fig.savefig('graph3_radar_features.pdf', dpi=300, bbox_inches='tight')
fig.savefig('graph3_radar_features.png', dpi=300, bbox_inches='tight')
print('Saved → graph3_radar_features.pdf / .png')
