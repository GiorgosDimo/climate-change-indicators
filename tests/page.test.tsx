import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let n = 0;
// The real globe needs WebGL; replace it with a stub that exposes what the page tells it.
vi.mock('next/dynamic', () => ({
  default: () =>
    function GlobeStub(p: {
      src: string | null; colormap: string; north: boolean; alpha: number;
      palette: { id: string; low: string; high: string }; format: (v: number, u: string) => string;
      values: boolean; pin: number[] | null; onPick: (c: [number, number]) => void;
      onSample: (s: { num: number | null; src: string; cell: string }) => void;
    }) {
      // Stand-ins for clicking the globe at 10.25°, 20.25° and for the globe reporting that pixel's value per frame.
      return (
        <div data-testid="globe" data-src={p.src ?? ''} data-colormap={p.colormap} data-north={String(p.north)}
          data-temp={p.format(300.15, 'K')} data-palette={p.palette.id} data-low={p.palette.low}
          data-values={String(p.values)} data-pin={p.pin?.join(',') ?? ''}>
          <button onClick={() => p.onPick([10.25, 20.25])}>click globe</button>
          <button onClick={() => p.onSample({ num: 270 + n++, src: p.src ?? '', cell: '10.25,20.25' })}>new frame value</button>
        </div>
      );
    },
}));
const { findNewEnds } = vi.hoisted(() => ({ findNewEnds: vi.fn(async () => ({}) as Record<string, string>) }));
vi.mock('@/lib/updates', async orig => ({ ...(await orig<typeof import('@/lib/updates')>()), findNewEnds }));

import Home from '@/app/page';

const CMAP_XML = `<ColorMaps><ColorMap units="K">
  <ColorMapEntry rgb="0,0,255" transparent="false" value="[200,210)"/>
  <ColorMapEntry rgb="255,0,0" transparent="false" value="[310,320)"/></ColorMap></ColorMaps>`;

beforeEach(() => {
  n = 0;
  localStorage.clear();
  findNewEnds.mockClear();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    url.includes('/colormaps/') ? new Response(CMAP_XML) : new Response('x', { headers: { 'content-type': 'image/png' } })));
});

const choose = async (user: ReturnType<typeof userEvent.setup>, combo: RegExp, option: RegExp) => {
  const box = screen.getByRole('combobox', { name: combo });
  await user.selectOptions(box, within(box).getByRole('option', { name: option }));
};
const frames = () => Number(screen.getByRole('slider', { name: 'Frame' }).getAttribute('max'));

