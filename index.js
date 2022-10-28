import markdownIt from 'markdown-it'
import highlightjsPlugin from 'markdown-it-highlightjs'
import taskListsPlugin from 'markdown-it-task-lists'
import frontMatterPlugin from 'markdown-it-front-matter'
import { parse, mustEnd } from 'yieldparser'
import { bitsy } from 'itsybitsy'
import { lookup as lookupMime } from 'mrmime'
import { Status, resJSON, resHTML, resPlainText, resCSSCached, resRedirect } from './src/http'
import { pair, into } from './src/data'
import { listViews, recordView } from './src/analytics'
import { encodeHex } from './src/encodings'
import {
  fetchGitHubRepoFile,
  listGitHubRepoFiles,
  fetchGitHubRepoRefs,
  findHEADInRefs,
  findBranchInRefs,
  fetchGitHubGistFile,
} from './src/github'
// import { sha } from './sha';

const md = markdownIt({ html: true, linkify: true })
  .use(highlightjsPlugin)
  .use(taskListsPlugin)
  .use(frontMatterPlugin, (frontMatter) => { })

/**
 *
 * @param {string} bucketName
 * @param {string} region
 * @param {string} mimeType
 * @param {string} sha
 * @returns {Promise<string>}
 */
async function fetchPublicS3Object(
  bucketName,
  region,
  mimeType,
  sha,
  transformRes = res => res.arrayBuffer().then(buffer => (new TextDecoder).decode(buffer)),
) {
  const sourceURL = `https://${bucketName}.s3.${region}.amazonaws.com/sha256/${mimeType}/${sha}`
  const sourceRes = await fetch(sourceURL)
  if (sourceRes.status >= 400) {
    throw resJSON({ sourceURL, error: true }, sourceRes.status)
  }

  return transformRes(sourceRes)
}

const styledHTMLHeadElements = () => [
  `<!doctype html>`,
  `<html lang=en>`,
  `<meta charset=utf-8>`,
  `<meta name=viewport content="width=device-width, initial-scale=1.0">`,
  // '<link href="https://unpkg.com/tailwindcss@^2/dist/tailwind.min.css" rel="stylesheet">',
  `<link href="/assets/tailwindcssbase/${assetSHA256("tailwindcssbase")}.css" rel="stylesheet">`,
  `<link href="/assets/night-owl/${assetSHA256("night-owl")}.css" rel="stylesheet">`,
  // '<link href="https://cdn.jsdelivr.net/npm/tailwindcss@^2/dist/base.min.css" rel="stylesheet">',
  // '<link href="https://cdn.jsdelivr.net/npm/highlight.js@11.2.0/styles/night-owl.css" rel="stylesheet">',
  '<script src="https://cdn.usefathom.com/script.js" data-site="NSVCNPFP" defer></script>',
  `<style>
:root { --_color_: #0060F2; --shade-color: rgba(0,0,0,0.1); --block-margin-bottom: 1rem; }
body { max-width: 50rem; margin: auto; padding: 3rem 1rem; }
a { color: var(--_color_); }
a:hover { text-decoration: underline; }
p, ul, ol, pre, hr, blockquote, h1, h2, h3, h4, h5, h6 { margin-bottom: var(--block-margin-bottom); }
pre { white-space: pre-wrap; white-space: break-spaces; }
h1 { font-size: 2em; font-weight: 600; }
h2 { font-size: 1.5em; font-weight: 600; }
h3 { font-size: 1.25em; font-weight: 600; }
h4 { font-size: 1em; font-weight: 600; }
h5 { font-size: .875em; font-weight: 600; }
h6 { font-size: .85em; font-weight: 600; }
img { display: inline-block; }
article ul { list-style: inside; }
article ol { list-style: decimal inside; }
article ul ul, article ul ol, article ol ul, article ol ol { --block-margin-bottom: 0; padding-left: 2em; }
article pre { font-size: 90%; }
article code:not(pre *) { font-size: 90%; background-color: var(--shade-color); padding: .175em .375em; border-radius: 0.2em; }
nav ul { display: flex; flex-wrap: wrap; }
nav a { display: inline-block; padding: 0.5em; background: #f5f5f5; }
nav a { border: 1px solid #e5e5e5; }
nav li:not(:first-child) a { border-left: none; }
nav a:hover { background: #e9e9e9; border-color: #ddd; }
form { padding: 1rem; }
form[method="GET"] { display: flex; gap: 1rem; align-items: center; }
form button { padding: 0.25rem 0.75rem; background-color: #0060F224; color: black; border: 0.5px solid var(--_color_); border-radius: 999px; }
footer[role=contentinfo] { margin-top: 3rem; padding-top: 1rem; border-top: 0.25px solid currentColor; font-size: 0.75rem; }
</style>`,
];

