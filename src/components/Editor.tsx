'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsIcon,
  Button,
  CrystalIcon,
  EmptyState,
  FilePlusIcon,
  FitIcon,
  GAME_HEX_FRAME,
  GameIcon,
  gameIconSrc,
  type GameIconName,
  FolderOpenIcon,
  IconButton,
  ImageIcon,
  Menu,
  MenuItem,
  Popover,
  RedoIcon,
  SuccessIcon,
  ThemeRoot,
  ThemeToggle,
  Tooltip,
  UndoIcon,
  WarningIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@dffoogg/omnia-ui';
import { fieldMapFor } from '@/lib/field-map';
import { siteIcon } from '@/lib/game-icons';
import { EMPTY_RESOURCES, loadResources, type Resources } from '@/lib/resources';
import { checkFields, type NameTables } from '@/lib/field/check';
import { HEX_EVEN_COLUMN_SHIFT, HEX_HALF_HEIGHT, HEX_HALF_WIDTH, HEX_STEP_X, HEX_STEP_Y, fieldImageRect, hexOutline, hexPixel } from '@/lib/field/hex';
import { fieldFileSchema, type FieldFile, type FieldSiteFile } from '@/lib/field/schema';
import { questHexes, siteAt, siteLabel, fieldFileName, type HexAt } from '@/lib/edit';
import { SitePanel } from './SitePanel';
import { NewField } from './NewField';
import { LoadField, readLink } from './LoadField';
import { SaveField } from './SaveField';
import styles from './Editor.module.css';

const COLS = 20;
const ROWS = 18;
const HISTORY = 100;
const MERGE_MS = 500;
const ARROW_GAP = 52;
const LEGEND_KEY = 'field-editor.legend';
const MIN_ZOOM = HEX_STEP_X * 4;
const MAX_ZOOM = HEX_STEP_X * 48;

const SPRITE_SIZE = 92;
const MOVE_STAR_SIZE = 72;

const KIND_TINT: Record<FieldSiteFile['kind'], string> = {
  cutscene: styles.tintCutscene,
  battle: styles.tintBattle,
  treasure: styles.tintTreasure,
  move: styles.tintMove,
};
const BADGE_SIZE = 50;
const BADGE_INSET = 4;
/** The game's hex frames are scaled so their line box covers one cell exactly. */
const FRAME_SCALE_X = (HEX_HALF_WIDTH * 2) / GAME_HEX_FRAME.width;
const FRAME_SCALE_Y = (HEX_HALF_HEIGHT * 2) / GAME_HEX_FRAME.height;
const FRAME_WIDTH = GAME_HEX_FRAME.size * FRAME_SCALE_X;
const FRAME_HEIGHT = GAME_HEX_FRAME.size * FRAME_SCALE_Y;
const FRAME_CENTRE_X = (GAME_HEX_FRAME.left + GAME_HEX_FRAME.width / 2) * FRAME_SCALE_X;
const FRAME_CENTRE_Y = (GAME_HEX_FRAME.top + GAME_HEX_FRAME.height / 2) * FRAME_SCALE_Y;

const LEGEND: { icon: GameIconName; label: string }[] = [
  { icon: 'cutscene', label: 'Cutscene' },
  { icon: 'helmet-silver', label: 'Battle' },
  { icon: 'helmet-gold', label: 'Strong enemy' },
  { icon: 'helmet-green', label: 'Side quest' },
  { icon: 'treasure', label: 'Treasure' },
  { icon: 'move', label: 'Move' },
  { icon: 'portal', label: 'Portal' },
];

