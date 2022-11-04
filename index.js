import { parse, mustEnd } from 'yieldparser'
import { bitsy } from 'itsybitsy'
import { lookup as lookupMime } from 'mrmime'
import { Status, resJSON, resHTML, resPlainText, resCSSCached, resRedirect } from './src/http'
import { pair } from './src/data'
import { listViews, recordView } from './src/analytics'
import { githubOwnerNameRegex, githubRepoNameRegex } from './src/routes/github'
import { RoutesGitHubSite } from './src/routes/github-site'
import {
  fetchGitHubRepoFile,
  listGitHubRepoFiles,
  fetchGitHubRepoRefs,
  findHEADInRefs,
  findBranchInRefs,
  fetchGitHubGistFile,
} from './src/github'
import {
  lookupAsset, loadAssets, streamStyledMarkdown, renderStyledHTML, renderMarkdown, renderCodeAsMarkdown
} from './src/html'

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

// TODO: can we remove this?
function* GetAssets() {
  yield '/assets/'
  const [name] = yield /^[-a-z\d]+/i
  yield "/"
  const [sha256] = yield /^[a-z\d]{64}/i
  yield "."
  const extension = yield ["css"]

  return async () => {
    const asset = lookupAsset(name);
    if (asset) {
      return resCSSCached(asset.source)
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
  RoutesGitHubSite,
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
        // console.log("analytics", result);
      }));
    }

    await loadAssets()

    return Promise.resolve(route.result(url, request, event)).catch(error => {
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
