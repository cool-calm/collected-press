import { unstable_dev } from 'wrangler';
import type { UnstableDevWorker } from 'wrangler';
// import { test, expect } from '@playwright/test';

// const { describe, beforeAll, afterAll } = test;
// const it = test;

describe('Worker', () => {
  let worker: UnstableDevWorker;

  beforeAll(async () => {
    worker = await unstable_dev(__dirname + '/worker.ts', {
      port: 4321,
      nodeCompat: true,
      experimental: { disableExperimentalWarning: true },
    });
  });

  afterAll(async () => {
    await worker.stop();
  });

  // TODO: these should load from this repo, not RoyalIcing/RoyalIcing
  it('can render /', async () => {
    const resp = await worker.fetch('/');
    const text = await resp.text();
    // expect(resp.headers.has('content-length')).toBe(true)
    expect(resp.headers.get('content-type')).toContain('text/html');
    expect(text).toMatch(/<!doctype html>/i);
    expect(text).toMatch(`<h1>Patrick George Wyndham Smith</h1>`);
  });

  it('can stream /', async () => {
    const resp = await worker.fetch('/?stream');
    expect(resp.headers.has('content-length')).toBe(false);
    expect(resp.headers.get('transfer-encoding')).toBe('chunked');
    expect(resp.headers.get('content-type')).toContain('text/html');
    const text = await resp.text();
    expect(text).toMatch(/<!doctype html>/i);
    expect(text).toMatch(`<h1>Patrick George Wyndham Smith</h1>`);
  });

  it('can render /2020', async () => {
    const resp = await worker.fetch('/2020');
    const text = await resp.text();
    expect(text).toMatch(`<h1>Articles</h1>`);
    expect(text).toMatch(`Vary variables not rules in CSS media queries`);
  });

  it('can render /blog', async () => {
    const resp = await worker.fetch('/blog');
    const text = await resp.text();
    expect(text).toMatch(`<h1>Articles</h1>`);
    expect(text).toMatch(`Vary variables not rules in CSS media queries`);
    expect(text).toMatch(`The Missing App Economy`);
    expect(text).toMatch(`November 24, 2020`);
    expect(text).toMatch(`React &amp; Hooks`);
  });

  it('can stream /blog', async () => {
    const resp = await worker.fetch('/blog?stream');
    expect(resp.headers.has('content-length')).toBe(false);
    expect(resp.headers.get('transfer-encoding')).toBe('chunked');
    const text = await resp.text();
    expect(text).toMatch(`<h1>Articles</h1>`);
    expect(text).toMatch(`Vary variables not rules in CSS media queries`);
    expect(text).toMatch(`The Missing App Economy`);
    expect(text).toMatch(`November 24, 2020`);
    expect(text).toMatch(`React &amp; Hooks`);

    const matches = Array.from(
      text.matchAll(/An Idea for Figures in Markdown/g),
    );
    expect(matches.length).toBe(1);

    const datetimes = Array.from(
      text.matchAll(/datetime="([\d-]+)"/g),
      (match) => match[1],
    );
    expect(datetimes.length).toBeGreaterThan(10);
    expect(datetimes[0]).toMatch(/20\d\d-\d\d-\d\d/);
    // They are in order newest to oldest.
    expect(datetimes.slice().sort().reverse()).toEqual(datetimes);
  });

  it('can render /2020/vary-variables-not-rules-in-css-media-queries', async () => {
    const resp = await worker.fetch(
      '/2020/vary-variables-not-rules-in-css-media-queries',
    );
    const text = await resp.text();
    expect(text).toMatch(`Vary variables not rules in CSS media queries`);
    expect(text).toMatch(`November 24, 2020</time>`);
  });

  it('can load /projects/hoverlytics.jpg', async () => {
    const resp = await worker.fetch('/projects/hoverlytics.jpg');
    const headers = Object.fromEntries(resp.headers);
    expect(headers['content-type']).toEqual('image/jpeg');
    expect(resp.headers.has('content-length')).toBe(true);
    const bytes = await resp.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it('can render 404 not found', async () => {
    const resp = await worker.fetch('/foo');
    const text = await resp.text();
    expect(resp.status).toBe(404);
    expect(text).toMatch(`<h1>Page not found.</h1>`);
  });

  it('can load /robots.txt', async () => {
    const resp = await worker.fetch('/robots.txt');
    const headers = Object.fromEntries(resp.headers);
    expect(headers['content-type']).toContain('text/plain');
    expect(resp.headers.has('content-length')).toBe(true);
    const text = await resp.text();
    expect(text).toContain('User-agent');
  });

  it('can load /resume.pdf', async () => {
    const resp = await worker.fetch('/resume.pdf');
    const headers = Object.fromEntries(resp.headers);
    expect(headers['content-type']).toContain('application/pdf');
    const text = await resp.text();
    expect(text).toMatch(/^%PDF/);
  });

  it('can load /fonts/728649/97244AA2CF2CCFB1E.css', async () => {
    const resp = await worker.fetch('/fonts/728649/97244AA2CF2CCFB1E.css');
    const headers = Object.fromEntries(resp.headers);
    expect(headers['content-type']).toContain('text/css');
    const text = await resp.text();
    expect(text).toContain('@font-face');
  });
});

// beforeAll(() => {
//     HTMLRewriter.prototype.transform = async function(this: HTMLRewriter, response: Response) {
//         const text = await response.arrayBuffer();
//         await this.write(new Uint8Array(text));
//         await this.end();
//     }
//     globalThis.HTMLRewriter = HTMLRewriter;
// })

// test("/", async () => {
//     const res = await serveRequest("RoyalIcing", "RoyalIcing", "");
//     expect(await res.text()).toEqual("dfgdfg");
// });