interface Camera {
  cx: number;
  cy: number;
  /** Width of the view, in map pixels. Height follows the map's shape. */
  width: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

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

/** What the hover readout says about a hex. */
function hoverText(file: FieldFile, at: HexAt, talks: Resources['talks']): string {
  if (file.portal && file.portal.hex[0] === at[0] && file.portal.hex[1] === at[1]) return `Quest ${file.portal.quest_id} · Portal`;
  return hexTip(file, at, talks) ?? 'Empty';
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
function onMap(x: number, y: number, rect: Box): boolean {
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

function clampZoom(width: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, width));
}

/** A view that frames every site, or the painting when the field is empty. */
function fitCamera(file: FieldFile, image: Box | null, aspect: number): Camera {
  const points = questHexes(file).map((row) => hexPixel(row.hex[0], row.hex[1]));
  if (file.portal) points.push(hexPixel(file.portal.hex[0], file.portal.hex[1]));
  const box: Box = points.length
    ? (() => {
        const pad = HEX_STEP_X;
        const minX = Math.min(...points.map((point) => point.cx)) - pad;
        const maxX = Math.max(...points.map((point) => point.cx)) + pad;
        const minY = Math.min(...points.map((point) => point.cy)) - pad;
        const maxY = Math.max(...points.map((point) => point.cy)) + pad;
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      })()
    : image ?? { x: 0, y: 0, width: HEX_STEP_X * 12, height: HEX_STEP_Y * 10 };
  const safeAspect = Math.max(aspect, 0.35);
  const width = clampZoom(Math.max(box.width, box.height / safeAspect) * 1.08);
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2, width };
}

/** The hex a problem is about, when the message names a site or a quest. */
function problemHex(file: FieldFile, message: string): HexAt | null {
  const site = /sites\.(\d+)/.exec(message);
  if (site) {
    const row = file.sites[Number(site[1])];
    if (row) return row.kind === 'move' ? row.hexes[0] : row.hex;
  }
  const match = /(?:quest|cutscene|portal) (\d+)/i.exec(message);
  if (!match) return null;
  const questId = Number(match[1]);
  return questHexes(file).find((row) => row.questId === questId)?.hex
    ?? (file.portal?.quest_id === questId ? file.portal.hex : null);
}