describe('title, description, menu', () => {
  it('shows the title, the first indicator and its description, menu open by default', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Climate Change Indicators' })).toBeInTheDocument();
    expect(screen.getByText(/MERRA-2 reanalysis/)).toBeInTheDocument();
    expect(screen.getByText(/How to read it/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle menu' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapsing the menu hides the controls and shows the dataset name at the top', async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.click(screen.getByRole('button', { name: 'Toggle menu' }));
    expect(screen.queryByText(/How to read it/)).toBeNull();
    expect(screen.getByTestId('collapsed-name')).toHaveTextContent('Surface air temperature · Jan 1980');
    // the time controls live outside the menu, so they stay
    expect(screen.getByRole('slider', { name: 'Frame' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Toggle menu' }));
    expect(screen.getByText(/How to read it/)).toBeInTheDocument();
  });

  it('clicking the title toggles the menu, and the play tip stays outside the scroll area', async () => {
    const user = userEvent.setup();
    render(<Home />);
    expect(screen.getByText(/press Play below/).closest('[class*="MuiBox"][style], div')).not.toBe(screen.getByText(/How to read it/).parentElement);
    await user.click(screen.getByRole('heading', { name: 'Climate Change Indicators' }));
    expect(screen.queryByText(/How to read it/)).toBeNull();
    await user.click(screen.getByRole('heading', { name: 'Climate Change Indicators' }));
    expect(screen.getByText(/How to read it/)).toBeInTheDocument();
  });

  it('switching indicator swaps the description, layer and picker legend', async () => {
    const user = userEvent.setup();
    render(<Home />);
    await choose(user, /Climate indicator/, /Sea ice concentration/);
    expect(screen.getByText(/share of each ocean cell/)).toBeInTheDocument();
    expect(screen.getByTestId('globe')).toHaveAttribute('data-colormap', 'GHRSST_Sea_Ice_Concentration');
    expect(screen.getByTestId('globe')).toHaveAttribute('data-north', 'true');
    expect(screen.getByTestId('globe').getAttribute('data-src')).toContain('LAYERS=GHRSST_L4_MUR_Sea_Ice_Concentration');
  });

  it('formats temperatures as °C with °F in brackets', () => {
    render(<Home />);
    expect(screen.getByTestId('globe')).toHaveAttribute('data-temp', '27.0 °C (80.6 °F)');
  });
});

describe('dates by mode', () => {
  it('monthly shows "Mon YYYY" and no frame counter', () => {
    render(<Home />);
    expect(screen.getByTestId('frame-date')).toHaveTextContent(/^Jan 1980$/);
    expect(screen.queryByText(/\d+ \/ \d+/)).toBeNull();
  });

  it('yearly shows only the year, weekly the full dd/mm/yyyy', async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.click(screen.getByRole('button', { name: 'Yearly' }));
    expect(screen.getByTestId('frame-date')).toHaveTextContent(/^1980$/);
    await user.click(screen.getByRole('button', { name: 'Weekly' }));
    expect(screen.getByTestId('frame-date')).toHaveTextContent(/^\d\d\/\d\d\/\d{4}$/);
  });

  it('the period slider ends follow the mode', async () => {
    const user = userEvent.setup();
    render(<Home />);
    expect(screen.getAllByText('Jan 1980').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Aug 2026').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Yearly' }));
    expect(screen.getAllByText('2026').length).toBeGreaterThan(0);
  });

  it('weekly uses the daily layer and is disabled where none exists', async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.click(screen.getByRole('button', { name: 'Weekly' }));
    expect(screen.getByTestId('globe').getAttribute('data-src')).toContain('LAYERS=AIRS_L3_Surface_Air_Temperature_Daily_Day');
    await choose(user, /Climate indicator/, /Atmospheric CO/);
    expect(screen.getByRole('button', { name: 'Weekly' })).toBeDisabled();
    expect(screen.getByTestId('globe').getAttribute('data-src')).toContain('LAYERS=AIRS_L3_Carbon_Dioxide');
  });

  it('yearly has far fewer frames than monthly', async () => {
    const user = userEvent.setup();
    render(<Home />);
    const monthly = frames();
    await user.click(screen.getByRole('button', { name: 'Yearly' }));
    expect(frames()).toBeLessThan(monthly / 10);
  });
});

describe('time dock', () => {
  it('holds the time slider, play button and speed slider outside the menu', async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.click(screen.getByRole('button', { name: 'Toggle menu' })); // menu closed
    expect(screen.getByRole('slider', { name: 'Frame' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Speed' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Speed' })).toHaveValue('3'); // 3 fps default
  });

  it('suggests pressing play under the description', () => {
    render(<Home />);
    expect(screen.getByText(/press Play below/)).toBeInTheDocument();
  });

  it('play toggles to pause', async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });
});

describe('flag and value trend graph', () => {
  const frame = async (user: ReturnType<typeof userEvent.setup>, i: number) => {
    fireEvent.change(screen.getByRole('slider', { name: 'Frame' }), { target: { value: String(i) } });
    await user.click(screen.getByRole('button', { name: 'new frame value' }));
  };

  it('clicking plants the flag and asks to press Play; the graph appears after five frames', async () => {
    const user = userEvent.setup();
    render(<Home />);
    expect(screen.queryByTestId('trend-hint')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'click globe' }));
    expect(screen.getByTestId('globe')).toHaveAttribute('data-pin', '10.25,20.25');
    expect(screen.getByTestId('trend-hint')).toHaveTextContent('0 of 5 frames collected');
    for (const i of [0, 1, 2]) await frame(user, i);
    expect(screen.getByTestId('trend-hint')).toHaveTextContent('3 of 5');
    for (const i of [3, 4]) await frame(user, i);
    expect(screen.getByTestId('trend')).toHaveTextContent('10.25°, 20.25°');
    expect(screen.queryByTestId('trend-hint')).toBeNull();
  });

  it('closing removes the flag and the graph', async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.click(screen.getByRole('button', { name: 'click globe' }));
    await user.click(screen.getByRole('button', { name: 'Close graph' }));
    expect(screen.getByTestId('globe')).toHaveAttribute('data-pin', '');
    expect(screen.queryByTestId('trend-hint')).toBeNull();
  });

  it('the Read values button sits with the legend; turning it off removes the flag', async () => {
    const user = userEvent.setup();
    render(<Home />);
    const btn = screen.getByRole('button', { name: /Read values/ });
    expect(within((await screen.findByTestId('legend')).parentElement!).getByRole('button', { name: /Read values/ })).toBe(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'click globe' }));
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('globe')).toHaveAttribute('data-values', 'false');
    expect(screen.getByTestId('globe')).toHaveAttribute('data-pin', '');
  });
});