function renderStyledHTML(...contentHTML) {
  return [
    ...styledHTMLHeadElements(),
    "<body>",
    ...contentHTML,
  ].filter(Boolean).join('\n')
}

/**
 *
 * @param {string} markdown
 * @param {string} path
 * @param {string} mimeType
 * @param {undefined | URLSearchParams | Map} options
 * @returns {string}
 */
function renderMarkdown(markdown, path, mimeType, options) {
  const [, extension] = /.+[.]([a-z\d]+)$/.exec(path) || []
  if (extension && extension !== 'md' && mimeType !== 'text/markdown') {
    markdown = [`~~~~~~~~~~~~${extension}`, markdown, '~~~~~~~~~~~~'].join('\n')
  }

  let html = md.render(markdown)

  if (options && options.has('theme')) {
    html = renderStyledHTML('<article>', html, '</article>')
  }

  return html
}

function streamHTML(makeSource) {
  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  async function performWrite() {
    for await (const chunk of makeSource()) {
      await writer.write(encoder.encode(chunk));
    }
    await writer.close();
  }

  return [readable, performWrite()];
}

function streamStyledMarkdown(makeMarkdown) {
  return streamHTML(async function* () {
    yield* styledHTMLHeadElements();
    yield "<body><article>";
    yield md.render(await makeMarkdown());
    yield "</article>";
  })
}

/**
 *
 * @param {string} markdown
 * @param {string} type
 * @returns {string}
 */
function renderCodeAsMarkdown(markdown, type) {
  markdown = [`~~~~~~~~~~~~${type}`, markdown, '~~~~~~~~~~~~'].join('\n')
  return md.render(markdown)
}

function* GetHealth() {
  yield '/health'
  yield mustEnd

  return async ({ searchParams }) => {
    const sourceText = await fetchGitHubRepoFile(
      'RoyalIcing',
      'yieldmachine',
      '4478530fc40c3bf1208f8ea477f455ad34da308d',
      'readme.md',
    )
    const html = renderMarkdown(sourceText, 'readme.md', 'text/markdown', searchParams)
    return resHTML(html)
  }
}

function* GetGitHubSiteHome() {
  yield '/github/site/'
  const [ownerName] = yield githubOwnerNameRegex
  // yield '/'
  // const [repoName] = yield githubRepoNameRegex
  yield mustEnd

  async function getMarkdownSource() {
    const refsGenerator = await fetchGitHubRepoRefs(
      ownerName,
      ownerName,
    )
    const HEAD = findHEADInRefs(refsGenerator())
    if (HEAD == null) {
      throw Error("500 Content not found");
    }

    return await fetchGitHubRepoFile(
      ownerName,
      ownerName,
      HEAD.sha,
      'README.md',
    )
  }

  return async ({ searchParams }, request, event) => {
    if (searchParams.has('stream')) {
      const [stream, promise] = streamStyledMarkdown(getMarkdownSource);
      event.waitUntil(promise);
      return resHTML(stream);
    } else {
      const sourceText = await getMarkdownSource()
      const params = new Map([['theme', '']])
      const html = renderMarkdown(sourceText, 'readme.md', 'text/markdown', params)

      return resHTML(html)
    }
  }
}

