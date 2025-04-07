import { parseISO, formatRFC7231 } from 'date-fns';
import h from 'vhtml';
import {
  fetchGitHubRepoFileResponse,
  listGitHubRepoFiles,
  fetchGitHubRepoRefs,
  findHEADInRefs,
} from './github';
import {
  defaultHTMLHead,
  FrontmatterProperties,
  md,
  renderMarkdown,
  streamText,
} from './html';
import { resHTML, resRSS2, Status, type StatusValue } from './http';

async function adjustHTML(html: string) {
  const res = new HTMLRewriter()
    .on('a[href]', {
      element: (element) => {
        const rel = element.getAttribute('rel') || '';
        element.setAttribute('rel', `${rel} noopener`.trim());
      },
    })
    .transform(resHTML(html));
  return await res.text();
}

async function renderMarkdownStandalonePage(markdown: string) {
  let html = md.render(markdown);
  const res = new HTMLRewriter()
    .on('h1', {
      element(element) {},
    })
    .transform(resHTML(html));
  return '<article>' + (await res.text()) + '</article>';
}

function gitHubProfilePictureURL(ownerName: string) {
  return new URL(`${ownerName}.png`, 'https://github.com/');
}

async function renderPrimaryArticle(
  html: string,
  path: string,
  repoSource: GitHubRepoSource,
  frontMatter: FrontmatterProperties,
): Promise<
  Readonly<{ id: string; title: string; html: string; sitePath: string }>
> {
  const res = new HTMLRewriter()
    .on('h1', {
      element(element) {
        Object.assign(element, { tagName: 'a' });
        element.setAttribute('href', `/${path}`);
        element.before('<h1>', { html: true });

        if (typeof frontMatter.date === 'string') {
          const date = parseISOAsUTC(frontMatter.date);
          element.after(
            h(
              'time',
              { datetime: frontMatter.date },
              date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }),
            ),
            { html: true },
          );
        }

        // TODO: make this a config option
        if (false && repoSource.ownerName === 'RoyalIcing') {
          element.after(
            `<div style="margin-bottom: 3rem"><img src="${gitHubProfilePictureURL(
              repoSource.ownerName,
            )}" style="border-radius: 9999px; width: 36px; height: 36px; margin-right: 0.5em">Patrick Smith</div>`,
            { html: true },
          );
        }
        element.after('</h1>', { html: true });
      },
    })
    .transform(resHTML(html));
  return Object.freeze({
    id: path,
    title: frontMatter.title ?? path,
    sitePath: path,
    html: '<article>' + (await res.text()) + '</article>',
  });
}

async function extractMarkdownMetadata(markdown: string) {
  const { html, frontMatter } = renderMarkdown(markdown);

  let title: string | undefined = undefined;
  let date: Date | undefined = undefined;
  let dateString: string | undefined = undefined;
  let includes: Array<string> | undefined = undefined;

  if (typeof frontMatter.title === 'string') {
    title = frontMatter.title;
  }

  if (typeof frontMatter.date === 'string') {
    dateString = frontMatter.date;
    try {
      date = parseISOAsUTC(frontMatter.date);
    } catch {}
  }

  if (title === undefined) {
    let foundTitle = '';

    // Regex to extract the title from the first <h1> tag
    const titleRegex = /<h1[^>]*>(.*?)<\/h1>/i;
    const match = html.match(titleRegex);
    if (match !== null && match[1]) {
      foundTitle = match[1];
    }

    // const res = new HTMLRewriter()
    //   .on('h1', {
    //     text(chunk) {
    //       foundTitle += chunk.text;
    //     },
    //   })
    //   .transform(resHTML(html));
    // await res.text();

    foundTitle = foundTitle.replace('&amp;', '&');
    title = foundTitle.trim();
  }

  if (Array.isArray(frontMatter.includes)) {
    includes = frontMatter.includes;
  }

  return Object.freeze({
    title,
    date,
    dateString,
    includes,
    html,
  });
}

export interface ServeRequestOptions {
  siteName?: string;
  baseURL?: URL;
  commitSHA?: string;
  treatAsStatic?: boolean;
  htmlHeaders?: Headers;
  fetchRepoContent?: (
    ownerName: string,
    repoName: string,
    tag: string,
    path: string,
  ) => Promise<Response>;
}

