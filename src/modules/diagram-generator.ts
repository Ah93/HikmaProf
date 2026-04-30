/**
 * Diagram Generation Module
 * Creates flow charts, process diagrams, and hierarchical diagrams
 */

import { ColorScheme } from '../config/templates';

export interface DiagramNode {
  id: string;
  label: string;
  type: 'rect' | 'roundRect' | 'ellipse' | 'diamond';
  color?: string;
  textColor?: string;
}

export interface DiagramConnection {
  from: string;
  to: string;
  label?: string;
  style?: 'solid' | 'dashed';
}

export interface DiagramLayout {
  type: 'horizontal' | 'vertical' | 'hierarchical' | 'circular';
  spacing?: number;
  startX?: number;
  startY?: number;
}

export interface DiagramDefinition {
  nodes: DiagramNode[];
  connections: DiagramConnection[];
  layout: DiagramLayout;
}

export class DiagramGenerator {
  private slide: any;
  private colorScheme: ColorScheme;
  private nodeWidth: number = 1.5;
  private nodeHeight: number = 0.75;

  constructor(slide: any, colorScheme: ColorScheme) {
    this.slide = slide;
    this.colorScheme = colorScheme;
  }

  /**
   * Generate a complete diagram on the slide
   */
  generate(diagram: DiagramDefinition): void {
    const positions = this.calculateNodePositions(diagram.nodes, diagram.layout);

    // Draw connections first (so they appear behind nodes)
    this.drawConnections(diagram.connections, positions);

    // Draw nodes on top
    this.drawNodes(diagram.nodes, positions);
  }

  /**
   * Calculate positions for all nodes based on layout type
   */
  private calculateNodePositions(nodes: DiagramNode[], layout: DiagramLayout): Map<string, {x: number, y: number}> {
    const positions = new Map<string, {x: number, y: number}>();
    const spacing = layout.spacing || 0.5;
    const startX = layout.startX || 1.5;
    const startY = layout.startY || 2.0;

    switch (layout.type) {
      case 'horizontal':
        nodes.forEach((node, index) => {
          positions.set(node.id, {
            x: startX + index * (this.nodeWidth + spacing),
            y: startY
          });
        });
        break;

      case 'vertical':
        nodes.forEach((node, index) => {
          positions.set(node.id, {
            x: startX,
            y: startY + index * (this.nodeHeight + spacing)
          });
        });
        break;

      case 'hierarchical':
        // Calculate tree layout (simplified)
        this.calculateHierarchicalLayout(nodes, positions, startX, startY, spacing);
        break;

      case 'circular':
        const centerX = startX + 2;
        const centerY = startY + 2;
        const radius = 2;
        nodes.forEach((node, index) => {
          const angle = (index / nodes.length) * 2 * Math.PI;
          positions.set(node.id, {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle)
          });
        });
        break;
    }