function* GetHome() {
  yield '/'
  yield mustEnd

  async function getMarkdownSource() {
    const refsGenerator = await fetchGitHubRepoRefs(
      'RoyalIcing',
      'collected-press',
    )
    const HEAD = findHEADInRefs(refsGenerator())
    if (HEAD == null) {
      throw Error("500 Content not found");
    }

    return await fetchGitHubRepoFile(
      'RoyalIcing',
      'collected-press',
      HEAD.sha,
      'README.md',
    )
  }

  return async ({ searchParams }, request, event) => {
    if (searchParams.has('stream')) {
      const [stream, promise] = streamStyledMarkdown(getMarkdownSource);
      event.waitUntil(promise);
      return resHTML(stream);
    } else {
      const sourceText = await getMarkdownSource()
      const params = new Map([['theme', '']])
      const html = renderMarkdown(sourceText, 'readme.md', 'text/markdown', params)

      return resHTML(html)
    }
  }
}

function* GetDoc() {
  yield '/docs/'
  const name = yield ['api', 'stream-what-is-known-upfront']
  yield mustEnd

  return async ({ searchParams }) => {
    const refsGenerator = await fetchGitHubRepoRefs(
      'RoyalIcing',
      'collected-press',
    )
    const HEAD = findHEADInRefs(refsGenerator())
    if (HEAD == null) {
      return resHTML('<p>No content</p>', Status.notFound)
    }

    const path = `docs/${name}.md`
    const sourceText = await fetchGitHubRepoFile(
      'RoyalIcing',
      'collected-press',
      HEAD.sha,
      path,
    )
    const params = new Map([['theme', '']])
    const html = renderMarkdown(sourceText, path, 'text/markdown', params)

    return resHTML(html)
  }
}

const githubOwnerNameRegex = /^[-_a-z\d]+/i
const githubRepoNameRegex = /^[-_.a-z\d]+/i

function mimeTypeForPath(path) {
  if (path.endsWith('.ts')) {
    return 'application/typescript';
  }
  if (path.endsWith('.swift')) {
    return 'text/swift';
  }

  return lookupMime(path);
}

function pathIsText(path) {
  const mimeType = mimeTypeForPath(path);
  if (mimeType == null) {
    return false;
  }

  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/javascript' ||
    mimeType === 'application/typescript' ||
    mimeType.endsWith('+json') ||
    mimeType.endsWith('+xml')
  )
}

function* RawGitHubRepoFile() {
  yield '/github/'
  const [ownerName] = yield githubOwnerNameRegex
  yield '/'
  const [repoName] = yield githubRepoNameRegex
  yield '@'
  const [sha] = yield /^[a-z\d]{40}/i
  yield '/'
  const [path] = yield /^.*[^\/]$/

  async function fetchText() {
    return await fetchGitHubRepoFile(ownerName, repoName, sha, path, res =>
      res.text(),
    )
  }
  async function fetchBinary() {
    return await fetchGitHubRepoFile(ownerName, repoName, sha, path, res =>
      res.arrayBuffer(),
    )
  }

  const mimeType = mimeTypeForPath(path)

  return Object.freeze(
    Object.assign(
      { ownerName, repoName, sha, path, mimeType },
      pathIsText(path) ? { fetchText } : { fetchBinary },
    ),
  )
}

function* RawGitHubRepoList() {
  yield '/github/'
  const [ownerName] = yield githubOwnerNameRegex
  yield '/'
  const [repoName] = yield githubRepoNameRegex
  yield '@'
  const [sha] = yield /^[a-z\d]{40}/i
  // const [path] = yield [/^[\/]$/, /^[\/].+[\/]$/]
  // const [path] = yield /^[\/](.+[\/])?$/
  yield '/'
  const [path] = yield /^(.+[\/])?$/
  // console.log({path})

  async function fetchJSON() {
    return await listGitHubRepoFiles(ownerName, repoName, sha, path)
  }

  return { fetchJSON, ownerName, repoName, sha, path }
}

function* RawGitHubRepoRefs() {
  yield '/1/github/'
  const [ownerName] = yield githubOwnerNameRegex
  yield '/'
  const [repoName] = yield githubRepoNameRegex
  yield '/refs'

  async function fetchJSONIterable() {
    return await fetchGitHubRepoRefs(ownerName, repoName)
  }

  return { fetchJSONIterable }
}

