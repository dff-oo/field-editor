import { useMemo, useState } from 'react';
import type { FieldFile } from '@/lib/field/schema';
import type { Resources } from '@/lib/resources';
import { emptyField } from '@/lib/edit';
import { SearchSelect, namedOptions } from './SearchSelect';

export function NewField(props: {
  resources: Resources;
  onCreate: (file: FieldFile) => void;
  onCancel?: () => void;
}) {
  const [field, setField] = useState<string | null>(null);
  const [typedField, setTypedField] = useState('');
  const fields = useMemo(() => namedOptions(props.resources.fields), [props.resources.fields]);
  const fieldId = fields.length ? Number(field) : Number(typedField);

  return (
    <div className="start">
      <div className="start-new">
        {fields.length ? (
          <SearchSelect label="Field" options={fields} value={field} onChange={setField} placeholder="Search fields" />
        ) : (
          <label>
            Field id (run npm run resources for the field list)
            <input type="number" min="1" value={typedField} onChange={(event) => setTypedField(event.target.value)} />
          </label>
        )}
        <div className="start-actions">
          {props.onCancel && <button type="button" onClick={props.onCancel}>Cancel</button>}
          <button type="button" disabled={!(fieldId > 0)} onClick={() => props.onCreate(emptyField(fieldId))}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
