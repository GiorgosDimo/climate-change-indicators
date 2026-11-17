import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decode, loadColormap, loadFrame, parseColormap } from '@/lib/frames';

const XML = `<ColorMaps>
  <ColorMap title="No Data"><Entries><ColorMapEntry rgb="0,0,0" transparent="true" nodata="true"/></Entries></ColorMap>
  <ColorMap title="Sea Surface Temperature" units="°C"><Entries>
    <ColorMapEntry rgb="0,0,255" transparent="false" sourceValue="[-INF,0.00)" value="[-INF,0.00)"/>
    <ColorMapEntry rgb="0,255,0" transparent="false" sourceValue="[10.00,20.00)" value="[10.00,20.00)"/>
    <ColorMapEntry rgb="255,0,0" transparent="false" sourceValue="[20.00,+INF)" value="[20.00,+INF)"/>
    <ColorMapEntry rgb="9,9,9" transparent="true" value="[5,6)"/>
  </Entries></ColorMap></ColorMaps>`;

describe('parseColormap', () => {
  const cm = parseColormap(XML);
  it('uses the data legend, not the No Data map, and skips transparent entries', () => {
    expect(cm.units).toBe('°C');
    expect(cm.bins).toHaveLength(3);
  });
  it('turns ranges into a value, treating open ends as their finite bound', () => {
    expect(cm.bins.map(b => b.value)).toEqual([0, 15, 20]);
  });
  it('prefers display-unit `value` over raw `sourceValue`', () => {
    const c = parseColormap('<ColorMaps><ColorMap units="ppbv"><ColorMapEntry rgb="1,2,3" sourceValue="[1.9e-06,2e-06)" value="[1900,2000)"/></ColorMap></ColorMaps>');
    expect(c.bins[0].value).toBe(1950);
  });
  it('copes with an empty document', () => {
    expect(parseColormap('<x/>').bins).toEqual([]);
  });
});

describe('decode', () => {
  const cm = parseColormap(XML);
  it('returns the value of the nearest legend colour', () => {
    expect(decode(cm, 0, 250, 3)).toBe(15);
  });
  it('returns null when no legend colour is close', () => {
    expect(decode(cm, 128, 128, 128)).toBeNull();
  });
});

describe('fetching', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads a frame once and reuses it', async () => {
    const fetchMock = vi.fn(async () => new Response('x', { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([loadFrame('http://t/once'), loadFrame('http://t/once')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('evicts the least recently used frame, not the oldest inserted one', async () => {
    const fetchMock = vi.fn(async () => new Response('x', { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetchMock);
    for (let i = 0; i < 40; i++) await loadFrame(`http://t/lru${i}`);
    await loadFrame('http://t/lru0');          // touch the oldest
    await loadFrame('http://t/lru-new');       // over capacity: lru1 goes, lru0 stays
    const calls = fetchMock.mock.calls.length;
    await loadFrame('http://t/lru0');
    expect(fetchMock.mock.calls.length).toBe(calls);        // still cached
    await loadFrame('http://t/lru1');
    expect(fetchMock.mock.calls.length).toBe(calls + 1);    // was evicted
  });
  it('does not revoke an evicted frame straight away (it may still be loading)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { headers: { 'content-type': 'image/png' } })));
    const revoke = URL.revokeObjectURL as ReturnType<typeof vi.fn>;
    revoke.mockClear();
    for (let i = 0; i < 42; i++) await loadFrame(`http://t/rev${i}`);
    expect(revoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(31_000);
    expect(revoke).toHaveBeenCalled();
    vi.useRealTimers();
  });
  it('rejects a non-image answer and lets the next call retry', async () => {
    const fetchMock = vi.fn(async () => new Response('<xml/>', { status: 200, headers: { 'content-type': 'text/xml' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadFrame('http://t/bad')).rejects.toThrow('no frame');
    await expect(loadFrame('http://t/bad')).rejects.toThrow('no frame');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('fails clearly when a colormap is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    await expect(loadColormap('Missing_Map')).rejects.toThrow('404');
  });
});