function* RawGitHubGistFile() {
  yield '/1/github/gist/'
  const [ownerName] = yield githubOwnerNameRegex
  yield '/'
  const [gistID] = yield /^[a-z\d]+/i
  yield '/'
  const [path] = yield /^.+$/
  // const addMarkdownCodeWrapper = yield read('addMarkdownCodeWrapper', false)

  async function fetchText() {
    return await fetchGitHubGistFile(ownerName, gistID, path)
  }

  return { fetchText, path }
}

function* renderBreadcrumbs(prefix, path) {
  yield `<nav><ul>`
  // yield `<li><a href="${prefix}"><code>${'/'}</code></a>`
  yield* path
    .replace(/\//g, () => '/\u0000')
    .split('\u0000')
    .filter(s => s.length !== 0)
    .map(
      (component, index, components) =>
        `<li><a href="${prefix}/${components
          .slice(0, index + 1)
          .join('')}"><code>${component}</code></a>`,
    )
  yield '</ul></nav>'
}

function* renderGitHubBreadcrumbs(ownerName, repoName, sha, path) {
  yield `<nav><ul>`
  yield `<li><a href="/github/${ownerName}/${repoName}@${sha}/" style="font-weight: bold"><code>${ownerName + '/' + repoName}</code></a>`
  yield* path
    .replace(/\//g, () => '/\u0000')
    .split('\u0000')
    .filter(s => s.length !== 0)
    .map(
      (component, index, components) =>
        `<li><a href="/github/${ownerName}/${repoName}@${sha}/${components
          .slice(0, index + 1)
          .join('')}"><code>${component}</code></a>`,
    )
  yield '</ul></nav>'
}

function* GetViewFile() {
  // yield '/view'
  // yield write('addMarkdownCodeWrapper', true)
  const {
    fetchText,
    fetchBinary,
    fetchJSON,
    ownerName,
    repoName,
    sha,
    path,
    mimeType,
  } = yield [RawGitHubRepoFile, RawGitHubRepoList, RawGitHubGistFile]

  return async ({ searchParams }, { headers }) => {
    if (fetchText) {
      const sourceText = await fetchText()

      // When loaded by <img src="…">
      if ((headers.get('Accept') || '').includes('image/')) {
        const mimeType = mimeTypeForPath(path)
        if (mimeType.startsWith('image/')) {
          return new Response(sourceText, { headers: new Headers([pair('Content-Type', mimeType)]) })
        }
      }

      // const params = new Map([['theme', '']])
      const html = renderStyledHTML(
        ...(ownerName !== undefined
          ? renderGitHubBreadcrumbs(ownerName, repoName, sha, path)
          : []),
        '<article>',
        renderMarkdown(sourceText, path, mimeTypeForPath(path), new Map()),
        '</article>',
      )
      return resHTML(html)
    } else if (fetchJSON) {
      function renderPath(filePath) {
        if (searchParams.has('images') && filePath.endsWith('.svg')) {
          // const imageURL = `https://cdn.jsdelivr.net/gh/${ownerName}/${repoName}@${sha}/${path}`;
          const imageURL = `https://cdn.jsdelivr.net/gh/${filePath}`;
          return `<li><a href="/github/${filePath}"><img width="20" loading=lazy src="${imageURL}"> ${filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath
            }</a>`
        }

        return `<li><a href="/github/${filePath}">${filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath
          }</a>`
      }
      const filePaths = await fetchJSON()
      const prefix = `${ownerName}/${repoName}@${sha}/`
      const html = renderStyledHTML(
        ...renderGitHubBreadcrumbs(ownerName, repoName, sha, path),
        '<article><ul>',
        ...filePaths.map(renderPath),
        '</ul></article>',
        `<form method=GET>
        <div><input type=checkbox name=images id=images-checkbox ${searchParams.has('images') ? 'checked' : ''}> <label for=images-checkbox>Images</label></div>
        <button type=submit>Update</button>
        </form>`,
      )
      return resHTML(html)
    } else if (fetchBinary) {
      console.log("returning binary")
      return new Response(await fetchBinary(), {
        headers: new Headers({ 'Content-Type': mimeType }),
      })
    } else {
      return resPlainText('Unknown file type', 500)
    }
  }
}

function* GetViewRepoAbout() {
  yield '/github/about/'
  const [ownerName] = yield githubOwnerNameRegex
  yield '/'
  const [repoName] = yield githubRepoNameRegex
  yield mustEnd

  return async ({ searchParams }) => {
    const refsGenerator = await fetchGitHubRepoRefs(ownerName, repoName)
    const headRef = findHEADInRefs(refsGenerator())
    const tagRefs = Array.from(
      bitsy(function* (ref) {
        if (ref.ref.startsWith(`refs/tags/`) && !ref.ref.endsWith('^{}')) {
          yield ref
        }
      }).iterate(refsGenerator()),
    )
    const html = renderStyledHTML(
      // ...renderGitHubBreadcrumbs(ownerName, repoName, sha, path),
      '<article>',
      `<h1>${ownerName} / ${repoName}</h1>`,
      `<h2>Refs</h2>`,
      '<ul>',
      `<li>${headRef.HEADRef}: <a href="/view/1/github/${ownerName}/${repoName}@${headRef.sha}/">${headRef.sha}</a>`,
      ...Array.from(
        tagRefs,
        ref =>
          `<li>${ref.ref}: <a href="/view/1/github/${ownerName}/${repoName}@${ref.oid}/">${ref.oid}</a>`,
      ),
      '</ul>',
      '</article>',
    )
    return resHTML(html)
  }
}

function* GetRepoArticleDirectory() {
  yield '/github/'
  const [ownerName] = yield githubOwnerNameRegex
  yield '/'
  const [repoName] = yield githubRepoNameRegex
  // yield '@'
  // const [sha] = yield /^[a-z\d]{40}/i
  // yield '/'
  const [, path] = yield [/^[\/](.*)$/, /^()$/]

  return async () => {
    const refs = await fetchGitHubRepoRefs(ownerName, repoName)
    const headRef = findHEADInRefs(refs())
    if (headRef === null) {
      return resPlainText("No HEAD Ref found.", Status.notFound);
    }

    return resRedirect(`/github/${ownerName}/${repoName}@${headRef.sha}/${path}`)
  }
}

function* GetGitHubRepoFile() {
  yield '/1'
  const { fetchText, path } = yield RawGitHubRepoFile

  return async ({ searchParams }) => {
    const sourceText = await fetchText()
    const html = renderMarkdown(sourceText, path, mimeTypeForPath(path), searchParams)
    return resHTML(html)
  }
}

function* GetGitHubRepoRefs() {
  const { fetchJSONIterable } = yield RawGitHubRepoRefs
  yield mustEnd

  return async ({ searchParams }) => {
    const jsonGenerator = await fetchJSONIterable()
    const json = Array.from(jsonGenerator())
    return resJSON(json)
  }
}

function* GetGitHubRepoHeadsRef() {
  const { fetchJSONIterable } = yield RawGitHubRepoRefs
  yield '/heads/'
  const branch = yield ['master', 'main']
  yield mustEnd

  return async ({ searchParams }) => {
    const refsGenerator = await fetchJSONIterable()
    const info = findBranchInRefs(refsGenerator(), branch)
    if (info) {
      return resJSON(info)
    }

    return resJSON({ error: true }, Status.notFound)
  }
}

function* GetGitHubRepoHEADRef() {
  const { fetchJSONIterable } = yield RawGitHubRepoRefs
  yield '/HEAD'
  yield mustEnd

  return async ({ searchParams }) => {
    const jsonGenerator = await fetchJSONIterable()
    const HEAD = findHEADInRefs(jsonGenerator())
    if (HEAD) {
      return resJSON(HEAD)
    }

    return resJSON({ error: true }, Status.notFound)
  }
}

function* GetGitHubRepoTagRefs() {
  const { fetchJSONIterable } = yield RawGitHubRepoRefs
  yield '/tags'
  yield mustEnd

  return async ({ searchParams }) => {
    const jsonGenerator = await fetchJSONIterable()
    const json = Array.from(
      bitsy(function* (line) {
        if (line.ref.startsWith(`refs/tags/`)) {
          yield line
        }
      }).iterate(jsonGenerator()),
    )

    return resJSON(json)
  }
}

function* GetGitHubRepoListFiles() {
  yield '/list'
  const { fetchJSON, path } = yield RawGitHubRepoList

  return async () => {
    const json = await fetchJSON()
    return resJSON(json)
  }
}

function* GetGitHubGist() {
  yield '/1/github/gist/'
  const [ownerName] = yield githubOwnerNameRegex
  yield '/'
  const [gistID] = yield /^[a-z\d]+/i
  yield mustEnd

  return async ({ searchParams }) => {
    const sourceText = await fetchGitHubGistFile(ownerName, gistID)
    const html = renderMarkdown(sourceText, '', '', searchParams)
    return resHTML(html)
  }
}

function* GetGitHubGistFile() {
  yield '/1/github/gist/'
  const [ownerName] = yield githubOwnerNameRegex
  yield '/'
  const [gistID] = yield /^[a-z\d]+/i
  yield '/'
  const [path] = yield /^.+$/

  return async ({ searchParams }) => {
    let sourceText = await fetchGitHubGistFile(ownerName, gistID, path)
    const html = renderMarkdown(sourceText, path, mimeTypeForPath(path), searchParams)
    return resHTML(html)
  }
}

// https://example.com/1/s3/object/us-west-2/collected-workspaces/text/markdown/32b4f11a5fe3fd274ce2f0338d5d9af4e30c7e226f4923f510d43410119c0855
function* GetS3File() {
  yield '/1/s3/object/'
  const [region] = yield /^[-_a-z\d]+/i
  yield '/'
  const [bucketName] = yield /^[-_a-z\d]+/i
  yield '/sha256/'
  const mediaTypePrimary = yield ['text', 'image', 'application']
  yield '/'
  const [mediaTypeSecondary] = yield /^[-_a-z\d]+/i
  yield '/'
  const [sha] = yield /^[a-z\d]{64}/i
  yield mustEnd

  return async ({ searchParams }) => {
    console.log([region, bucketName, mediaTypePrimary, mediaTypeSecondary, sha])
    const mimeType = `${mediaTypePrimary}/${mediaTypeSecondary}`
    let sourceText = await fetchPublicS3Object(bucketName, region, mimeType, sha)
    if (mimeType === 'text/markdown') {
      const html = renderMarkdown(sourceText, '', mimeType, searchParams)
      return resHTML(html)
    } else {
      return new Response(sourceText, { headers: new Headers({ 'content-type': mimeType }) })
    }
  }
}

// https://example.com/1/s3/highlight/us-west-2/collected-workspaces/text/markdown/32b4f11a5fe3fd274ce2f0338d5d9af4e30c7e226f4923f510d43410119c0855
function* HighlightS3File() {
  yield '/1/s3/highlight/'
  const [region] = yield /^[-_a-z\d]+/i
  yield '/'
  const [bucketName] = yield /^[-_a-z\d]+/i
  yield '/sha256/'
  const mediaTypePrimary = yield ['text', 'application']
  yield '/'
  const [mediaTypeSecondary] = yield /^[-_a-z\d]+/i
  yield '/'
  const [sha] = yield /^[a-z\d]{64}/i
  yield mustEnd

  return async ({ searchParams }) => {
    const mimeType = `${mediaTypePrimary}/${mediaTypeSecondary}`
    let sourceText = await fetchPublicS3Object(bucketName, region, mimeType, sha)
    let html = renderCodeAsMarkdown(sourceText, mediaTypeSecondary)
    if (searchParams.get('theme') === '1') {
      html = renderStyledHTML(html)
    }
    return resHTML(html)
  }
}

function* GetAnalytics() {
  yield '/analytics'
  yield mustEnd

  return async () => {
    const views = await listViews();
    return resJSON(views);
  }
}

function* GetFavIcon() {
  yield '/favicon.ico'
  yield mustEnd

  // FIXME: this url doesn’t work
  return () => resRedirect('https://poster.littleeagle.workers.dev/1/poster?primary=+');
}

function jsonrpcReply(id, result) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    result
  })
}

