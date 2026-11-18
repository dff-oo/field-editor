import { useEffect, useRef, useState } from 'react';
import { Button, Callout, Dialog, DialogClose, TextArea, UploadIcon } from '@dff-oo/omnia-ui';
import { fieldFileSchema, type FieldFile } from '@/lib/field/schema';
import { decodeField, linkToken } from '@/lib/share';
import styles from './Editor.module.css';

type Read = { file: FieldFile } | { errors: string[] };

function validate(data: unknown, where: string): Read {
  const parsed = fieldFileSchema.safeParse(data);
  if (!parsed.success) {
    return { errors: parsed.error.issues.slice(0, 12).map((issue) => `${issue.path.join('.') || where}: ${issue.message}`) };
  }
  return { file: parsed.data };
}

/** Parses an uploaded field file, or returns what is wrong with it. */
export async function readField(upload: File): Promise<Read> {
  let data: unknown;
  try {
    data = JSON.parse(await upload.text());
  } catch {
    return { errors: [`${upload.name} is not valid JSON.`] };
  }
  return validate(data, '(file)');
}

/** Decodes a field link token, or returns what is wrong with it. */
export async function readLink(token: string): Promise<Read> {
  try {
    return validate(await decodeField(token), '(link)');
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : String(error)] };
  }
}

export function LoadField(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpen: (file: FieldFile) => void;
  /** Errors from a link in the address bar, shown when the dialog opens. */
  notice?: string[];
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (props.open && props.notice && props.notice.length > 0) setErrors(props.notice);
  }, [props.open, props.notice]);

  function openChange(open: boolean) {
    if (!open) {
      setLink('');
      setErrors([]);
    }
    props.onOpenChange(open);
  }

  async function finish(read: Promise<Read>) {
    setBusy(true);
    const result = await read;
    setBusy(false);
    if ('errors' in result) setErrors(result.errors);
    else {
      setLink('');
      setErrors([]);
      props.onOpen(result.file);
    }
  }

  function loadLink() {
    const token = linkToken(link);
    if (!token) {
      setErrors(['Paste a field link, the #f=… part of one, or its v1.… code.']);
      return;
    }
    void finish(readLink(token));
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={openChange}
      title="Load a field"
      description="Paste a field link, or choose a field JSON file."
      actions={
        <>
          <Button className={styles.footerStart} startIcon={<UploadIcon size={16} />} onClick={() => fileInput.current?.click()}>
            Choose JSON file…
          </Button>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button variant="primary" loading={busy} disabled={!link.trim()} onClick={loadLink}>
            Load link
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <TextArea
          label="Field link"
          description="Enter loads the link; Shift+Enter adds a new line."
          autoFocus
          value={link}
          placeholder="https://dff-oo.github.io/field-editor/#f=v1.…"
          className={styles.linkInput}
          onChange={(event) => {
            setLink(event.target.value);
            setErrors([]);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              loadLink();
            }
          }}
        />
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const upload = event.target.files?.[0];
            event.target.value = '';
            if (upload) void finish(readField(upload));
          }}
        />
        {errors.length > 0 && (
          <Callout tone="danger" role="alert" title="This field could not be loaded">
            <ul className={styles.errorList}>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
