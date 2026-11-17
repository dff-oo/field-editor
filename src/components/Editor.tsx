'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  CrystalIcon,
  DownloadIcon,
  EmptyState,
  ErrorIcon,
  FilePlusIcon,
  FolderOpenIcon,
  IconButton,
  InfoIcon,
  LinkIcon,
  RedoIcon,
  SidebarIcon,
  SuccessIcon,
  Switch,
  ThemeRoot,
  ThemeSwitcher,
  UndoIcon,
  WarningIcon,
} from '@dffoogg/omnia-ui';
import { fieldMapFor } from '@/lib/field-map';
import { EMPTY_RESOURCES, loadResources, type Resources } from '@/lib/resources';
import { checkFields, type NameTables } from '@/lib/field/check';
import { HEX_EVEN_COLUMN_SHIFT, HEX_STEP_X, HEX_STEP_Y, fieldImageRect, hexOutline, hexPixel } from '@/lib/field/hex';
import { fieldFileSchema, type FieldFile, type FieldSiteFile } from '@/lib/field/schema';
import { questHexes, saveFileAs, siteAt, siteLabel, fieldFileName, type HexAt } from '@/lib/edit';
import { encodeField } from '@/lib/share';
import { SitePanel } from './SitePanel';
import { NewField } from './NewField';
import { LoadField, readLink } from './LoadField';
import styles from './Editor.module.css';

const COLS = 20;
const ROWS = 18;
const HISTORY = 100;
const MERGE_MS = 500;
const ARROW_GAP = 52;
const SIDEBAR_KEY = 'field-editor.sidebar';

const LEGEND = [
  { kind: 'cutscene', label: 'Cutscene' },
  { kind: 'battle', label: 'Battle' },
  { kind: 'treasure', label: 'Treasure' },
  { kind: 'move', label: 'Move' },
  { kind: 'portal', label: 'Portal' },
];

const KIND_CLASS: Record<string, string> = {
  cutscene: styles.kindCutscene,
  battle: styles.kindBattle,
  treasure: styles.kindTreasure,
  move: styles.kindMove,
  portal: styles.kindPortal,
};

const hexClass = (...names: (string | false | undefined)[]) => [styles.hex, ...names].filter(Boolean).join(' ');

/** Pull a line back from both hex centres, keeping a visible stub between neighbours. */
function shorten(from: { cx: number; cy: number }, to: { cx: number; cy: number }, gap: number) {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const len = Math.hypot(dx, dy);
  const pull = Math.min(gap, (len - 16) / 2);
  if (pull <= 0) return null;
  const ux = dx / len;
  const uy = dy / len;
  return { x1: from.cx + ux * pull, y1: from.cy + uy * pull, x2: to.cx - ux * pull, y2: to.cy - uy * pull };
}

function siteHex(site: FieldSiteFile): HexAt {
  return site.kind === 'move' ? site.hexes[0] : site.hex;
}

function hexTip(file: FieldFile, at: HexAt, talks: Resources['talks']): string | null {
  const index = siteAt(file, at);
  if (index < 0) return null;
  const site = file.sites[index];
  const label = siteLabel(file, index, talks);
  if (site.kind === 'move') {
    const step = site.hexes.findIndex(([x, y]) => x === at[0] && y === at[1]);
    return `Quest ${site.first_quest_id + step} · ${label}, step ${step + 1} of ${site.hexes.length}`;
  }
  return `Quest ${site.quest_id} · ${label}`;
}

/** A cell is on the map only when its whole outline lies inside the painting. */
function onMap(x: number, y: number, rect: { x: number; y: number; width: number; height: number }): boolean {
  return hexOutline(x, y).split(' ').every((pair) => {
    const [px, py] = pair.split(',').map(Number);
    return px >= rect.x && py >= rect.y && px <= rect.x + rect.width && py <= rect.y + rect.height;
  });
}

function namesOf(resources: Resources): NameTables | null {
  if (!resources.characters.length) return null;
  const map = (rows: { id: number; name: string }[]) => new Map(rows.map((row) => [row.id, row.name]));
  return {
    characters: map(resources.characters),
    enemies: map(resources.enemies),
    abilities: map(resources.abilities),
    summons: map(resources.summons),
    talks: map(resources.talks),
    stages: new Set(resources.stages.map((stage) => stage.id)),
    items: new Map(resources.items.map((item) => [`${item.item_type}:${item.item_id}`, item.name])),
  };
}

