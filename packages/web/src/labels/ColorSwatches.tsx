/** A row of the ten colours as radio buttons, for a board or a label. */
import { COLOR_NAMES, type ColorName } from '@corkboard/model';
import { Check } from 'lucide-react';
import { colorLabel } from './LabelChip.js';

export function ColorSwatches({ value, onChange, legend = 'Colour' }: { value: ColorName; onChange: (color: ColorName) => void; legend?: string }) {
  return (
    <fieldset className="field swatch-field">
      <legend>{legend}</legend>
      <div className="swatches" role="radiogroup" aria-label={legend}>
        {COLOR_NAMES.map((color) => (
          <button
            type="button"
            key={color}
            role="radio"
            aria-checked={color === value}
            aria-label={colorLabel(color)}
            title={colorLabel(color)}
            className={`swatch color-${color}`}
            onClick={() => onChange(color)}
          >
            {color === value && <Check size={14} strokeWidth={3} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
