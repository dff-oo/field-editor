import { useMemo, useState } from 'react';
import { Button, Combobox, Dialog, DialogClose, TextField } from '@dffoogg/omnia-ui';
import type { FieldFile } from '@/lib/field/schema';
import type { Resources } from '@/lib/resources';
import { emptyField } from '@/lib/edit';
import { namedOptions } from '@/lib/options';

export function NewField(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resources: Resources;
  onCreate: (file: FieldFile) => void;
}) {
  const [field, setField] = useState<string | null>(null);
  const [typedField, setTypedField] = useState('');
  const fields = useMemo(() => namedOptions(props.resources.fields), [props.resources.fields]);
  const fieldId = fields.length ? Number(field) : Number(typedField);

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      size="sm"
      title="New field"
      description="Start an empty map for one field."
      actions={
        <>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button variant="primary" disabled={!(fieldId > 0)} onClick={() => props.onCreate(emptyField(fieldId))}>
            Create
          </Button>
        </>
      }
    >
      {fields.length ? (
        <Combobox label="Field" options={fields} value={field} onValueChange={setField} placeholder="Search fields" autoFocus />
      ) : (
        <TextField
          label="Field id"
          description="Run npm run resources for the field list."
          type="number"
          min="1"
          autoFocus
          value={typedField}
          onChange={(event) => setTypedField(event.target.value)}
        />
      )}
    </Dialog>
  );
}