export interface GitHubRepoSource {
  readonly ownerName: string;
  readonly repoName: string;
  pathAppearsStatic(path: string): boolean;
  expectedMimeTypeForPath(path: string): string | undefined;
  fetchHeadSHA(): Promise<null | string>;
  serveURL(url: URL, options?: ServeRequestOptions): Promise<Response>;
  serveStreamedURL(
    url: URL,
    options?: ServeRequestOptions,
  ): Promise<[Response, Promise<void>]>;
}

function getPathFileExtension(path: string): string | undefined {
  return path.match(/\.([0-9a-z]+)$/)?.at(1);
}

export function sourceFromGitHubRepo(
  ownerName: string,
  repoName: string,
): GitHubRepoSource {
  return Object.freeze({
    ownerName: ownerName,
    repoName: repoName,
    pathAppearsStatic(path: string) {
      const extension = getPathFileExtension(path);

      // No extension is dynamic HTML
      if (typeof extension !== 'string') return false;

      // .rss is dynamic
      if (extension === 'rss') return false;

      return fileExtensionsToMimeTypes.has(extension);
    },
    expectedMimeTypeForPath(path: string): string | undefined {
      const extension = getPathFileExtension(path);
      if (extension == undefined) {
        return 'text/html;charset=utf-8';
      }
      return fileExtensionsToMimeTypes.get(extension);
    },
    async fetchHeadSHA() {
      const refsGenerator = await fetchGitHubRepoRefs(ownerName, repoName);
      const head = findHEADInRefs(refsGenerator());
      return head === null ? null : head.sha;
    },
    async serveURL(url: URL, options: ServeRequestOptions): Promise<Response> {
      return await handleRequest(this, url.pathname, options ?? {}).catch(
        (err) => {
          if (err instanceof Response) {
            return err;
          }
          throw err;
        },
      );
    },
    async serveStreamedURL(
      url: URL,
      options: ServeRequestOptions,
    ): Promise<[Response, Promise<void>]> {
      const result = await streamRequest(
        this,
        url.pathname,
        options ?? {},
      ).catch((err) => {
        if (err instanceof Response) {
          return err;
        }
        throw err;
      });

      if (result instanceof Response) {
        return [result, Promise.resolve()];
      } else {
        return result;
      }
    },
  });
}

export async function serveRequest(
  ownerName: string,
  repoName: string,
  url: URL,
  options?: ServeRequestOptions,
) {
  return sourceFromGitHubRepo(ownerName, repoName).serveURL(url, options);
}

