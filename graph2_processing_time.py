"""
Graph 2 — Per-stage processing time: video pipeline modes + podcast generation.
Data source:
  - Table 2 (video stage times) + Table 3 (video end-to-end totals)
  - Table 4 (podcast end-to-end totals: 2 speakers, 15 pages)
"""

import matplotlib
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import matplotlib.patches as mpatches
from matplotlib.lines import Line2D
import numpy as np

matplotlib.use('Agg')
matplotlib.rcParams.update({
    'font.family': 'DejaVu Sans',
    'axes.spines.top': False,
    'axes.spines.right': False,
    'axes.spines.left': False,
    'axes.grid': True,
    'axes.grid.axis': 'x',
    'grid.alpha': 0.3,
    'grid.linestyle': '--',
    'grid.linewidth': 0.7,
})

# ── Video pipeline data (seconds) ────────────────────────────────────────────
VIDEO_STAGES = [
    'System Overhead / Export',
    'Video Finalisation',
    'Avatar Compositing',
    'TTS / Voice Synthesis',
    'PPTX Rendering',
    'AI Content Gen (DeepSeek)',
    'PDF Parsing',
]
VIDEO_DATA = {
    'System Overhead / Export':  [111, 111, 111],
    'Video Finalisation':        [ 15,  15,  15],
    'Avatar Compositing':        [  0, 180, 180],
    'TTS / Voice Synthesis':     [ 30,  30, 330],
    'PPTX Rendering':            [  3,   3,   3],
    'AI Content Gen (DeepSeek)': [ 18,  18,  18],
    'PDF Parsing':               [  3,   3,   3],
}
VIDEO_MODES  = ['Narration Only', 'AI Avatar\n(Edge TTS)', 'Voice Cloning\n(XTTS v2)']
VIDEO_TOTALS = [180, 360, 660]

# ── Podcast data (seconds) ───────────────────────────────────────────────────
PODCAST_TOTALS_S = [96.72, 219.80, 247.54]
PODCAST_LABELS   = ['Podcast — 20 min', 'Podcast — 40 min', 'Podcast — 60 min']

PODCAST_STAGES = [
    'Audio Mix + Export',
    'TTS Multi-speaker (Edge TTS)',
    'AI Script Gen (DeepSeek)',
    'PDF Parsing',
]
_script_gen = [15, 28, 38]
_fixed      = 3
_audio_mix  = 14
_tts = [round(t - _fixed - g - _audio_mix, 2)
        for t, g in zip(PODCAST_TOTALS_S, _script_gen)]
PODCAST_DATA = {
    'Audio Mix + Export':           [_audio_mix] * 3,
    'TTS Multi-speaker (Edge TTS)': _tts,
    'AI Script Gen (DeepSeek)':     _script_gen,
    'PDF Parsing':                  [_fixed] * 3,
}

# ── Colours ──────────────────────────────────────────────────────────────────
VIDEO_COLORS = {
    'PDF Parsing':               '#B0C4DE',
    'AI Content Gen (DeepSeek)': '#5B9BD5',
    'PPTX Rendering':            '#A8D5BA',
    'TTS / Voice Synthesis':     '#F4845F',
    'Avatar Compositing':        '#9B59B6',
    'Video Finalisation':        '#48C9B0',
    'System Overhead / Export':  '#D5D8DC',
}
PODCAST_COLORS = {
    'PDF Parsing':                  '#B0C4DE',
    'AI Script Gen (DeepSeek)':     '#5B9BD5',
    'TTS Multi-speaker (Edge TTS)': '#E8954A',
    'Audio Mix + Export':           '#74B9A0',
}

# ── Layout ───────────────────────────────────────────────────────────────────
n_video   = len(VIDEO_MODES)
n_podcast = len(PODCAST_LABELS)
SPACING   = 1.9    # gap between bars within a group
GAP       = 2.6    # extra gap between video and podcast groups

y_video   = np.arange(n_video,   dtype=float) * SPACING
y_podcast = np.arange(n_podcast, dtype=float) * SPACING + n_video * SPACING + GAP

all_y      = np.concatenate([y_video, y_podcast])
all_labels = VIDEO_MODES + PODCAST_LABELS

fig, ax = plt.subplots(figsize=(13, 10.5))
bar_h = 0.65

# ── Video bars ───────────────────────────────────────────────────────────────
cumulative = np.zeros(n_video)
for stage in reversed(VIDEO_STAGES):
    vals = np.array(VIDEO_DATA[stage], dtype=float)
    ax.barh(y_video, vals, left=cumulative, height=bar_h,
            color=VIDEO_COLORS[stage], edgecolor='white', linewidth=0.7, zorder=3)
    for xi, (v, b) in enumerate(zip(vals, cumulative)):
        if v >= 20:
            ax.text(b + v / 2, y_video[xi], f'{v:.0f}s',
                    ha='center', va='center', fontsize=8.5,
                    color='white', fontweight='bold')
    cumulative += vals

