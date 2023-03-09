import { unstable_dev } from 'wrangler'
import type { UnstableDevWorker } from 'wrangler'

describe('Worker', () => {
  let worker: UnstableDevWorker

  beforeAll(async () => {
    worker = await unstable_dev(
      __dirname + '/worker.ts',
      { experimental: { disableExperimentalWarning: true } },
    )
  })

  afterAll(async () => {
    await worker.stop()
  })

  it('should render /', async () => {
    const resp = await worker.fetch('/')
    const text = await resp.text()
    expect(text).toMatch(
      `<h1>Patrick Smith — Product Developer &amp; Design Engineer</h1>`,
    )
  })

  it('should render /2020', async () => {
    const resp = await worker.fetch('/2020')
    const text = await resp.text()
    expect(text).toMatch(`<h1>Articles</h1>`)
  })

  it('should render /2020/vary-variables-not-rules-in-css-media-queries', async () => {
    const resp = await worker.fetch('/2020/vary-variables-not-rules-in-css-media-queries')
    const text = await resp.text()
    expect(text).toMatch(`Vary variables not rules in CSS media queries`)
  })
})

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