export function Editor() {
  const [resources, setResources] = useState<Resources>(EMPTY_RESOURCES);
  const [resourceNote, setResourceNote] = useState('');
  const [file, setFile] = useState<FieldFile | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [at, setAt] = useState<HexAt | null>(null);
  const [showImage, setShowImage] = useState(true);
  const [hideArrows, setHideArrows] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [past, setPast] = useState<FieldFile[]>([]);
  const [future, setFuture] = useState<FieldFile[]>([]);
  const editedAt = useRef(0);

  const fieldMap = file ? fieldMapFor(file.field) : null;

  useEffect(() => {
    loadResources()
      .then((loaded) => {
        setResources(loaded);
        setResourceNote('');
      })
      .catch((error: unknown) => {
        setResourceNote(error instanceof Error ? error.message : 'Could not load resources.');
      });
  }, []);

  useEffect(() => {
    if (window.localStorage.getItem(SIDEBAR_KEY) === 'closed') setSidebarOpen(false);
  }, []);

  function toggleSidebar() {
    const next = !sidebarOpen;
    setSidebarOpen(next);
    window.localStorage.setItem(SIDEBAR_KEY, next ? 'open' : 'closed');
  }

  const problems = useMemo(
    () => (file ? checkFields([{ name: fieldFileName(file.field), data: file }], namesOf(resources)) : []),
    [file, resources],
  );

  const savable = useMemo(() => (file ? fieldFileSchema.safeParse(file).success : false), [file]);

  function open(next: FieldFile) {
    setFile(next);
    setPast([]);
    setFuture([]);
    editedAt.current = 0;
    setCreating(false);
    setLoadErrors([]);
    setAt(null);
  }

  function edit(next: FieldFile) {
    if (!file) {
      setFile(next);
      return;
    }
    const now = Date.now();
    if (now - editedAt.current >= MERGE_MS) setPast((prev) => [...prev, file].slice(-HISTORY));
    editedAt.current = now;
    setFuture([]);
    setFile(next);
  }

  function undo() {
    if (!file || past.length === 0) return;
    const previous = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture((next) => [file, ...next].slice(0, HISTORY));
    setFile(previous);
    editedAt.current = 0;
  }

  function redo() {
    if (!file || future.length === 0) return;
    const [next, ...rest] = future;
    setFuture(rest);
    setPast((prev) => [...prev, file].slice(-HISTORY));
    setFile(next);
    editedAt.current = 0;
  }

  useEffect(() => {
    // Editing the address bar changes the hash without reloading, so listen as well as reading it once.
    let generation = 0;
    function loadFromHash() {
      const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('f');
      if (!token) return;
      const current = ++generation;
      void readLink(token).then((result) => {
        if (current !== generation) return;
        // The address bar is not kept in sync with edits, so drop the stale link; Copy link makes a fresh one.
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        if ('errors' in result) setLoadErrors(result.errors);
        else open(result.file);
      });
    }
    loadFromHash();
    window.addEventListener('hashchange', loadFromHash);
    return () => {
      generation += 1;
      window.removeEventListener('hashchange', loadFromHash);
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (creating || loading || !file) return;
      const key = event.key.toLowerCase();
      if (!(event.ctrlKey || event.metaKey) || (key !== 'z' && key !== 'y')) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      event.preventDefault();
      if (key === 'z' && !event.shiftKey) undo();
      else redo();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [creating, loading, file, past, future]);

  const fieldName = file ? resources.fields.find((row) => row.id === file.field)?.name : undefined;

  const toolbar = (
    <header className={styles.toolbar}>
      <div className={styles.title}>
        <CrystalIcon className={styles.titleIcon} />
        <h1 className={styles.titleText}>Field editor</h1>
        {file && (
          <span className={styles.fieldName}>
            Field {file.field}
            {fieldName ? `: ${fieldName}` : ''}
          </span>
        )}
      </div>
      <div className={styles.group}>
        <Button size="sm" startIcon={<FilePlusIcon size={16} />} onClick={() => setCreating(true)}>
          New
        </Button>
        <Button size="sm" startIcon={<FolderOpenIcon size={16} />} onClick={() => setLoading(true)}>
          Load
        </Button>
        <Button
          size="sm"
          startIcon={<DownloadIcon size={16} />}
          disabled={!file || !savable}
          title={file && !savable ? 'Fix the problems in the bottom bar first; Load would reject this file.' : undefined}
          onClick={() => file && void saveFileAs(fieldFileName(file.field), file).catch((error) => setLoadErrors([String(error)]))}
        >
          Save as…
        </Button>
        <Button
          size="sm"
          startIcon={<LinkIcon size={16} />}
          disabled={!file || !savable}
          title={file && !savable ? 'Fix the problems in the bottom bar first; a link would not load.' : undefined}
          onClick={() => {
            if (!file) return;
            const url = `${location.origin}${location.pathname}${location.search}#f=`;
            void encodeField(file)
              .then((token) => navigator.clipboard.writeText(url + token))
              .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              })
              .catch((error: unknown) => setLoadErrors([error instanceof Error ? error.message : String(error)]));
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <span className="omnia-sr-only" role="status">
          {copied ? 'Link copied to the clipboard.' : ''}
        </span>
      </div>
      {file && (
        <div className={styles.group}>
          <IconButton size="sm" label="Undo" title="Undo (Ctrl+Z)" icon={<UndoIcon size={16} />} disabled={past.length === 0} onClick={undo} />
          <IconButton size="sm" label="Redo" title="Redo (Ctrl+Y)" icon={<RedoIcon size={16} />} disabled={future.length === 0} onClick={redo} />
        </div>
      )}
      {file && (
        <div className={styles.group}>
          <Switch label="Reveal arrows" checked={!hideArrows} onCheckedChange={(checked) => setHideArrows(!checked)} />
          {fieldMap && <Switch label="Field image" checked={showImage} onCheckedChange={setShowImage} />}
        </div>
      )}
      <ThemeSwitcher compact className={styles.theme} />
    </header>
  );

  const dialogs = (
    <>
      <NewField open={creating} onOpenChange={setCreating} resources={resources} onCreate={open} />
      <LoadField
        open={loading}
        onOpenChange={setLoading}
        onOpen={(next) => {
          setLoading(false);
          open(next);
        }}
      />
    </>
  );

  const tone = loadErrors.length ? 'danger' : file && problems.length ? 'warning' : file && !resourceNote ? 'ok' : 'info';
  const statusText = loadErrors.length
    ? loadErrors.join(' · ')
    : file && problems.length
      ? problems.map((problem) => problem.message).join(' · ')
      : resourceNote || (file ? `${file.sites.length} site${file.sites.length === 1 ? '' : 's'}, no problems found.` : '');
  const StatusIcon = { danger: ErrorIcon, warning: WarningIcon, ok: SuccessIcon, info: InfoIcon }[tone];
  const status = (
    <footer className={styles.status} data-tone={tone}>
      {statusText && <StatusIcon size={16} className={styles.statusIcon} />}
      <p>
        {file && problems.length > 0 && !loadErrors.length && (
          <strong>
            {problems.length} problem{problems.length === 1 ? '' : 's'}:{' '}
          </strong>
        )}
        {statusText}
      </p>
    </footer>
  );

  if (!file) {
    return (
      <div className={styles.app}>
        {toolbar}
        <main className={styles.start}>
          <EmptyState
            className={styles.startCard}
            headingLevel={2}
            icon={<CrystalIcon size={32} />}
            title="Open a field"
            description="Start a new map, or load a field from a link or a JSON file."
            actions={
              <>
                <Button variant="primary" startIcon={<FilePlusIcon size={16} />} onClick={() => setCreating(true)}>
                  New field
                </Button>
                <Button startIcon={<FolderOpenIcon size={16} />} onClick={() => setLoading(true)}>
                  Load
                </Button>
              </>
            }
          />
        </main>
        {status}
        {dialogs}
      </div>
    );
  }

  const image = fieldMap ? fieldImageRect(fieldMap.scale) : null;
  const view = image ?? {
    x: 0,
    y: 0,
    width: Math.max(hexPixel(COLS - 1, 0).cx + HEX_STEP_X, 0) + 80,
    height: Math.max(hexPixel(0, ROWS - 1).cy + HEX_STEP_Y + HEX_EVEN_COLUMN_SHIFT, 0) + 80,
  };
  const columns = image ? Math.ceil((image.x + image.width) / HEX_STEP_X) + 2 : COLS;
  const rows = image ? Math.ceil((image.y + image.height) / HEX_STEP_Y) + 2 : ROWS;
  const selectedSite = at ? siteAt(file, at) : -1;
  const byQuest = new Map(questHexes(file).map((row) => [row.questId, row.hex]));
  const arrows = hideArrows
    ? []
    : file.sites.flatMap((site, index) => {
        if (site.revealed_by === null) return [];
        const fromHex = byQuest.get(site.revealed_by);
        if (!fromHex) return [];
        const to = siteHex(site);
        const line = shorten(hexPixel(fromHex[0], fromHex[1]), hexPixel(to[0], to[1]), ARROW_GAP);
        return line ? [{ index, ...line }] : [];
      });

  return (
    <div className={styles.app}>
      {toolbar}
      <main className={styles.workspace} data-sidebar={sidebarOpen ? 'open' : 'closed'}>
        <ThemeRoot theme="dark" className={fieldMap && showImage ? `${styles.map} ${styles.hasOverlay}` : styles.map}>
          <svg viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} aria-label={`Map of field ${file.field}`}>
            <defs>
              <marker id="reveal-arrow" markerUnits="userSpaceOnUse" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="36" markerHeight="36" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" className={styles.revealHead} />
              </marker>
            </defs>
            {fieldMap && image && showImage && (
              <image
                href={fieldMap.url}
                x={image.x}
                y={image.y}
                width={image.width}
                height={image.height}
                preserveAspectRatio="none"
                style={{ pointerEvents: 'none' }}
              />
            )}
            {Array.from({ length: columns * rows }, (_, index) => {
              const x = index % columns;
              const y = Math.floor(index / columns);
              if (image && !onMap(x, y, image)) return null;
              const occupied = siteAt(file, [x, y]);
              const kind = occupied >= 0 ? file.sites[occupied].kind : '';
              const portalHere = file.portal && file.portal.hex[0] === x && file.portal.hex[1] === y;
              const tip = occupied >= 0
                ? hexTip(file, [x, y], resources.talks)
                : portalHere
                  ? `Quest ${file.portal?.quest_id} · Portal`
                  : null;
              return (
                <polygon
                  key={`${x}-${y}`}
                  points={hexOutline(x, y)}
                  className={hexClass(occupied >= 0 ? KIND_CLASS[kind] : styles.empty)}
                  onClick={() => setAt([x, y])}
                >
                  {tip && <title>{tip}</title>}
                </polygon>
              );
            })}
            {file.portal && (
              <polygon points={hexOutline(file.portal.hex[0], file.portal.hex[1])} className={hexClass(styles.kindPortal)}>
                <title>{`Quest ${file.portal.quest_id} · Portal`}</title>
              </polygon>
            )}
            {arrows.map(({ index, x1, y1, x2, y2 }) => (
              <line key={`reveal-${index}`} className={styles.reveal} markerEnd="url(#reveal-arrow)" x1={x1} y1={y1} x2={x2} y2={y2} />
            ))}
            {file.sites.flatMap((site, index) => {
              if (site.kind !== 'move' || site.hexes.length < 2) return [];
              return site.hexes.map((hex, step) => {
                const { cx, cy } = hexPixel(hex[0], hex[1]);
                return (
                  <text key={`step-${index}-${step}`} x={cx} y={cy} className={styles.step}>
                    {step + 1}
                  </text>
                );
              });
            })}
            {file.sites.flatMap((site, index) => {
              if (site.kind !== 'cutscene' && site.kind !== 'battle') return [];
              const { cx, cy } = hexPixel(site.hex[0], site.hex[1]);
              const letters = [site.revealed_by === null && 'S', site.goal && 'G'].filter((letter) => letter) as string[];
              return letters.map((letter, n) => (
                <text
                  key={`${letter}-${index}`}
                  x={cx + (letters.length > 1 ? (n ? 30 : -30) : 0)}
                  y={cy}
                  className={styles.marker}
                >
                  {letter}
                </text>
              ));
            })}
            {selectedSite >= 0 &&
              questHexes(file)
                .filter((row) => row.site === selectedSite)
                .map(({ hex: [x, y] }) => (
                  <polygon key={`outline-${x}-${y}`} points={hexOutline(x, y)} className={hexClass(styles.outline, styles.sameSite)} />
                ))}
            {at && <polygon points={hexOutline(at[0], at[1])} className={hexClass(styles.outline, styles.selected)} />}
          </svg>
          <aside className={styles.legend} aria-label="Map legend">
            {LEGEND.map(({ kind, label }) => (
              <span key={kind}>
                <svg viewBox="0 0 20 22" width="16" height="18" aria-hidden="true">
                  <polygon points="10,1 18.5,6 18.5,16 10,21 1.5,16 1.5,6" className={hexClass(KIND_CLASS[kind])} />
                </svg>
                {label}
              </span>
            ))}
            <span><b>S</b> Start</span>
            <span><b>G</b> Goal</span>
          </aside>
        </ThemeRoot>
        <aside className={styles.inspector} aria-label="Hex inspector">
          <IconButton
            size="sm"
            className={styles.sidebarToggle}
            label={sidebarOpen ? 'Collapse the sidebar' : 'Expand the sidebar'}
            title={sidebarOpen ? 'Collapse the sidebar' : 'Expand the sidebar'}
            aria-expanded={sidebarOpen}
            icon={<SidebarIcon size={16} />}
            onClick={toggleSidebar}
          />
          {sidebarOpen &&
            (at ? (
              <SitePanel
                file={file}
                at={at}
                resources={resources}
                onChange={edit}
              />
            ) : (
              <p className={styles.hint}>Click a hex to choose what is on it.</p>
            ))}
        </aside>
      </main>
      {status}
      {dialogs}
    </div>
  );
}