export function Editor() {
  const [resources, setResources] = useState<Resources>(EMPTY_RESOURCES);
  const [resourceNote, setResourceNote] = useState('');
  const [file, setFile] = useState<FieldFile | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [at, setAt] = useState<HexAt | null>(null);
  const [cursor, setCursor] = useState<HexAt | null>(null);
  const [hover, setHover] = useState<HexAt | null>(null);
  const [cursorNote, setCursorNote] = useState('');
  const [showImage, setShowImage] = useState(true);
  const [hideArrows, setHideArrows] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [past, setPast] = useState<FieldFile[]>([]);
  const [future, setFuture] = useState<FieldFile[]>([]);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [aspect, setAspect] = useState(0.7);
  const editedAt = useRef(0);
  const mapRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const dragged = useRef(false);
  const pan = useRef<{ id: number; x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  cameraRef.current = camera;

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
    if (window.localStorage.getItem(LEGEND_KEY) === 'open') setLegendOpen(true);
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  const problems = useMemo(
    () => (file ? checkFields([{ name: fieldFileName(file.field), data: file }], namesOf(resources)) : []),
    [file, resources],
  );

  const savable = useMemo(() => (file ? fieldFileSchema.safeParse(file).success : false), [file]);
  const saveProblems = [
    ...problems.map((problem) => problem.message),
    ...(file && !savable ? ['This file does not match the field schema.'] : []),
  ];

  function open(next: FieldFile) {
    setFile(next);
    setPast([]);
    setFuture([]);
    editedAt.current = 0;
    setCreating(false);
    setLoadErrors([]);
    setAt(null);
    setCursor(null);
    setCamera(null);
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

  function closeInspector() {
    setAt(null);
    mapRef.current?.querySelector('svg')?.focus();
  }

  function toggleLegend() {
    setLegendOpen((open) => {
      const next = !open;
      window.localStorage.setItem(LEGEND_KEY, next ? 'open' : 'closed');
      return next;
    });
  }

  function moveCursor(next: HexAt, columns: number, rows: number) {
    const hex: HexAt = [Math.max(0, Math.min(columns - 1, next[0])), Math.max(0, Math.min(rows - 1, next[1]))];
    setCursor(hex);
    if (!file) return;
    const tip = hexTip(file, hex, resources.talks);
    setCursorNote(tip ?? `Empty hex ${hex[0]}, ${hex[1]}`);
  }

  function zoomBy(factor: number) {
    const current = cameraRef.current;
    if (!current) return;
    setCamera({ ...current, width: clampZoom(current.width * factor) });
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
        // The address bar is not kept in sync with edits, so drop the stale link; Save makes a fresh one.
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        if ('errors' in result) {
          setLoadErrors(result.errors);
          setLoading(true);
        } else open(result.file);
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
      if (creating || loading || saving || !file) return;
      if (event.key === 'Escape' && !event.defaultPrevented) {
        const target = event.target as HTMLElement | null;
        const inField = target?.closest?.('input, textarea, select, [role="listbox"], [role="dialog"]');
        if (at && !inField) {
          event.preventDefault();
          closeInspector();
        }
        return;
      }
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
  }, [creating, loading, saving, file, past, future, at]);

  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const measure = () => setAspect(el.clientHeight / Math.max(1, el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const onWheel = (event: WheelEvent) => {
      const current = cameraRef.current;
      if (!current) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const height = current.width * (rect.height / Math.max(1, rect.width));
      const left = current.cx - current.width / 2;
      const top = current.cy - height / 2;
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(event.deltaY * 0.0015);
        const width = clampZoom(current.width * factor);
        const scale = width / current.width;
        const pointerX = left + ((event.clientX - rect.left) / rect.width) * current.width;
        const pointerY = top + ((event.clientY - rect.top) / rect.height) * height;
        const nextLeft = pointerX - (pointerX - left) * scale;
        const nextTop = pointerY - (pointerY - top) * scale;
        const nextHeight = width * (rect.height / Math.max(1, rect.width));
        setCamera({ width, cx: nextLeft + width / 2, cy: nextTop + nextHeight / 2 });
        return;
      }
      setCamera({
        width: current.width,
        cx: current.cx + event.deltaX * (current.width / rect.width),
        cy: current.cy + event.deltaY * (height / rect.height),
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener('wheel', onWheel);
    };
  }, [file]);

  // Frame the field once the map has a real size. A later pan or zoom is left alone.
  useLayoutEffect(() => {
    const el = mapRef.current;
    if (!file || camera || !el || el.clientWidth === 0) return;
    const image = fieldMap ? fieldImageRect(fieldMap.scale) : null;
    setCamera(fitCamera(file, image, el.clientHeight / el.clientWidth));
  }, [file, camera, fieldMap, aspect]);

  // Keep the selected hex out from under the inspector.
  useLayoutEffect(() => {
    const el = mapRef.current;
    const current = cameraRef.current;
    if (!at || !el || !current || el.clientWidth === 0) return;
    const { cx, cy } = hexPixel(at[0], at[1]);
    const height = current.width * (el.clientHeight / el.clientWidth);
    const phone = window.matchMedia('(max-width: 760px)').matches;
    if (phone) {
      const py = (cy - (current.cy - height / 2)) / height * el.clientHeight;
      const limit = el.clientHeight * 0.38;
      if (py > limit) setCamera({ ...current, cy: current.cy + (py - limit + 24) * (height / el.clientHeight) });
      return;
    }
    const px = (cx - (current.cx - current.width / 2)) / current.width * el.clientWidth;
    const limit = el.clientWidth - 430;
    if (px > limit) setCamera({ ...current, cx: current.cx + (px - limit + 48) * (current.width / el.clientWidth) });
  }, [at]);

  const fieldName = file ? resources.fields.find((row) => row.id === file.field)?.name : undefined;
  const identity = file ? `${fieldName ?? `Field ${file.field}`} (#${file.field})` : '';

  const fileActions = (
    <>
      <Button size="sm" startIcon={<FilePlusIcon size={16} />} onClick={() => setCreating(true)}>
        New
      </Button>
      <Button size="sm" startIcon={<FolderOpenIcon size={16} />} onClick={() => setLoading(true)}>
        Load
      </Button>
      <Button size="sm" disabled={!file} onClick={() => setSaving(true)}>
        Save
      </Button>
    </>
  );

  const toolbar = (
    <header className={styles.toolbar}>
      <div className={styles.title}>
        <CrystalIcon className={styles.titleIcon} />
        <h1 className={styles.titleText}>Field editor</h1>
      </div>
      {file && (
        <div className={styles.identity} title={identity}>
          <span className={styles.identityCaption}>Field</span>
          <span className={styles.identityName}>{fieldName ?? `Field ${file.field}`}</span>
          <span className={styles.identityId}>#{file.field}</span>
        </div>
      )}
      {narrow ? (
        <Menu
          trigger={
            <Button size="sm" startIcon={<FilePlusIcon size={16} />}>
              Field
            </Button>
          }
        >
          <MenuItem icon={<FilePlusIcon size={16} />} onClick={() => setCreating(true)}>New</MenuItem>
          <MenuItem icon={<FolderOpenIcon size={16} />} onClick={() => setLoading(true)}>Load</MenuItem>
          <MenuItem disabled={!file} onClick={() => setSaving(true)}>Save</MenuItem>
          <MenuItem disabled={!file || past.length === 0} onClick={undo}>Undo</MenuItem>
          <MenuItem disabled={!file || future.length === 0} onClick={redo}>Redo</MenuItem>
        </Menu>
      ) : (
        <div className={styles.group}>{fileActions}</div>
      )}
      {file && !narrow && (
        <div className={styles.group}>
          <IconButton size="sm" label="Undo" title="Undo (Ctrl+Z)" icon={<UndoIcon size={16} />} disabled={past.length === 0} onClick={undo} />
          <IconButton size="sm" label="Redo" title="Redo (Ctrl+Y)" icon={<RedoIcon size={16} />} disabled={future.length === 0} onClick={redo} />
        </div>
      )}
      <div className={styles.barEnd}>
        {resourceNote && (
          <span className={styles.chip} data-tone="danger" title={resourceNote}>
            Resources unavailable
          </span>
        )}
        {file && !resourceNote && problems.length === 0 && (
          <span className={styles.chip} data-tone="ok">
            <SuccessIcon size={16} />
            {file.sites.length} {file.sites.length === 1 ? 'site' : 'sites'}
          </span>
        )}
        {file && problems.length > 0 && (
          <Popover
            align="end"
            title={`${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}`}
            description="Choose one to show it on the map."
            trigger={
              <button type="button" className={styles.chip} data-tone="warning">
                <WarningIcon size={16} />
                {problems.length} {problems.length === 1 ? 'problem' : 'problems'}
              </button>
            }
          >
            <ul className={styles.problemList}>
              {problems.map((problem) => {
                const hex = problemHex(file, problem.message);
                return (
                  <li key={problem.message}>
                    <button
                      type="button"
                      disabled={!hex}
                      onClick={() => {
                        if (!hex) return;
                        setAt(hex);
                        setCursor(hex);
                      }}
                    >
                      {problem.message}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Popover>
        )}
        <span className="omnia-sr-only" role="status">
          {resourceNote
            || (file && problems.length
              ? `${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}: ${problems.map((problem) => problem.message).join('. ')}`
              : file
                ? `${file.sites.length} ${file.sites.length === 1 ? 'site' : 'sites'}, no problems found.`
                : '')}
        </span>
        <ThemeToggle />
      </div>
    </header>
  );

  const dialogs = (
    <>
      <NewField open={creating} onOpenChange={setCreating} resources={resources} onCreate={open} />
      <LoadField
        open={loading}
        notice={loadErrors}
        onOpenChange={(open) => {
          setLoading(open);
          if (!open) setLoadErrors([]);
        }}
        onOpen={(next) => {
          setLoading(false);
          open(next);
        }}
      />
      <SaveField open={saving} onOpenChange={setSaving} file={file} problems={saveProblems} />
    </>
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
  const shown = camera ?? fitCamera(file, image, aspect);
  const viewHeight = shown.width * aspect;
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
      <main className={styles.workspace}>
        <ThemeRoot theme="dark" className={fieldMap && showImage ? `${styles.map} ${styles.hasOverlay}` : styles.map}>
          <div
            ref={mapRef}
            className={styles.mapSurface}
            onPointerDown={(event) => {
              if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
              const current = cameraRef.current ?? shown;
              pan.current = { id: event.pointerId, x: event.clientX, y: event.clientY, cx: current.cx, cy: current.cy, moved: false };
            }}
            onPointerMove={(event) => {
              const drag = pan.current;
              const el = mapRef.current;
              if (!drag || drag.id !== event.pointerId || !el) return;
              const dx = event.clientX - drag.x;
              const dy = event.clientY - drag.y;
              if (!drag.moved) {
                if (Math.hypot(dx, dy) <= 4) return;
                // Capturing on press would retarget the click to this element, so a plain click never reaches the hex.
                drag.moved = true;
                event.currentTarget.setPointerCapture(event.pointerId);
              }
              const current = cameraRef.current ?? shown;
              const height = current.width * (el.clientHeight / Math.max(1, el.clientWidth));
              setCamera({
                width: current.width,
                cx: drag.cx - dx * (current.width / el.clientWidth),
                cy: drag.cy - dy * (height / el.clientHeight),
              });
            }}
            onPointerUp={(event) => {
              if (pan.current?.id === event.pointerId && pan.current.moved) {
                dragged.current = true;
                window.setTimeout(() => {
                  dragged.current = false;
                }, 0);
              }
              pan.current = null;
            }}
          >
            <svg
              tabIndex={0}
              role="application"
              aria-roledescription="map"
              aria-label={`Map of field ${file.field}. Arrow keys move between hexes. Enter selects the hex.`}
              viewBox={`${shown.cx - shown.width / 2} ${shown.cy - viewHeight / 2} ${shown.width} ${viewHeight}`}
              onKeyDown={(event) => {
                const key = event.key;
                if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Enter' && key !== ' ') return;
                event.preventDefault();
                const here = cursor ?? at ?? [1, 1];
                if (key === 'Enter' || key === ' ') {
                  setAt(here);
                  return;
                }
                const step: HexAt = key === 'ArrowUp' ? [here[0], here[1] - 1]
                  : key === 'ArrowDown' ? [here[0], here[1] + 1]
                    : key === 'ArrowLeft' ? [here[0] - 1, here[1]]
                      : [here[0] + 1, here[1]];
                moveCursor(step, columns, rows);
              }}
            >
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
                const portalHere = file.portal && file.portal.hex[0] === x && file.portal.hex[1] === y;
                const tint = occupied >= 0 ? KIND_TINT[file.sites[occupied].kind] : portalHere ? styles.tintPortal : undefined;
                const tip = occupied >= 0
                  ? hexTip(file, [x, y], resources.talks)
                  : portalHere
                    ? `Quest ${file.portal?.quest_id} · Portal`
                    : null;
                return (
                  <polygon
                    key={`${x}-${y}`}
                    points={hexOutline(x, y)}
                    className={hexClass(tint)}
                    onPointerEnter={() => setHover([x, y])}
                    onPointerLeave={() => setHover((current) => (current && current[0] === x && current[1] === y ? null : current))}
                    onClick={() => {
                      if (dragged.current) {
                        dragged.current = false;
                        return;
                      }
                      setAt([x, y]);
                      setCursor([x, y]);
                    }}
                  >
                    {tip && <title>{tip}</title>}
                  </polygon>
                );
              })}
              {[false, true].flatMap((eventPass) => Array.from({ length: columns * rows }, (_, index) => {
                const x = index % columns;
                const y = Math.floor(index / columns);
                const portalHere = file.portal && file.portal.hex[0] === x && file.portal.hex[1] === y;
                if (image && !onMap(x, y, image) && !portalHere) return null;
                const occupied = siteAt(file, [x, y]);
                const event = Boolean(portalHere) || (occupied >= 0 && file.sites[occupied].kind !== 'move');
                if (event !== eventPass) return null;
                const { cx, cy } = hexPixel(x, y);
                return (
                  <image
                    key={`frame-${x}-${y}`}
                    href={gameIconSrc(event ? 'hex-event' : 'hex-grid')}
                    x={cx - FRAME_CENTRE_X}
                    y={cy - FRAME_CENTRE_Y}
                    width={FRAME_WIDTH}
                    height={FRAME_HEIGHT}
                    preserveAspectRatio="none"
                    className={event ? styles.eventFrame : styles.gridFrame}
                  />
                );
              }))}
              {at && (() => {
                const { cx, cy } = hexPixel(at[0], at[1]);
                return (
                  <image
                    href={gameIconSrc('hex-selected')}
                    x={cx - FRAME_CENTRE_X}
                    y={cy - FRAME_CENTRE_Y}
                    width={FRAME_WIDTH}
                    height={FRAME_HEIGHT}
                    preserveAspectRatio="none"
                    className={styles.eventFrame}
                  />
                );
              })()}
              {file.portal && (() => {
                const { cx, cy } = hexPixel(file.portal.hex[0], file.portal.hex[1]);
                return (
                  <image
                    href={gameIconSrc('portal')}
                    x={cx - SPRITE_SIZE / 2}
                    y={cy - SPRITE_SIZE / 2}
                    width={SPRITE_SIZE}
                    height={SPRITE_SIZE}
                    className={styles.sprite}
                  >
                    <title>{`Quest ${file.portal.quest_id} · Portal`}</title>
                  </image>
                );
              })()}
              {arrows.map(({ index, x1, y1, x2, y2 }) => (
                <line key={`reveal-${index}`} className={styles.reveal} markerEnd="url(#reveal-arrow)" x1={x1} y1={y1} x2={x2} y2={y2} />
              ))}
              {file.sites.flatMap((site, index) => {
                if (site.kind !== 'move' || site.hexes.length === 0) return [];
                const points = site.hexes.map((hex) => hexPixel(hex[0], hex[1]));
                const first = points[0];
                return [
                  points.length > 1 && (
                    <polyline
                      key={`path-${index}`}
                      points={points.map(({ cx, cy }) => `${cx},${cy}`).join(' ')}
                      className={styles.movePath}
                    />
                  ),
                  <image
                    key={`move-${index}`}
                    href={gameIconSrc('move')}
                    x={first.cx - MOVE_STAR_SIZE / 2}
                    y={first.cy - MOVE_STAR_SIZE / 2}
                    width={MOVE_STAR_SIZE}
                    height={MOVE_STAR_SIZE}
                    className={styles.sprite}
                  />,
                ];
              })}
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
              {file.sites.map((site, index) => {
                const icon = siteIcon(site);
                if (!icon || site.kind === 'move') return null;
                const { cx, cy } = hexPixel(site.hex[0], site.hex[1]);
                return (
                  <image
                    key={`sprite-${index}`}
                    href={gameIconSrc(icon)}
                    x={cx - SPRITE_SIZE / 2}
                    y={cy - SPRITE_SIZE / 2}
                    width={SPRITE_SIZE}
                    height={SPRITE_SIZE}
                    className={styles.sprite}
                  />
                );
              })}
              {file.sites.flatMap((site, index) => {
                if (site.kind !== 'cutscene' && site.kind !== 'battle') return [];
                const { cx, cy } = hexPixel(site.hex[0], site.hex[1]);
                const badge = site.revealed_by === null ? 'start' : site.goal ? 'goal' : null;
                if (!badge) return [];
                return [
                  <image
                    key={`${badge}-${index}`}
                    href={gameIconSrc(badge)}
                    x={cx + HEX_HALF_WIDTH - BADGE_INSET - BADGE_SIZE}
                    y={cy - BADGE_SIZE / 2}
                    width={BADGE_SIZE}
                    height={BADGE_SIZE}
                    preserveAspectRatio="xMaxYMid meet"
                    className={styles.sprite}
                  >
                    <title>{badge === 'start' ? 'Start' : 'Goal'}</title>
                  </image>,
                ];
              })}
              {selectedSite >= 0 &&
                questHexes(file)
                  .filter((row) => row.site === selectedSite)
                  .map(({ hex: [x, y] }) => (
                    <polygon key={`outline-${x}-${y}`} points={hexOutline(x, y)} className={hexClass(styles.outline, styles.sameSite)} />
                  ))}
              {cursor && <polygon points={hexOutline(cursor[0], cursor[1])} className={hexClass(styles.outline, styles.cursor)} />}
              {hover && <polygon points={hexOutline(hover[0], hover[1])} className={hexClass(styles.outline, styles.hover)} />}
            </svg>
          </div>
          <div className={styles.legend}>
            <Button size="sm" aria-expanded={legendOpen} onClick={toggleLegend}>
              {legendOpen ? 'Hide legend' : 'Legend'}
            </Button>
            {legendOpen && (
              <div className={styles.legendBody} aria-label="Map legend">
                {LEGEND.map(({ icon, label }) => (
                  <span key={icon}>
                    <GameIcon name={icon} size={20} />
                    {label}
                  </span>
                ))}
                <span><GameIcon name="start" size={20} /> Start</span>
                <span><GameIcon name="goal" size={20} /> Goal</span>
              </div>
            )}
          </div>
          <div className={styles.mapControls}>
            {hover && (
              <div className={styles.readout} aria-hidden="true">
                <b>Hex {hover[0]}, {hover[1]}</b> {hoverText(file, hover, resources.talks)}
              </div>
            )}
            <Tooltip content={hideArrows ? 'Show reveal arrows' : 'Hide reveal arrows'}>
              <IconButton
                size="sm"
                label={hideArrows ? 'Show reveal arrows' : 'Hide reveal arrows'}
                aria-pressed={!hideArrows}
                icon={<ArrowsIcon size={16} />}
                variant={!hideArrows ? 'secondary' : 'ghost'}
                onClick={() => setHideArrows((hidden) => !hidden)}
              />
            </Tooltip>
            {fieldMap && (
              <Tooltip content={showImage ? 'Hide field image' : 'Show field image'}>
                <IconButton
                  size="sm"
                  label={showImage ? 'Hide field image' : 'Show field image'}
                  aria-pressed={showImage}
                  icon={<ImageIcon size={16} />}
                  variant={showImage ? 'secondary' : 'ghost'}
                  onClick={() => setShowImage((shown) => !shown)}
                />
              </Tooltip>
            )}
            <Tooltip content="Zoom out">
              <IconButton size="sm" label="Zoom out" icon={<ZoomOutIcon size={16} />} onClick={() => zoomBy(1.25)} />
            </Tooltip>
            <Tooltip content="Fit the field">
              <IconButton size="sm" label="Fit the field" icon={<FitIcon size={16} />} onClick={() => setCamera(fitCamera(file, image, aspect))} />
            </Tooltip>
            <Tooltip content="Zoom in">
              <IconButton size="sm" label="Zoom in" icon={<ZoomInIcon size={16} />} onClick={() => zoomBy(1 / 1.25)} />
            </Tooltip>
          </div>
          <span className="omnia-sr-only" role="status">{cursorNote}</span>
        </ThemeRoot>
        {at && (
          <aside className={styles.inspector} aria-label="Hex inspector">
            <SitePanel file={file} at={at} resources={resources} onChange={edit} onClose={closeInspector} />
          </aside>
        )}
      </main>
      {dialogs}
    </div>
  );
}