const fileExtensionsToMimeTypes = new Map([
  ['txt', 'text/plain;charset=utf-8'],
  ['css', 'text/css;charset=utf-8'],
  ['svg', 'image/svg+xml'],
  ['rss', 'application/rss+xml'],
  // ['atom', 'application/atom+xml'],
  ['avif', 'image/avif'],
  ['webp', 'image/webp'],
  ['png', 'image/png'],
  ['apng', 'image/apng'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['ico', 'image/x-icon'],
  ['eot', 'application/vnd.ms-fontobject'],
  ['pdf', 'application/pdf'],
]);

export async function handleRequest(
  repoSource: GitHubRepoSource,
  path: string,
  options: ServeRequestOptions,
): Promise<Response> {
  if (path.startsWith('/')) {
    path = path.substring(1);
  }

  const treatAsStatic =
    options.treatAsStatic ?? repoSource.pathAppearsStatic(path);
  const mimeType = repoSource.expectedMimeTypeForPath(path);

  if (path.endsWith('.rss')) {
    path = path.slice(0, -4);
  }

  const { ownerName, repoName } = repoSource;
  const resolvedSHA = await (options.commitSHA ?? repoSource.fetchHeadSHA());
  if (resolvedSHA === null) {
    throw Error('No SHA or HEAD.');
  }
  const sha = resolvedSHA;

  const fetchRepoContent =
    options.fetchRepoContent ?? fetchGitHubRepoFileResponse;

  if (treatAsStatic) {
    return fetchRepoContent(ownerName, repoName, sha, path).then((res) =>
      res.clone(),
    );
  }

  function fetchRepoTextFile(path: string): Promise<string> {
    return fetchRepoContent(ownerName, repoName, sha, path).then((res) =>
      res.text(),
    );
  }

  function loadPartial(path: string): Promise<string | null> {
    const type: 'html' | 'markdown' = path.endsWith('.html')
      ? 'html'
      : 'markdown';

    return fetchRepoTextFile(path)
      .then((source) => (type === 'markdown' ? md.render(source) : source))
      .then((html) => adjustHTML(html))
      .catch(() => null);
  }

  const htmlHeadPromise = loadPartial('_head.html');
  const navPromise = loadPartial('_nav.md');
  const contentinfoPromise = loadPartial('_contentinfo.md');

  async function getMainContent(): Promise<
    ReadonlyArray<
      Readonly<{
        id: string;
        title: string;
        sitePath: string;
        html: string;
        shortHTML?: string;
        date?: Date;
      }>
    >
  > {
    if (path === '' || path === '/') {
      return await fetchRepoTextFile('README.md')
        .catch(
          () => 'Add a `README.md` file to your repo to create a home page.',
        )
        .then(renderMarkdownStandalonePage)
        .then((html) => [
          {
            id: 'home',
            title: 'Home',
            sitePath: '/',
            html,
          },
        ]);
    }

    // TODO: we don’t warn when both these files exist.
    const content: null | string = await Promise.any([
      fetchRepoTextFile(`${path}/README.md`),
      fetchRepoTextFile(`${path}.md`),
    ]).catch(() => null);

    let paths = [path];

    if (typeof content === 'string') {
      const { html, title, includes, date, dateString } =
        await extractMarkdownMetadata(content);

      // Is this a combination of other pages with their content, or a standalone page with its own content?
      if (Array.isArray(includes)) {
        paths = includes;
      } else {
        return await renderPrimaryArticle(html, path, repoSource, {
          title,
          date: dateString,
          includes,
        }).then((item) => [item]);
      }
    }

    type FileInfo = Readonly<{ filePath: string; urlPath: string }>;
    const allFiles: ReadonlyArray<FileInfo> = await Promise.all(
      Array.from(
        function* () {
          for (const lookupPath of paths) {
            yield listGitHubRepoFiles(
              ownerName,
              repoName,
              sha,
              lookupPath + '/',
            )
              .then((absolutePaths) => {
                const absolutePrefix = `${ownerName}/${repoName}@${sha}/`;
                return absolutePaths.map((absolutePath) => {
                  const filePath = absolutePath.replace(absolutePrefix, '');
                  return {
                    filePath,
                    urlPath: filePath.replace(/\.md$/, ''),
                  };
                }) as ReadonlyArray<FileInfo>;
              })
              .catch(() => [] as ReadonlyArray<FileInfo>);
          }
        }.call(undefined),
      ),
    ).then((a) => a.flat());

    if (allFiles.length === 0) {
      return [];
    }

    const limit = 500;
    let files = allFiles.slice(0, limit);

    files.reverse();

    return (
      await Promise.all(
        Array.from(
          function* () {
            for (const { filePath } of files) {
              if (!filePath.endsWith('.md')) {
                continue;
              }

              const urlPath = filePath.replace(/\.md$/, '');
              yield fetchRepoTextFile(filePath)
                .then((markdown) => extractMarkdownMetadata(markdown))
                .then(({ title, date, dateString, html }) => ({
                  id: filePath,
                  title: title ?? urlPath,
                  sitePath: urlPath,
                  date,
                  dateString,
                  sortKey:
                    date instanceof Date ? date.valueOf() : title ?? filePath,
                  html,
                  shortHTML: h(
                    'li',
                    {},
                    date instanceof Date
                      ? h(
                          'time',
                          { datetime: dateString ?? undefined },
                          date.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          }),
                        )
                      : '',
                    h('a', { href: urlPath }, title),
                  ),
                }));
            }
          }.call(undefined),
        ),
      )
    ).sort((a: any, b: any) => {
      if (typeof a.sortKey === 'number' && typeof b.sortKey === 'number') {
        return b.sortKey - a.sortKey;
      } else {
        return `${b.sortKey}`.localeCompare(`${a.sortKey}`);
      }
    });
    // return `<h1>Articles</h1>\n<nav><ul>${articlesHTML}</ul></nav>`;
  }

  // There is no test coverage for this.
  // I‘m not sure if it’s the experience I want either.
  async function fallbackNav() {
    const files = await listGitHubRepoFiles(
      ownerName,
      repoName,
      sha,
      path === '' ? '' : path + '/',
    ).catch(() => []);

    const filenamePrefix = `${ownerName}/${repoName}@${sha}/`;
    return Array.from(
      function* () {
        for (const file of files) {
          const name = file.slice(filenamePrefix.length, -1);
          if (file.endsWith('/')) {
            if (path === '') {
              // FIXME: we should allow the site to specify the basename
              yield `- [${name}](/github-site/${ownerName}/${repoName}/${name})`;
            } else {
              // FIXME: we should allow the site to specify the basename
              yield `- [${name}](/github-site/${ownerName}/${repoName}/${path}/${name})`;
            }
          }
        }
      }.call(void 0),
    ).join('\n');
  }

  const contentItems = await getMainContent();
  console.log(contentItems);

  if (mimeType === 'application/rss+xml') {
    const xml = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">`,
      `<channel>`,
      `<title>${escape(options.siteName ?? ownerName)}</title>`,
      `<language>en</language>`,
      `<generator>https://collected.press</generator>`,
      // `${files.length} items`,
      // `<link>https://www.dta.gov.au/</link>`,
      // `<description>Some description</description>`,
      contentItems.map((item) => [
        `<item>`,
        `<guid isPermaLink="false">${escape(item.id)}</guid>`,
        `<title>${escape(item.title)}</title>`,
        item.date
          ? `<pubDate>${escape(formatRFC7231(item.date))}</pubDate>`
          : '',
        `<link>${escape(
          options.baseURL
            ? new URL(item.sitePath, options.baseURL).toString()
            : item.sitePath,
        )}</link>`,
        `<dc:creator>${escape(ownerName)}</dc:creator>`,
        `<content:encoded>${escape(item.html)}</content:encoded>`,
        `</item>`,
      ]),
      `</channel>`,
      `</rss>`,
    ]
      .flat(3)
      .join('\n');
    return resRSS2(xml, Status.success);
  }

  // const mainResult = await getMainHTML();

  let mainHTML = '';
  let status: StatusValue = Status.success;

  if (contentItems.length === 0) {
    mainHTML = `<h1>Page not found.</h1>`;
    status = Status.notFound;
  } else if (contentItems.length === 1) {
    mainHTML = contentItems[0].html;
  } else {
    const articlesHTML = contentItems
      .map((item) => item.shortHTML ?? '')
      .join('\n');
    mainHTML = `<h1>Articles</h1>\n<nav><ul>${articlesHTML}</ul></nav>`;
  }

  const htmlHead = (await htmlHeadPromise) || defaultHTMLHead();
  // const headerHTML = (await headerPromise) || `<nav>${md.render(navSource)}</nav>`
  const headerHTML = `<nav>${
    (await navPromise) || md.render(await fallbackNav())
  }</nav>`;
  // const footerHTML = `<footer>${navigator?.userAgent}</footer>`
  const footerHTML = `<footer role="contentinfo">${
    (await contentinfoPromise) || ''
  }</footer>`;

  const html = [
    htmlHead,
    '<body>',
    '<header role=banner>',
    headerHTML,
    '</header>',
    '<main>',
    typeof mainHTML === 'string' ? mainHTML : 'Not found',
    '</main>',
    footerHTML,
  ].join('\n');

  return resHTML(html, status, options.htmlHeaders);
}

