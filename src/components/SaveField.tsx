'use client';

import { useEffect, useState } from 'react';
import { Button, Callout, CopyField, Dialog, DialogClose, DownloadIcon } from '@dffoogg/omnia-ui';
import type { FieldFile } from '@/lib/field/schema';
import { fieldFileName, saveFileAs } from '@/lib/edit';
import { encodeField } from '@/lib/share';
import styles from './Editor.module.css';

export function SaveField(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: FieldFile | null;
  /** Reasons this field should not be saved or shared. */
  problems: string[];
}) {
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState('');
  const [saveError, setSaveError] = useState('');
  const blocked = props.problems.length > 0;

  useEffect(() => {
    if (!props.open) {
      setLink('');
      setLinkError('');
      setSaveError('');
      return;
    }
    if (!props.file || blocked) return;
    let cancel = false;
    const file = props.file;
    void encodeField(file)
      .then((token) => {
        if (cancel) return;
        setLink(`${location.origin}${location.pathname}${location.search}#f=${token}`);
      })
      .catch((error: unknown) => {
        if (!cancel) setLinkError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancel = true;
    };
  }, [props.open, props.file, blocked]);

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Save field"
      description="Share a link to this exact field, or download it as JSON."
      actions={
        <>
          <DialogClose render={<Button variant="ghost" />}>Close</DialogClose>
          <Button
            variant="primary"
            startIcon={<DownloadIcon size={16} />}
            disabled={!props.file || blocked}
            onClick={() => {
              if (!props.file) return;
              setSaveError('');
              void saveFileAs(fieldFileName(props.file.field), props.file).catch((error: unknown) => {
                setSaveError(error instanceof Error ? error.message : String(error));
              });
            }}
          >
            Download JSON
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        {blocked ? (
          <Callout tone="warning" role="alert" title="Fix these before saving">
            <ul className={styles.errorList}>
              {props.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Callout>
        ) : (
          <>
            <p className={styles.note}>Anyone with the link opens this exact field.</p>
            {link ? (
              <CopyField label="Share link" value={link} copyLabel="Copy link" />
            ) : (
              <p className={styles.note}>{linkError || 'Preparing the link…'}</p>
            )}
            {saveError && (
              <Callout tone="danger" role="alert" title="The file was not saved">
                {saveError}
              </Callout>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
