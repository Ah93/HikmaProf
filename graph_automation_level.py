import matplotlib
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

matplotlib.use('Agg')
matplotlib.rcParams.update({'font.family': 'DejaVu Sans'})

STAGES = [
    'Verification & QA',
    'Feedback Generation',
    'Grading & Evaluation',
    'Assessment Creation',
    'AI Tutoring',
    'Content Generation',
    'Instructional Planning',
]

# Each stage: [Fully Automated, Partially Automated, Requires Human]
DATA = [
    [0.30, 0.40, 0.30],  # Verification & QA
    [0.60, 0.30, 0.10],  # Feedback Generation
    [0.50, 0.30, 0.20],  # Grading & Evaluation
    [0.70, 0.20, 0.10],  # Assessment Creation
    [0.75, 0.20, 0.05],  # AI Tutoring
    [0.80, 0.15, 0.05],  # Content Generation
    [0.40, 0.35, 0.25],  # Instructional Planning
]

COLORS = ['#4CAF50', '#FFC107', '#EF5350']
LABELS = ['Fully Automated', 'Partially Automated', 'Requires Human Oversight']

fig, ax = plt.subplots(figsize=(10, 5.5))
y = np.arange(len(STAGES))
bar_h = 0.52

left = np.zeros(len(STAGES))
for i, (color, label) in enumerate(zip(COLORS, LABELS)):
    vals = [DATA[s][i] for s in range(len(STAGES))]
    bars = ax.barh(y, vals, left=left, height=bar_h,
                   color=color, edgecolor='white', linewidth=0.8,
                   label=label, zorder=3)
    for xi, (v, b) in enumerate(zip(vals, left)):
        if v >= 0.12:
            ax.text(b + v / 2, y[xi], f'{int(v*100)}%',
                    ha='center', va='center', fontsize=9,
                    color='white', fontweight='bold')
    left += np.array(vals)

ax.set_yticks(y)
ax.set_yticklabels(STAGES, fontsize=11.5)
ax.tick_params(axis='y', length=0, pad=8)
ax.set_xlabel('Proportion of Task Handling', fontsize=11, labelpad=8)
ax.set_xlim(0, 1.0)
ax.set_xticks([0, 0.25, 0.5, 0.75, 1.0])
ax.set_xticklabels(['0%', '25%', '50%', '75%', '100%'], fontsize=10)
ax.axvline(1.0, color='#CCCCCC', linewidth=0.8, linestyle=':')
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_visible(False)
ax.grid(axis='x', alpha=0.25, linestyle='--', linewidth=0.6)

ax.set_title('Workflow Automation Level by Stage\nin the HikmaProf Multi-Agent Architecture',
             fontsize=12.5, fontweight='bold', pad=14)

ax.legend(handles=[mpatches.Patch(color=c, label=l) for c, l in zip(COLORS, LABELS)],
          loc='lower right', bbox_to_anchor=(1.0, -0.22),
          ncol=3, fontsize=9.5, framealpha=0.0, handlelength=1.4)

fig.tight_layout(rect=[0, 0.08, 1, 1])
fig.savefig('graph_automation_level.pdf', dpi=300, bbox_inches='tight')
fig.savefig('graph_automation_level.png', dpi=300, bbox_inches='tight')
print('Saved → graph_automation_level.pdf / .png')
