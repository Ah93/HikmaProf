"""
Option 3 — Grouped bar: Score by feature category per platform.
Three feature groups: Slide Authoring / Video & Avatar / Interactive & Audio.
Y-axis shows percentage coverage within each category (0–100%).
Data source: Table 4, HikmaProf IEEE Access paper.

Category breakdown:
  Slide Authoring   (4 features): auto slide gen, template, multilingual, slide editing
  Video & Avatar    (4 features): video no avatar, video AI avatar, voice cloning, personal avatar
  Interactive&Audio (2 features): quiz generation, multi-speaker podcast
"""

import matplotlib
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

matplotlib.use('Agg')
matplotlib.rcParams.update({
    'font.family': 'DejaVu Sans',
    'axes.spines.top': False,
    'axes.spines.right': False,
    'axes.grid': True,
    'axes.grid.axis': 'y',
    'grid.alpha': 0.3,
    'grid.linestyle': '--',
    'grid.linewidth': 0.6,
})

# ── Platform colours ──────────────────────────────────────────────────────────
PLATFORMS = ['Beautiful.ai', 'Gamma', 'Presentations.AI',
             'Canva AI', 'Kimi Slides', 'NotebookLM', 'HikmaProf']

COLORS = {
    'Beautiful.ai':     '#78909C',
    'Gamma':            '#FFA726',
    'Presentations.AI': '#AB47BC',
    'Canva AI':         '#26A69A',
    'Kimi Slides':      '#EC407A',
    'NotebookLM':       '#42A5F5',
    'HikmaProf':        '#1a56db',
}

# ── Scores as % of each category maximum ─────────────────────────────────────
# score = (full_count + 0.5 × partial_count) / category_max × 100

# Slide Authoring (max=4): features 1-4
# Beautiful.ai: 4✓ → 100%, Gamma: 4✓ → 100%, Pres.AI: 4✓ → 100%
# Canva AI: 4✓ → 100%, Kimi: 4✓ → 100%
# NotebookLM: auto✓ template✗ multilingual✓ editing✗ → 2/4 = 50%
# HikmaProf: 4✓ → 100%
SLIDE_AUTHORING = [100, 100, 100, 100, 100, 50, 100]

# Video & Avatar (max=4): features 5-8
# Only HikmaProf supports all; all others = 0
VIDEO_AVATAR = [0, 0, 0, 0, 0, 0, 100]

# Interactive & Audio (max=2): quiz + podcast
# Beautiful.ai: 0+0 = 0%
# Gamma: 0.5+0 = 0.5/2 = 25%
# Presentations.AI: 0+0 = 0%
# Canva AI: 1+0 = 50%
# Kimi Slides: 0.5+0 = 25%
# NotebookLM: 1+0.5 = 1.5/2 = 75%
# HikmaProf: 1+1 = 100%
INTERACTIVE_AUDIO = [0, 25, 0, 50, 25, 75, 100]

CATEGORIES    = ['Slide Authoring\n(4 features)', 'Video & Avatar\n(4 features)', 'Interactive & Audio\n(2 features)']
CATEGORY_DATA = [SLIDE_AUTHORING, VIDEO_AVATAR, INTERACTIVE_AUDIO]

N_PLATFORMS  = len(PLATFORMS)
N_CATEGORIES = len(CATEGORIES)
BAR_W        = 0.10
GROUP_GAP    = 0.25   # gap between groups
offsets      = np.linspace(-(N_PLATFORMS - 1) / 2, (N_PLATFORMS - 1) / 2, N_PLATFORMS) * BAR_W

x_centers = np.arange(N_CATEGORIES, dtype=float) * (N_PLATFORMS * BAR_W + GROUP_GAP)

# ── Figure ────────────────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(11, 5.8))

for pi, platform in enumerate(PLATFORMS):
    scores = [CATEGORY_DATA[ci][pi] for ci in range(N_CATEGORIES)]
    x_pos  = x_centers + offsets[pi]
    lw     = 1.8 if platform == 'HikmaProf' else 0.6
    ec     = '#1a56db' if platform == 'HikmaProf' else 'white'
    bars   = ax.bar(x_pos, scores,
                    width=BAR_W,
                    color=COLORS[platform],
                    edgecolor=ec,
                    linewidth=lw,
                    label=platform,
                    zorder=3,
                    alpha=0.92 if platform != 'HikmaProf' else 1.0,
                    )

# ── HikmaProf value labels only (avoids crowding) ────────────────────────────
hikma_i = PLATFORMS.index('HikmaProf')
for ci in range(N_CATEGORIES):
    val   = CATEGORY_DATA[ci][hikma_i]
    x_pos = x_centers[ci] + offsets[hikma_i]
    ax.text(x_pos, val + 1.5, f'{int(val)}%',
            ha='center', va='bottom', fontsize=8.5,
            color='#1a56db', fontweight='bold')

# ── Axes ──────────────────────────────────────────────────────────────────────
ax.set_xticks(x_centers)
ax.set_xticklabels(CATEGORIES, fontsize=11, linespacing=1.4)
ax.tick_params(axis='x', length=0, pad=10)
ax.tick_params(axis='y', labelsize=9.5)
ax.set_ylabel('Category Coverage  (%)', fontsize=10.5, labelpad=8)
ax.set_ylim(0, 115)
ax.set_yticks(range(0, 101, 25))
ax.set_yticklabels(['0%', '25%', '50%', '75%', '100%'])
ax.spines['left'].set_linewidth(0.6)
ax.spines['bottom'].set_linewidth(0.6)

# Reference line at 100%
ax.axhline(100, color='#BBBBBB', linewidth=0.8, linestyle=':', zorder=1)
ax.text(x_centers[-1] + N_PLATFORMS * BAR_W / 2 + 0.02,
        101, '100%', fontsize=8, color='#AAAAAA', va='bottom')

ax.set_title(
    'Platform Coverage by Feature Category',
    fontsize=12, fontweight='bold', pad=14,
)

# ── Legend (two rows below chart) ────────────────────────────────────────────
handles = [
    mpatches.Patch(color=COLORS[p],
                   label=p,
                   linewidth=2.0 if p == 'HikmaProf' else 0.6)
    for p in PLATFORMS
]
ax.legend(handles=handles,
          loc='upper left',
          bbox_to_anchor=(0.0, -0.18),
          ncol=4,
          fontsize=9,
          framealpha=0.0,
          handlelength=1.2,
          columnspacing=1.0)

fig.tight_layout(rect=[0, 0.12, 1, 1])
fig.savefig('graph_option3_category.pdf', dpi=300, bbox_inches='tight')
fig.savefig('graph_option3_category.png', dpi=300, bbox_inches='tight')
print('Saved → graph_option3_category.pdf / .png')