# Total labels
for xi, total in enumerate(VIDEO_TOTALS):
    mins = total // 60
    secs = total % 60
    lbl  = f'~{mins} min' if secs == 0 else f'~{mins} min {secs}s'
    ax.text(total + 14, y_video[xi], f'{lbl}  ({total}s)',
            va='center', fontsize=9.5, color='#111111', fontweight='bold')

# ── Podcast bars ─────────────────────────────────────────────────────────────
cumulative_p = np.zeros(n_podcast)
for stage in reversed(PODCAST_STAGES):
    vals = np.array(PODCAST_DATA[stage], dtype=float)
    ax.barh(y_podcast, vals, left=cumulative_p, height=bar_h,
            color=PODCAST_COLORS[stage], edgecolor='white', linewidth=0.7, zorder=3)
    for xi, (v, b) in enumerate(zip(vals, cumulative_p)):
        if v >= 15:
            ax.text(b + v / 2, y_podcast[xi], f'{v:.0f}s',
                    ha='center', va='center', fontsize=8.5,
                    color='white', fontweight='bold')
    cumulative_p += vals

# Total labels
for xi, total in enumerate(PODCAST_TOTALS_S):
    mins = int(total) // 60
    secs = total % 60
    ax.text(total + 14, y_podcast[xi], f'~{mins} min {secs:.0f}s  ({total:.0f}s)',
            va='center', fontsize=9.5, color='#111111', fontweight='bold')

# ── Separator ────────────────────────────────────────────────────────────────
sep_y = (y_video[-1] + y_podcast[0]) / 2
ax.axhline(sep_y, color='#BBBBBB', linewidth=1.2, linestyle='--', zorder=1)

# Section labels — above the top bar of each group
ax.annotate('VIDEO PIPELINE',
            xy=(0, y_video[-1] + 0.70),
            fontsize=9.5, color='#2563EB', fontweight='bold', va='bottom')
ax.annotate('PODCAST PIPELINE',
            xy=(0, y_podcast[-1] + 0.70),
            fontsize=9.5, color='#059669', fontweight='bold', va='bottom')

# ── Axes ─────────────────────────────────────────────────────────────────────
ax.set_yticks(all_y)
ax.set_yticklabels(all_labels, fontsize=11.5)
ax.tick_params(axis='y', length=0, pad=10)
ax.set_xlabel('Processing Time (seconds)', fontsize=11.5, labelpad=10)
ax.set_xlim(0, 920)
ax.xaxis.set_major_locator(ticker.MultipleLocator(60))
ax.xaxis.set_minor_locator(ticker.MultipleLocator(30))
ax.tick_params(axis='x', labelsize=10)

ax2 = ax.twiny()
ax2.set_xlim(ax.get_xlim())
ax2.set_xlabel('Processing Time (minutes)', fontsize=10.5, labelpad=8)
ax2.xaxis.set_major_locator(ticker.MultipleLocator(60))
ax2.xaxis.set_major_formatter(
    ticker.FuncFormatter(lambda v, _: f'{v/60:.0f}' if v >= 0 else ''))
ax2.tick_params(axis='x', labelsize=10)
ax2.spines['top'].set_color('#CCCCCC')

ax.set_title(
    'Per-Stage Processing Time: Video & Podcast Pipelines\n'
    '(15 Document Pages, 2 Speakers for Podcast)',
    fontsize=12.5, fontweight='bold', pad=18,
)

# ── Legend ───────────────────────────────────────────────────────────────────
video_patches = [
    mpatches.Patch(color=VIDEO_COLORS[s], label=s)
    for s in reversed(VIDEO_STAGES)
]
podcast_patches = [
    mpatches.Patch(color=PODCAST_COLORS[s], label=s)
    for s in reversed(PODCAST_STAGES)
    if s != 'PDF Parsing'
]
sep_handle = Line2D([0], [0], color='none', label='── Podcast stages ──')

ax.legend(
    handles=video_patches + [sep_handle] + podcast_patches,
    loc='lower right',
    fontsize=9,
    framealpha=0.93,
    edgecolor='#cccccc',
    title='Pipeline Stage',
    title_fontsize=9.5,
    ncol=1,
    bbox_to_anchor=(1.0, 0.01),
)

fig.text(
    0.01, -0.02,
    '* Avatar Compositing = 0 s for Narration Only.  '
    'Podcast stage times estimated from end-to-end totals and implementation knowledge.',
    fontsize=8, color='#666666', style='italic',
)

fig.tight_layout(rect=[0, 0.03, 1, 1])
fig.savefig('graph2_processing_time.pdf', dpi=300, bbox_inches='tight')
fig.savefig('graph2_processing_time.png', dpi=300, bbox_inches='tight')
print('Saved → graph2_processing_time.pdf / .png')
