'use client';

import { useEffect, useMemo, useState } from 'react';
import { TimelineGlobe, loadCatalog, type Catalog } from 'timeline-globe';
import 'timeline-globe/style.css';
import { DEFAULT_CATALOG, withEnds } from './gibs';
import { findNewEnds, loadState, saveState } from './updates';

/** The demo app: the NASA GIBS catalog (or one from ?catalog=<url>), plus a check for newly published months. */
export default function Home() {
  const [custom, setCustom] = useState<Catalog | null>(null);
  const [ends, setEnds] = useState<Record<string, string>>({});
  const [snack, setSnack] = useState<string | null>(null);

  // ?catalog=<url> swaps the built-in GIBS catalog for one loaded from a JSON file.
  useEffect(() => {
    const url = new URLSearchParams(window.location.search).get('catalog');
    if (!url) return;
    loadCatalog(url).then(setCustom).catch(e => setSnack(`Could not load the catalog: ${e.message}`));
  }, []);

  // Every time the app opens, look for months published since the last visit (built-in catalog only).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('catalog')) return;
    const known = loadState().ends;
    setEnds(known);
    findNewEnds(DEFAULT_CATALOG.indicators, known).then(found => {
      const names = Object.keys(found).map(id => DEFAULT_CATALOG.indicators.find(i => i.id === id)!.name);
      if (!names.length) return;
      const next = { ...known, ...found };
      saveState({ ends: next });
      setEnds(next);
      setSnack(`New data available: ${names.join(', ')}`);
    });
  }, []);

  useEffect(() => {
    if (!snack) return;
    const t = setTimeout(() => setSnack(null), 8000);
    return () => clearTimeout(t);
  }, [snack]);

  const catalog = useMemo(() => custom ?? withEnds(DEFAULT_CATALOG, ends), [custom, ends]);
  useEffect(() => { document.title = catalog.title; }, [catalog.title]);

  return (
    <main className="app-root">
      {/* a new key remounts the viewer so it starts on the loaded catalog's first dataset */}
      <TimelineGlobe key={custom ? 'custom' : 'default'} catalog={catalog} />
      {snack && (
        <div className="snack" role="status">
          <span>{snack}</span>
          <button aria-label="Close" onClick={() => setSnack(null)}>×</button>
        </div>
      )}
    </main>
  );
}
