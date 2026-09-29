"""
Graph 3 — Feature exclusivity: how many platforms support each feature (out of 7).
Data source: Table 4, HikmaProf IEEE Access paper.

Shows WHERE HikmaProf's contribution lies:
  - Features at 1/7 → exclusive to HikmaProf
  - Features at 6-7/7 → commodity (all platforms offer them)
  - Stacked bar: dark = full support (✓), light = partial support (~)
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
    'axes.spines.bottom': False,
    'axes.grid': True,
    'axes.grid.axis': 'x',
    'grid.alpha': 0.25,
    'grid.linestyle': '--',
    'grid.linewidth': 0.6,
})

# ── Data (sorted descending by full-support count) ───────────────────────────
# (feature label, full_count, partial_count)
FEATURES = [
    ('Auto Slide Generation',          7, 0),
    ('Multilingual Slides',            7, 0),
    ('Template & Customization',       6, 0),
    ('Slide Editing Post-Gen',         6, 0),
    ('Quiz Generation',                3, 2),
    ('Multi-speaker Podcast',          1, 1),
    ('Slide-to-Video (No Avatar)',     1, 0),
    ('Slide-to-Video (AI Avatar)',     1, 0),
    ('Voice Cloning',                  1, 0),
    ('Personal Avatar',                1, 0),
]

N_PLATFORMS = 7

labels   = [f[0] for f in FEATURES]
full_ct  = np.array([f[1] for f in FEATURES], dtype=float)
part_ct  = np.array([f[2] for f in FEATURES], dtype=float)

# ── Colour per tier ───────────────────────────────────────────────────────────
def bar_color(full, partial):
    total = full + partial * 0.5
    if total >= 6:   return '#78909C'   # grey-blue  — commodity
    if total >= 2:   return '#FFA726'   # amber      — partial adoption
    return '#1a56db'                    # blue       — HikmaProf exclusive

FULL_COLORS = [bar_color(f, p) for f, p in zip(full_ct, part_ct)]
PART_COLOR  = '#FFCC80'   # light amber for partial extension

# ── Plot ─────────────────────────────────────────────────────────────────────
y = np.arange(len(labels))
fig, ax = plt.subplots(figsize=(10, 6.5))
bar_h = 0.55

# Full-support bars
bars_full = ax.barh(y, full_ct, height=bar_h,
                    color=FULL_COLORS, edgecolor='white', linewidth=0.8, zorder=3)

# Partial-support extension (stacked on top of full)
bars_part = ax.barh(y, part_ct, left=full_ct, height=bar_h,
                    color=PART_COLOR, edgecolor='white', linewidth=0.8,
                    hatch='///', zorder=3, label='Partial support (~)')

# ── Annotations ───────────────────────────────────────────────────────────────
for i, (fc, pc) in enumerate(zip(full_ct, part_ct)):
    total = fc + pc
    # Count label at bar end
    ax.text(total + 0.08, y[i],
            f'{int(fc)}/{N_PLATFORMS}' + (f' (+{int(pc)}~)' if pc > 0 else ''),
            va='center', ha='left', fontsize=9, color='#333333')

    # "HikmaProf Only" tag for exclusive features (full=1, partial=0)
    if fc == 1 and pc == 0:
        ax.text(0.12, y[i], 'HikmaProf Only',
                va='center', ha='left', fontsize=8,
                color='white', fontweight='bold', zorder=5)

# ── Reference line at 7 (all platforms) ──────────────────────────────────────
ax.axvline(N_PLATFORMS, color='#AAAAAA', linewidth=1.0, linestyle=':', zorder=1)
ax.text(N_PLATFORMS + 0.08, len(labels) - 0.15, 'All 7\nplatforms',
        fontsize=7.5, color='#888888', va='top')

# ── Background bands to group tiers ──────────────────────────────────────────
# Commodity band (rows 0-3): light grey
ax.axhspan(3.5, len(labels) - 0.5, color='#F5F5F5', zorder=0)
# Exclusive band (rows 5-9): very light blue
ax.axhspan(-0.5, 4.5, color='#EEF3FF', zorder=0)

# Tier labels on the right margin
ax.text(N_PLATFORMS + 1.55, 5.5, 'COMMODITY\nFEATURES',
        fontsize=7.5, color='#78909C', fontweight='bold',
        ha='center', va='center', rotation=90)
ax.text(N_PLATFORMS + 1.55, 2.0, 'EXCLUSIVE /\nLIMITED',
        fontsize=7.5, color='#1a56db', fontweight='bold',
        ha='center', va='center', rotation=90)

# ── Axes ─────────────────────────────────────────────────────────────────────
ax.set_yticks(y)
ax.set_yticklabels(labels, fontsize=10.5)
ax.tick_params(axis='y', length=0, pad=8)
ax.set_xlabel('Number of Platforms Supporting Feature  (out of 7)', fontsize=10.5, labelpad=8)
ax.set_xlim(0, N_PLATFORMS + 2.2)
ax.set_xticks(range(0, N_PLATFORMS + 1))
ax.spines['left'].set_visible(False)

ax.set_title(
    'Feature Exclusivity: How Many Platforms Support Each Capability',
    fontsize=12, fontweight='bold', pad=14, color='#111111',
)

# ── Legend ────────────────────────────────────────────────────────────────────
legend_handles = [
    mpatches.Patch(color='#78909C', label='Commodity (6–7 platforms)'),
    mpatches.Patch(color='#FFA726', label='Limited adoption (2–5 platforms)'),
    mpatches.Patch(color='#1a56db', label='HikmaProf exclusive (1 platform)'),
    mpatches.Patch(facecolor=PART_COLOR, hatch='///', edgecolor='#cccccc',
                   label='Partial support only (~)'),
]
ax.legend(handles=legend_handles, loc='lower right',
          fontsize=9, framealpha=0.93, edgecolor='#cccccc',
          bbox_to_anchor=(1.0, 0.01))

fig.tight_layout()
fig.savefig('graph3_exclusivity.pdf', dpi=300, bbox_inches='tight')
fig.savefig('graph3_exclusivity.png', dpi=300, bbox_inches='tight')
print('Saved → graph3_exclusivity.pdf / .png')