describe('legend and colours', () => {
  it('shows a legend with the layer\'s range (temperatures in °C and °F)', async () => {
    render(<Home />);
    expect(await screen.findByTestId('legend')).toBeInTheDocument();
    // fixture legend runs 200-210 K to 310-320 K, i.e. bin centres 205 K and 315 K
    expect(screen.getByTestId('legend-min').textContent).toMatch(/^-68\.\d °C \(-90\.\d °F\)$/);
    expect(screen.getByTestId('legend-max').textContent).toMatch(/^41\.\d °C \(107\.\d °F\)$/);
  });

  it('starts with the original colours and passes a chosen palette to the globe', async () => {
    const user = userEvent.setup();
    render(<Home />);
    expect(screen.getByTestId('globe')).toHaveAttribute('data-palette', 'original');
    await choose(user, /Colours/, /Viridis/);
    expect(screen.getByTestId('globe')).toHaveAttribute('data-palette', 'viridis');
  });

  it('custom palette offers two colour pickers', async () => {
    const user = userEvent.setup();
    render(<Home />);
    expect(screen.queryByLabelText('Low colour')).toBeNull();
    await choose(user, /Colours/, /Custom/);
    fireEvent.change(screen.getByLabelText('Low colour'), { target: { value: '#00ff00' } });
    expect(screen.getByLabelText('High colour')).toBeInTheDocument();
    expect(screen.getByTestId('globe')).toHaveAttribute('data-low', '#00ff00');
  });

  it('remembers the palette per indicator', async () => {
    const user = userEvent.setup();
    render(<Home />);
    await choose(user, /Colours/, /Grayscale/);
    await choose(user, /Climate indicator/, /Sea surface temperature/);
    expect(screen.getByTestId('globe')).toHaveAttribute('data-palette', 'original');
    await choose(user, /Climate indicator/, /Surface air temperature/);
    expect(screen.getByTestId('globe')).toHaveAttribute('data-palette', 'gray');
  });
});

describe('checking for new data', () => {
  it('has no weekly switch any more', () => {
    render(<Home />);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText(/Check for new data/)).toBeNull();
  });

  it('checks on every page open and reports what it found', async () => {
    findNewEnds.mockResolvedValueOnce({ sst: '2026-05-01' });
    render(<Home />);
    expect(await screen.findByText(/New data available: Sea surface temperature/)).toBeInTheDocument();
    expect(findNewEnds).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('cig.updates')!)).toEqual({ ends: { 'sst': '2026-05-01' } });
  });

  it('says nothing when there is no new data', async () => {
    render(<Home />);
    await waitFor(() => expect(findNewEnds).toHaveBeenCalled());
    expect(screen.queryByText(/New data available/)).toBeNull();
  });

  it('starts from what an earlier visit found, and that extends the period', async () => {
    localStorage.setItem('cig.updates', JSON.stringify({ ends: { 'air-temp': '2026-10-01' } }));
    render(<Home />);
    await waitFor(() => expect(screen.getAllByText('Oct 2026').length).toBeGreaterThan(0));
    expect(findNewEnds).toHaveBeenCalledWith(expect.anything(), { 'air-temp': '2026-10-01' });
  });
});
