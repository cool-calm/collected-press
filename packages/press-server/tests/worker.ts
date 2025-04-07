import { sourceFromGitHubRepo } from '../src/index';

export default {
  async fetch(
    request: Request,
    _env: unknown,
    ctx: { waitUntil: (promise: Promise<unknown>) => void },
  ): Promise<Response> {
    const url = new URL(request.url);

    // const source = sourceFromGitHubRepo('cool-calm', 'collected-press')
    const source = sourceFromGitHubRepo('RoyalIcing', 'RoyalIcing');
    if (url.searchParams.has('stream')) {
      const [response, done] = await source.serveStreamedURL(url);
      ctx.waitUntil(done);
      return response;
    } else {
      return source.serveURL(url, {
        siteName: 'Royal Icing — Patrick George Wyndham Smith',
        baseURL: new URL('https://royalicing.com'),
      });
    }
  },
};
