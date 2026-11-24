import { Component, computed, inject } from '@angular/core';
import { SubtitleAppearance } from '../../domain/subtitle-appearance';
import { SubtitleAppearanceStore } from '../../infrastructure/subtitle-appearance.store';

export function subtitleAppearanceClasses(value: SubtitleAppearance) {
  return `caption-size-${value.size} caption-color-${value.color} caption-bg-${value.background} caption-outline-${value.outline ? 'on' : 'off'}`;
}

@Component({
  selector: 'subtitle-appearance-settings',
  standalone: true,
  template: `
    <fieldset>
      <legend>Aparência da legenda</legend>
      <label
        >Tamanho<select
          aria-label="Tamanho da legenda"
          [value]="preferences.settings().size"
          (change)="select('size', $event)"
        >
          <option value="small">Pequeno</option>
          <option value="medium">Médio</option>
          <option value="large">Grande</option>
        </select></label
      >
      <label
        >Cor<select
          aria-label="Cor da legenda"
          [value]="preferences.settings().color"
          (change)="select('color', $event)"
        >
          <option value="white">Branco</option>
          <option value="yellow">Amarelo</option>
          <option value="cyan">Azul-claro</option>
          <option value="green">Verde</option>
        </select></label
      >
      <label
        >Fundo<select
          aria-label="Fundo da legenda"
          [value]="preferences.settings().background"
          (change)="select('background', $event)"
        >
          <option value="none">Sem fundo</option>
          <option value="semi">Preto semitransparente</option>
          <option value="solid">Preto sólido</option>
        </select></label
      >
      <label class="outline-option"
        ><input
          type="checkbox"
          [checked]="preferences.settings().outline"
          (change)="outline($event)"
        />Contorno escuro</label
      >
      <div class="preview" aria-label="Prévia da aparência da legenda">
        <span [class]="'caption-preview ' + classes()">Assim ficará sua legenda</span>
      </div>
      <button type="button" (click)="preferences.reset()">Restaurar padrão</button>
      <p>Aplicado na hora e salvo neste navegador. Não altera legendas fixas na imagem.</p>
    </fieldset>
  `,
  styleUrls: ['./subtitle-appearance.css', './subtitle-cue.css'],
})
export class SubtitleAppearanceSettings {
  readonly preferences = inject(SubtitleAppearanceStore);
  readonly classes = computed(() => subtitleAppearanceClasses(this.preferences.settings()));
  select(key: 'size' | 'color' | 'background', event: Event) {
    this.preferences.update(key, (event.target as HTMLSelectElement).value);
  }
  outline(event: Event) {
    this.preferences.update('outline', (event.target as HTMLInputElement).checked);
  }
}
