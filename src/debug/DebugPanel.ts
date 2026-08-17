import { DEBUG_REFRESH, STAMINA_MAX } from '../config/constants';

/** Everything the panel shows for a frame. Assembled in Game. */
export interface DebugSnapshot {
  delta: number;
  /** Where the player stands: otherwise you cannot tell if he got there. */
  position: { x: number; y: number; z: number };
  drawCalls: number;
  triangles: number;
  clip: string;
  speed: number;
  stamina: number;
  grounded: boolean;
  /** How many villagers are in the work state. null — there is no village. */
  working: number | null;
  /** How many villagers passed LOD culling and made it into the frame. */
  visibleVillagers: number | null;
}

interface Row {
  label: string;
  value: HTMLElement;
}

const ROWS = [
  'fps', 'draw calls', 'triangles', 'clip',
  'speed', 'stamina', 'grounded', 'working', 'on screen', 'position',
] as const;

/**
 * Metrics overlay. Lives as a separate module and switches off entirely
 * via the DEBUG_PANEL constant — in Game it either exists or it does not.
 *
 * A draw call is one drawing command sent to the GPU. Their count matters
 * more than the triangle count: a modern card will chew through hundreds
 * of thousands of polygons but choke on thousands of separate calls. This
 * is exactly the counter that will show when six meshes per character
 * start costing real money and it is time to merge them (decision #1).
 */
export class DebugPanel {
  private readonly element: HTMLElement;
  private readonly rows = new Map<string, Row>();

  /** FPS is averaged over an interval: the instant value jumps around. */
  private elapsed = 0;
  private frames = 0;
  private fps = 0;

  constructor() {
    this.element = document.createElement('div');
    this.element.id = 'debug-panel';
    Object.assign(this.element.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      padding: '8px 10px',
      font: '12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace',
      color: '#e6ebf0',
      background: 'rgba(18, 20, 23, 0.72)',
      borderRadius: '4px',
      // The panel must not swallow the click that grabs the pointer
      pointerEvents: 'none',
      whiteSpace: 'pre',
      zIndex: '10',
    } satisfies Partial<CSSStyleDeclaration>);

    for (const label of ROWS) {
      const row = document.createElement('div');
      const name = document.createElement('span');
      name.textContent = `${label.padEnd(14)}`;
      name.style.opacity = '0.55';
      const value = document.createElement('span');
      row.append(name, value);
      this.element.append(row);
      this.rows.set(label, { label, value });
    }

    document.body.append(this.element);
  }

  update(snapshot: DebugSnapshot): void {
    this.frames++;
    this.elapsed += snapshot.delta;
    if (this.elapsed < DEBUG_REFRESH) return;

    this.fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;

    this.set('fps', this.fps.toFixed(0));
    this.set('draw calls', String(snapshot.drawCalls));
    this.set('triangles', snapshot.triangles.toLocaleString('en-US'));
    this.set('clip', snapshot.clip);
    this.set('speed', `${snapshot.speed.toFixed(2)} m/s`);
    this.set('stamina', `${snapshot.stamina.toFixed(1)} / ${STAMINA_MAX}`);
    this.set('grounded', snapshot.grounded ? 'yes' : 'no');
    this.set('working', snapshot.working === null ? '—' : String(snapshot.working));
    this.set('on screen', snapshot.visibleVillagers === null ? '—' : String(snapshot.visibleVillagers));
    const p = snapshot.position;
    this.set('position', `${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}`);
  }

  dispose(): void {
    this.element.remove();
  }

  private set(label: string, text: string): void {
    const row = this.rows.get(label);
    if (row !== undefined) row.value.textContent = text;
  }
}
