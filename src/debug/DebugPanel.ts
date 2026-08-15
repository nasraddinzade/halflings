import { DEBUG_REFRESH, STAMINA_MAX } from '../config/constants';

/** Всё, что панель показывает за кадр. Собирается в Game. */
export interface DebugSnapshot {
  delta: number;
  drawCalls: number;
  triangles: number;
  clip: string;
  speed: number;
  stamina: number;
  grounded: boolean;
  /** Сколько жителей сейчас в состоянии work. null — деревни нет. */
  working: number | null;
}

interface Row {
  label: string;
  value: HTMLElement;
}

const ROWS = [
  'fps', 'draw calls', 'треугольников', 'клип',
  'скорость', 'стамина', 'на земле', 'работают',
] as const;

/**
 * Оверлей с метриками. Живёт отдельным модулем и целиком выключается
 * константой DEBUG_PANEL — в Game он либо есть, либо его нет.
 *
 * Draw call — одна команда отрисовки, отправленная видеокарте. Их число
 * важнее числа треугольников: современная карта переварит сотни тысяч
 * полигонов, но захлебнётся на тысячах отдельных вызовов. Именно по
 * этому счётчику станет видно, когда шесть мешей на персонажа начнут
 * стоить дорого и придёт время склейки (решение №1).
 */
export class DebugPanel {
  private readonly element: HTMLElement;
  private readonly rows = new Map<string, Row>();

  /** FPS усредняется за интервал: мгновенное значение скачет и нечитаемо. */
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
      // Панель не должна перехватывать клик, которым берут указатель
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
    this.set('треугольников', snapshot.triangles.toLocaleString('ru-RU'));
    this.set('клип', snapshot.clip);
    this.set('скорость', `${snapshot.speed.toFixed(2)} м/с`);
    this.set('стамина', `${snapshot.stamina.toFixed(1)} / ${STAMINA_MAX}`);
    this.set('на земле', snapshot.grounded ? 'да' : 'нет');
    this.set('работают', snapshot.working === null ? '—' : String(snapshot.working));
  }

  dispose(): void {
    this.element.remove();
  }

  private set(label: string, text: string): void {
    const row = this.rows.get(label);
    if (row !== undefined) row.value.textContent = text;
  }
}