    return positions;
  }

  /**
   * Calculate hierarchical/tree layout
   */
  private calculateHierarchicalLayout(
    nodes: DiagramNode[],
    positions: Map<string, {x: number, y: number}>,
    startX: number,
    startY: number,
    spacing: number
  ): void {
    // Simple 2-level hierarchy for now
    const levels: DiagramNode[][] = [[], []];

    nodes.forEach((node, index) => {
      if (index === 0) {
        levels[0].push(node);
      } else {
        levels[1].push(node);
      }
    });

    // Position first level (top)
    if (levels[0].length > 0) {
      const topX = startX + (levels[1].length * (this.nodeWidth + spacing)) / 2 - this.nodeWidth / 2;
      positions.set(levels[0][0].id, { x: topX, y: startY });
    }

    // Position second level (bottom)
    levels[1].forEach((node, index) => {
      positions.set(node.id, {
        x: startX + index * (this.nodeWidth + spacing),
        y: startY + this.nodeHeight + spacing * 2
      });
    });
  }

  /**
   * Draw nodes on the slide
   */
  private drawNodes(nodes: DiagramNode[], positions: Map<string, {x: number, y: number}>): void {
    nodes.forEach(node => {
      const pos = positions.get(node.id);
      if (!pos) return;

      const fillColor = node.color || this.colorScheme.primary;
      const textColor = node.textColor || this.colorScheme.lightText;

      // Draw shape
      this.slide.addShape(node.type, {
        x: pos.x,
        y: pos.y,
        w: this.nodeWidth,
        h: this.nodeHeight,
        fill: { color: fillColor },
        line: { color: this.colorScheme.accent, width: 2 }
      });

      // Add text
      this.slide.addText(node.label, {
        x: pos.x,
        y: pos.y,
        w: this.nodeWidth,
        h: this.nodeHeight,
        fontSize: 14,
        bold: true,
        color: textColor,
        align: 'center',
        valign: 'middle'
      });
    });
  }

  /**
   * Draw connections between nodes
   */
  private drawConnections(connections: DiagramConnection[], positions: Map<string, {x: number, y: number}>): void {
    connections.forEach(conn => {
      const fromPos = positions.get(conn.from);
      const toPos = positions.get(conn.to);

      if (!fromPos || !toPos) return;

      // Calculate connection points (center of nodes)
      const fromX = fromPos.x + this.nodeWidth / 2;
      const fromY = fromPos.y + this.nodeHeight / 2;
      const toX = toPos.x + this.nodeWidth / 2;
      const toY = toPos.y + this.nodeHeight / 2;

      // Draw arrow line
      this.slide.addShape('line', {
        x: fromX,
        y: fromY,
        w: toX - fromX,
        h: toY - fromY,
        line: {
          color: this.colorScheme.accent,
          width: 2,
          dashType: conn.style === 'dashed' ? 'dash' : 'solid',
          endArrowType: 'triangle'
        }
      });

      // Add label if provided
      if (conn.label) {
        const labelX = (fromX + toX) / 2 - 0.5;
        const labelY = (fromY + toY) / 2 - 0.2;

        this.slide.addText(conn.label, {
          x: labelX,
          y: labelY,
          w: 1.0,
          h: 0.4,
          fontSize: 11,
          color: this.colorScheme.text,
          align: 'center',
          fill: { color: 'FFFFFF' }
        });
      }
    });
  }

  /**
   * Create a simple flow chart with boxes and arrows
   */
  static createFlowChart(slide: any, colorScheme: ColorScheme, steps: string[], startX: number = 1.5, startY: number = 2.0): void {
    const nodes: DiagramNode[] = steps.map((step, index) => ({
      id: `step-${index}`,
      label: step,
      type: 'roundRect' as const,
      color: index === 0 ? colorScheme.accent : index === steps.length - 1 ? colorScheme.secondary : colorScheme.primary
    }));

    const connections: DiagramConnection[] = [];
    for (let i = 0; i < steps.length - 1; i++) {
      connections.push({
        from: `step-${i}`,
        to: `step-${i + 1}`
      });
    }

    const diagram: DiagramDefinition = {
      nodes,
      connections,
      layout: {
        type: steps.length > 4 ? 'vertical' : 'horizontal',
        startX,
        startY,
        spacing: 0.6
      }
    };

    const generator = new DiagramGenerator(slide, colorScheme);
    generator.generate(diagram);
  }

  /**
   * Create a process diagram with decision points
   */
  static createProcessDiagram(slide: any, colorScheme: ColorScheme, config: {
    start: string;
    steps: Array<{label: string, type?: 'process' | 'decision'}>;
    end: string;
  }): void {
    const nodes: DiagramNode[] = [
      { id: 'start', label: config.start, type: 'ellipse', color: colorScheme.accent }
    ];

    config.steps.forEach((step, index) => {
      nodes.push({
        id: `step-${index}`,
        label: step.label,
        type: step.type === 'decision' ? 'diamond' : 'roundRect',
        color: step.type === 'decision' ? colorScheme.secondary : colorScheme.primary
      });
    });

    nodes.push({
      id: 'end',
      label: config.end,
      type: 'ellipse',
      color: colorScheme.accent
    });

    const connections: DiagramConnection[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      connections.push({
        from: nodes[i].id,
        to: nodes[i + 1].id
      });
    }

    const diagram: DiagramDefinition = {
      nodes,
      connections,
      layout: {
        type: 'vertical',
        startX: 3.5,
        startY: 1.5,
        spacing: 0.5
      }
    };

    const generator = new DiagramGenerator(slide, colorScheme);
    generator.generate(diagram);
  }

  /**
   * Create a comparison diagram with two columns
   */
  static createComparisonDiagram(slide: any, colorScheme: ColorScheme, leftItems: string[], rightItems: string[], leftTitle: string = 'Before', rightTitle: string = 'After'): void {
    const leftX = 1.0;
    const rightX = 5.5;
    const startY = 2.0;
    const spacing = 0.9;

    // Left title
    slide.addShape('roundRect', {
      x: leftX,
      y: 1.2,
      w: 3.5,
      h: 0.6,
      fill: { color: colorScheme.accent }
    });
    slide.addText(leftTitle, {
      x: leftX,
      y: 1.2,
      w: 3.5,
      h: 0.6,
      fontSize: 18,
      bold: true,
      color: colorScheme.lightText,
      align: 'center',
      valign: 'middle'
    });

    // Right title
    slide.addShape('roundRect', {
      x: rightX,
      y: 1.2,
      w: 3.5,
      h: 0.6,
      fill: { color: colorScheme.secondary }
    });
    slide.addText(rightTitle, {
      x: rightX,
      y: 1.2,
      w: 3.5,
      h: 0.6,
      fontSize: 18,
      bold: true,
      color: colorScheme.lightText,
      align: 'center',
      valign: 'middle'
    });

    // Left items
    leftItems.forEach((item, index) => {
      slide.addShape('rect', {
        x: leftX,
        y: startY + index * spacing,
        w: 3.5,
        h: 0.7,
        fill: { color: colorScheme.primary },
        line: { color: colorScheme.accent, width: 1 }
      });
      slide.addText(item, {
        x: leftX + 0.2,
        y: startY + index * spacing,
        w: 3.1,
        h: 0.7,
        fontSize: 14,
        color: colorScheme.lightText,
        valign: 'middle'
      });
    });

    // Right items
    rightItems.forEach((item, index) => {
      slide.addShape('rect', {
        x: rightX,
        y: startY + index * spacing,
        w: 3.5,
        h: 0.7,
        fill: { color: colorScheme.primary },
        line: { color: colorScheme.secondary, width: 1 }
      });
      slide.addText(item, {
        x: rightX + 0.2,
        y: startY + index * spacing,
        w: 3.1,
        h: 0.7,
        fontSize: 14,
        color: colorScheme.lightText,
        valign: 'middle'
      });
    });

    // Draw arrows between items
    const maxItems = Math.min(leftItems.length, rightItems.length);
    for (let i = 0; i < maxItems; i++) {
      slide.addShape('line', {
        x: leftX + 3.5,
        y: startY + i * spacing + 0.35,
        w: rightX - (leftX + 3.5),
        h: 0,
        line: {
          color: colorScheme.accent,
          width: 2,
          endArrowType: 'triangle'
        }
      });
    }
  }
}

export function createDiagramGenerator(slide: any, colorScheme: ColorScheme): DiagramGenerator {
  return new DiagramGenerator(slide, colorScheme);
}
