"""
Option 1 — Stacked horizontal bar: Capability score per platform.
Each bar = 10 features total; split into full (✓), partial (~), not supported (✗).
Data source: Table 4, HikmaProf IEEE Access paper.
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
    'axes.spines.left': False,
    'axes.grid': True,
    'axes.grid.axis': 'x',
    'grid.alpha': 0.25,
    'grid.linestyle': '--',
    'grid.linewidth': 0.7,
})

PLATFORMS = [
    'NotebookLM',
    'Beautiful.ai',
    'Presentations.AI',
    'Kimi Slides',
    'Gamma',
    'Canva AI',
    'HikmaProf',
]
FULL    = np.array([3, 4, 4, 4, 4,  5, 10], dtype=float)
PARTIAL = np.array([1, 0, 0, 1, 1,  0,  0], dtype=float)
NONE    = np.array([6, 6, 6, 5, 5,  5,  0], dtype=float)

TOTAL_FEATURES = 10

COLORS = {
    'full':    '#4CAF50',
    'partial': '#FFC107',
    'none':    '#FFCDD2',
}

fig, ax = plt.subplots(figsize=(12, 6.5))
y     = np.arange(len(PLATFORMS))
bar_h = 0.58

ax.barh(y, NONE,    left=FULL + PARTIAL, height=bar_h,
        color=COLORS['none'],    edgecolor='white', linewidth=0.8, zorder=3)
ax.barh(y, PARTIAL, left=FULL,           height=bar_h,
        color=COLORS['partial'], edgecolor='white', linewidth=0.8, zorder=3)
ax.barh(y, FULL,                         height=bar_h,
        color=COLORS['full'],    edgecolor='white', linewidth=0.8, zorder=3)

# Segment labels — only when wide enough
for i, (f, p, n) in enumerate(zip(FULL, PARTIAL, NONE)):
    if f >= 1.5:
        ax.text(f / 2, y[i], f'{int(f)}',
                ha='center', va='center', fontsize=10.5,
                color='white', fontweight='bold', zorder=4)
    if p >= 1.0:
        ax.text(f + p / 2, y[i], f'{int(p)}~',
                ha='center', va='center', fontsize=9.5,
                color='#5D4037', fontweight='bold', zorder=4)
    if n >= 1.5:
        ax.text(f + p + n / 2, y[i], f'{int(n)}',
                ha='center', va='center', fontsize=10.5,
                color='#C62828', fontweight='bold', zorder=4)

# Score label at bar end
for i, (f, p) in enumerate(zip(FULL, PARTIAL)):
    score = f + 0.5 * p
    ax.text(TOTAL_FEATURES + 0.25, y[i], f'{score:.1f} / 10',
            va='center', ha='left', fontsize=10.5,
            color='#1a56db' if PLATFORMS[i] == 'HikmaProf' else '#333333',
            fontweight='bold' if PLATFORMS[i] == 'HikmaProf' else 'normal')

# HikmaProf highlight border
hikma_i = PLATFORMS.index('HikmaProf')
ax.barh(hikma_i, TOTAL_FEATURES, height=bar_h + 0.08,
        color='none', edgecolor='#1a56db', linewidth=2.4, zorder=5)

# Axes
ax.set_yticks(y)
ax.set_yticklabels(PLATFORMS, fontsize=12.5)
for label in ax.get_yticklabels():
    if label.get_text() == 'HikmaProf':
        label.set_fontweight('bold')
        label.set_color('#1a56db')

ax.tick_params(axis='y', length=0, pad=10)
ax.set_xlabel('Number of Features Supported  (out of 10)', fontsize=11.5, labelpad=10)
ax.set_xlim(0, TOTAL_FEATURES + 2.8)
ax.set_xticks(range(0, TOTAL_FEATURES + 1))
ax.tick_params(axis='x', labelsize=10.5)
ax.spines['left'].set_visible(False)

ax.set_title(
    'Platform Capability Score: Feature Support Breakdown',
    fontsize=13.5, fontweight='bold', pad=16,
)

legend_handles = [
    mpatches.Patch(color=COLORS['full'],    label='Fully Supported  (✓)'),
    mpatches.Patch(color=COLORS['partial'], label='Partial Support  (~)'),
    mpatches.Patch(color=COLORS['none'],    label='Not Supported  (✗)'),
]
ax.legend(handles=legend_handles, loc='lower left',
          bbox_to_anchor=(0.0, -0.20), ncol=3,
          fontsize=10.5, framealpha=0.0, handlelength=1.5, columnspacing=1.5)

fig.tight_layout(rect=[0, 0.07, 1, 1])
fig.savefig('graph_option1_capability.pdf', dpi=300, bbox_inches='tight')
fig.savefig('graph_option1_capability.png', dpi=300, bbox_inches='tight')
print('Saved → graph_option1_capability.pdf / .png')