/**
 * 
 * @param {Request} request
 * @param {(event: MessageEvent, send: (message: string) => void) => void} handler
 * @returns {Response}
 */
async function webSocketHandler(request, handler) {
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }

  const webSocketPair = new WebSocketPair();
  const client = webSocketPair[0], server = webSocketPair[1];

  server.addEventListener('message', event => {
    try {
      handler(event, server.send.bind(server))
    }
    finally { }
  });
  server.accept();

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

function* GetWebSocketAPI() {
  yield '/1/ws'
  yield mustEnd

  return async (url, request) => {
    return webSocketHandler(request, (event, send) => {
      const text = (typeof event.data === "string") ? event.data : (new TextDecoder()).decode(event.data)
      if (text === "Ping") {
        send("Pong")
      }
      else if (text[0] === "{") {
        const { id, method, params } = JSON.parse(text)
        if (method === "echo") {
          const source = params.source
          send(jsonrpcReply(id, { source }))
        } else if (method === "markdown") {
          const html = renderMarkdown(params.source, 'a.md', params.mediaType)
          // TODO: reply with content hash of source and result.
          send(jsonrpcReply(id, { html }))
        }
      }
    });
  }
}

function* GetAssets() {
  yield '/assets/'
  const [name] = yield /^[-a-z\d]+/i
  yield "/"
  const [sha256] = yield /^[a-z\d]{64}/i
  yield "."
  const extension = yield ["css"]

  return async () => {
    if (assets[name]) {
      return resCSSCached(assets[name].source)
    } else {
      return resPlainText("Asset not found.", Status.notFound)
    }
  }
}

