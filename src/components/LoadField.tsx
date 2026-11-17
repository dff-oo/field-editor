import { useEffect, useRef, useState } from 'react';
import { fieldFileSchema, type FieldFile } from '@/lib/field/schema';
import { decodeField, linkToken } from '@/lib/share';

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

export function LoadField(props: { onOpen: (file: FieldFile) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [link, setLink] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function finish(read: Promise<Read>) {
    setBusy(true);
    const result = await read;
    setBusy(false);
    if ('errors' in result) setErrors(result.errors);
    else props.onOpen(result.file);
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
    <dialog ref={dialog} className="load-field" onClose={props.onClose}>
      <h2>Load a field</h2>
      <label>
        Field link
        <textarea
          autoFocus
          value={link}
          placeholder="https://dffoogg.github.io/field-editor/#f=v1.…"
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
      </label>
      <div className="start-actions">
        <label className="button">
          Choose JSON file…
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const upload = event.target.files?.[0];
              event.target.value = '';
              if (upload) void finish(readField(upload));
            }}
          />
        </label>
        <span className="load-actions">
          <button type="button" onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="button" disabled={busy || !link.trim()} onClick={loadLink}>Load link</button>
        </span>
      </div>
      {errors.length > 0 && <p className="load-errors">{errors.join(' · ')}</p>}
    </dialog>
  );
}
