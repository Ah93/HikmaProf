"""
Graph 3 — Heatmap: feature coverage across platforms.
Data source: Table 4 (commercial tools comparison), HikmaProf IEEE Access paper.

Encoding:  1.0 = fully supported  (✓)  → green
           0.5 = partial / external     → amber
           0.0 = not supported    (✗)  → red
"""

import matplotlib
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import matplotlib.patches as mpatches
import numpy as np
import seaborn as sns

matplotlib.use('Agg')
matplotlib.rcParams.update({'font.family': 'DejaVu Sans'})

# ── Labels ───────────────────────────────────────────────────────────────────
FEATURES = [
    'Auto Slide Generation',
    'Template & Customization',
    'Multilingual Slides',
    'Slide Editing Post-Gen',
    'Slide-to-Video (No Avatar)',
    'Slide-to-Video (AI Avatar)',
    'Voice Cloning',
    'Personal Avatar',
    'Quiz Generation',
    'Multi-speaker Podcast',
]

PLATFORMS = [
    'Beautiful.ai',
    'Gamma',
    'Presentations.AI',
    'Canva AI',
    'Kimi Slides',
    'NotebookLM',
    'HikmaProf',
]

# ── Data matrix: rows = features, cols = platforms ───────────────────────────
DATA = np.array([
    #  Beau   Gamma  Pres   Canva  Kimi   NLM    Hikma
    [  1.0,   1.0,   1.0,   1.0,   1.0,   1.0,   1.0  ],  # Auto Slide Gen
    [  1.0,   1.0,   1.0,   1.0,   1.0,   0.0,   1.0  ],  # Template & Custom
    [  1.0,   1.0,   1.0,   1.0,   1.0,   1.0,   1.0  ],  # Multilingual
    [  1.0,   1.0,   1.0,   1.0,   1.0,   0.0,   1.0  ],  # Slide Editing
    [  0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   1.0  ],  # Video (no avatar)
    [  0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   1.0  ],  # Video (AI avatar)
    [  0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   1.0  ],  # Voice Cloning
    [  0.0,   0.0,   0.0,   0.0,   0.0,   0.0,   1.0  ],  # Personal Avatar
    [  0.0,   0.5,   0.0,   1.0,   0.5,   1.0,   1.0  ],  # Quiz Generation
    [  0.0,   0.0,   0.0,   0.0,   0.0,   0.5,   1.0  ],  # Podcast
])

# ── Annotation symbols ────────────────────────────────────────────────────────
ANNOT = np.where(DATA == 1.0, '✓', np.where(DATA == 0.5, '~', '✗'))

# ── Discrete colormap: red / amber / green ────────────────────────────────────
cmap   = mcolors.ListedColormap(['#EF5350', '#FFC107', '#4CAF50'])
bounds = [-0.1, 0.25, 0.75, 1.1]
norm   = mcolors.BoundaryNorm(bounds, cmap.N)

# ── Figure ────────────────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(11, 7))

sns.heatmap(
    DATA,
    ax=ax,
    cmap=cmap,
    norm=norm,
    annot=ANNOT,
    fmt='',
    annot_kws={'size': 13, 'weight': 'bold', 'color': 'white'},
    linewidths=1.2,
    linecolor='white',
    cbar=False,
    xticklabels=PLATFORMS,
    yticklabels=FEATURES,
    square=True,
)

# ── Axis labels ───────────────────────────────────────────────────────────────
# X-axis — rotate platform names to avoid overlap
ax.set_xticklabels(
    PLATFORMS,
    rotation=30,
    ha='right',
    fontsize=10.5,
    fontweight='normal',
)

# Bold + blue for HikmaProf (last tick)
for label in ax.get_xticklabels():
    if label.get_text() == 'HikmaProf':
        label.set_fontweight('bold')
        label.set_color('#1a56db')

# Y-axis — horizontal, right-aligned
ax.set_yticklabels(
    FEATURES,
    rotation=0,
    ha='right',
    fontsize=10,
    va='center',
)
ax.tick_params(axis='both', length=0, pad=6)

# ── Highlight HikmaProf column with a border ──────────────────────────────────
hikma_col = PLATFORMS.index('HikmaProf')
rect = mpatches.FancyBboxPatch(
    (hikma_col + 0.04, 0.04),
    0.92, len(FEATURES) - 0.08,
    boxstyle='round,pad=0.02',
    linewidth=2.5,
    edgecolor='#1a56db',
    facecolor='none',
    transform=ax.transData,
    clip_on=False,
    zorder=5,
)
ax.add_patch(rect)

# ── Legend ────────────────────────────────────────────────────────────────────
legend_items = [
    mpatches.Patch(facecolor='#4CAF50', edgecolor='white', label='Fully Supported  ✓'),
    mpatches.Patch(facecolor='#FFC107', edgecolor='white', label='Partial / External Dependency  ~'),
    mpatches.Patch(facecolor='#EF5350', edgecolor='white', label='Not Supported  ✗'),
]
ax.legend(
    handles=legend_items,
    loc='upper left',
    bbox_to_anchor=(0, -0.22),
    ncol=3,
    fontsize=9.5,
    framealpha=0.0,
    handlelength=1.4,
    handleheight=1.0,
    borderpad=0.5,
)

# ── Title ─────────────────────────────────────────────────────────────────────
ax.set_title(
    'Feature Coverage Comparison Across AI Presentation & Podcast Platforms',
    fontsize=12, fontweight='bold', pad=16, color='#111111',
)

fig.tight_layout(rect=[0, 0.08, 1, 1])
fig.savefig('graph3_heatmap_features.pdf', dpi=300, bbox_inches='tight')
fig.savefig('graph3_heatmap_features.png', dpi=300, bbox_inches='tight')
print('Saved → graph3_heatmap_features.pdf / .png')