async function streamRequest(
  repoSource: GitHubRepoSource,
  path: string,
  options: ServeRequestOptions,
): Promise<Response | [Response, Promise<void>]> {
  const { ownerName, repoName } = repoSource;

  if (path.startsWith('/')) {
    path = path.substring(1);
  }

  const fetchRepoContent =
    options.fetchRepoContent ?? fetchGitHubRepoFileResponse;
  const treatAsStatic =
    options.treatAsStatic ?? repoSource.pathAppearsStatic(path);

  const resolvedSHA = await (options.commitSHA ?? repoSource.fetchHeadSHA());
  if (resolvedSHA === null) {
    throw Error('No SHA or HEAD.');
  }
  const sha = resolvedSHA;

  if (treatAsStatic) {
    return fetchRepoContent(ownerName, repoName, sha, path).then((res) =>
      res.clone(),
    );
  }

  function fetchRepoTextFile(path: string): Promise<string> {
    return fetchRepoContent(ownerName, repoName, sha, path).then((res) =>
      res.text(),
    );
  }

  function loadPartial(path: string): Promise<string | null> {
    const type: 'html' | 'markdown' = path.endsWith('.html')
      ? 'html'
      : 'markdown';

    return fetchRepoTextFile(path)
      .then((source) => (type === 'markdown' ? md.render(source) : source))
      .then((html) => adjustHTML(html))
      .catch(() => null);
  }

  const htmlHeadPromise = loadPartial('_head.html');
  const navPromise = loadPartial('_nav.md');
  const contentinfoPromise = loadPartial('_contentinfo.md');

  // TODO: make streamable
  async function* generateMainHTML(): AsyncGenerator<string, void, void> {
    if (path === '' || path === '/') {
      yield await fetchRepoTextFile('README.md')
        .catch(() => {
          throw 404;
        })
        .then(renderMarkdownStandalonePage);
      return;
    }

    // TODO: we don’t warn when both these files exist.
    const content: string = await Promise.any([
      fetchRepoTextFile(`${path}/README.md`),
      fetchRepoTextFile(`${path}.md`),
    ]).catch(() => {
      throw 404;
    });

    let paths = [path];

    const { html, frontMatter } = renderMarkdown(content);
    if (Array.isArray(frontMatter.includes)) {
      paths = frontMatter.includes;
    } else {
      yield await renderPrimaryArticle(
        html,
        path,
        repoSource,
        frontMatter,
      ).then((item) => item.html);
      return;
    }

    yield '<h1>Articles</h1>\n';
    yield '<nav><ul>\n';

    type FileInfo = { filePath: string; urlPath: string };

    for (const groupPath of paths) {
      const markdownPaths: ReadonlyArray<string> = await listGitHubRepoFiles(
        ownerName,
        repoName,
        sha,
        groupPath + '/',
      )
        .then((paths) => paths.filter((path) => path.endsWith('.md')))
        .catch(() => []);

      const postPromises = new Array<
        Promise<{ sortKey: string | number; html: string }>
      >();

      const posts: Array<{ sortKey: string | number; html: string }> =
        await Promise.all(
          markdownPaths.map((filePath) => {
            const urlPath = filePath.replace(/\.md$/, '');
            return fetchRepoTextFile(filePath)
              .then((markdown) => extractMarkdownMetadata(markdown))
              .then(({ title, date, dateString }) => ({
                sortKey:
                  date instanceof Date ? date.valueOf() : title ?? filePath,
                html: h(
                  'li',
                  {},
                  date instanceof Date
                    ? h(
                        'time',
                        { datetime: dateString ?? undefined },
                        date.toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        }),
                      )
                    : '',
                  h('a', { href: urlPath }, title),
                ),
              }));
          }),
        );

      yield posts
        .sort((a, b) => {
          if (typeof a.sortKey === 'number' && typeof b.sortKey === 'number') {
            return b.sortKey - a.sortKey;
          } else {
            return `${b.sortKey}`.localeCompare(`${a.sortKey}`);
          }
        })
        .map((a) => a.html)
        .join('\n');
    }

    yield `</ul></nav>`;
  }

  const [htmlStream, promise] = streamText(async function* () {
    yield (await htmlHeadPromise) || defaultHTMLHead();
    yield '<body>\n';
    yield '<header role=banner>\n';
    yield `<nav>${(await navPromise) || ''}</nav>\n`;
    yield '</header>\n';
    yield '<main>\n';

    try {
      for await (const postHTML of generateMainHTML()) {
        yield postHTML;
      }
    } catch (error) {
      if (typeof error === 'number') {
        yield '<h1>Content not found.</h1>';
      } else {
        yield '<h1>An error occurred.</h1>';
      }
    }

    yield '\n';
    yield `<footer role="contentinfo">${
      (await contentinfoPromise) || ''
    }</footer>\n`;
  });

  // FIXME: assumes this page is valid.
  const status = Status.success;
  return [resHTML(htmlStream, status, options.htmlHeaders), promise];
}

function parseISOAsUTC(isoString: string): Date {
  if (/Z/i.test(isoString)) {
    return parseISO(isoString);
  }

  if (/T/i.test(isoString)) {
    return parseISO(isoString + 'Z');
  }

  return parseISO(isoString + 'T00:00:00Z');
}

function escape(input: string): string {
  const lookupTable: { [char: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return input.replace(/[&<>"']/g, (char) => lookupTable[char]);
}

// function unescape(input: string): string {
//   const lookupTable: { [char: string]: string } = {
//     '&amp;': '&',
//     '&lt;': '<',
//     '&gt;': '>',
//     '&quot;': '"',
//     '&#39;': "'",
//   };

//   return input.replace(/[&<>"']/g, (char) => lookupTable[char]);
// }