const routes = [
  GetHealth,
  GetHome,
  GetDoc,
  // SITES
  GetGitHubSiteHome,
  // GITHUB
  GetGitHubGistFile,
  GetGitHubGist,
  GetGitHubRepoFile,
  GetViewRepoAbout,
  GetViewFile,
  GetRepoArticleDirectory,
  // GetRepoArticle,
  GetGitHubRepoRefs,
  GetGitHubRepoHEADRef,
  GetGitHubRepoHeadsRef,
  GetGitHubRepoTagRefs,
  GetGitHubRepoListFiles,
  // S3
  GetS3File,
  HighlightS3File,
  // Analytics
  GetAnalytics,
  GetFavIcon,
  GetWebSocketAPI,
  GetAssets
]

function* Router() {
  return yield routes
}

const assets = {
  tailwindcssbase: null,
  "night-owl": null
};

async function fetchAsset(url) {
  return await fetch(url)
    .then(res => res.text())
    .then(async (source) => ({
      source,
      sha256: await crypto.subtle.digest("SHA-256", (new TextEncoder()).encode(source))
    }))
}
async function loadAssets() {
  const tailwindcssbase = fetchAsset("https://cdn.jsdelivr.net/npm/tailwindcss@^2/dist/base.min.css")
  const nightOwl = fetchAsset("https://cdn.jsdelivr.net/npm/highlight.js@11.2.0/styles/night-owl.css")

  assets["tailwindcssbase"] ||= await tailwindcssbase;
  assets["night-owl"] ||= await nightOwl;
}
function assetSHA256(assetName) {
  return encodeHex(assets[assetName].sha256)
}

/**
 * Handle HTTP requests
 * @param {Request} request
 * @param {Event} event
 */
async function handleRequest(request, event) {
  const url = new URL(request.url)
  // console.log('URL', request.url, url)
  // if (url.protocol === 'http') {
  //   url.protocol = 'https'
  //   return resRedirect(Status.found, url)
  // }

  const route = parse(url.pathname, Router())

  if (route.success) {
    if (url.pathname !== '/analytics') {
      event.waitUntil(recordView(url.pathname).then(result => {
        console.log("analytics", result);
      }));
    }

    await loadAssets()

    return route.result(url, request, event).catch(error => {
      if (error instanceof Response) {
        return error
      } else {
        throw error
      }
    })
  } else {
    return resJSON(route, Status.notFound)
  }
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event))
})