import markdownIt from 'markdown-it'
import highlightjsPlugin from 'markdown-it-highlightjs'
import taskListsPlugin from 'markdown-it-task-lists'
import { parse, mustEnd } from 'yieldparser'
import { bitsy } from 'itsybitsy'
import mimeDB from 'mime-db'
// import { sha } from './sha';

const Status = {
  success: 200,
  created: 201,
  accepted: 202,
  noContent: 204,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  methodNotAllowed: 405,
  requestTimeout: 408,
  conflict: 409,
  unprocessableEntity: 422, // Validation failed
  tooManyRequests: 429,
}

const HeaderPresets = {
  ContentSecurityPolicy: {
    ExternalImagesAndMedia: [
      'Content-Security-Policy',
      "default-src 'self'; img-src *; media-src *; style-src 'self' 'unsafe-hashes' 'unsafe-inline' https://unpkg.com; script-src 'self'",
    ],
  },
}

const md = markdownIt({ html: true, linkify: true })
  .use(highlightjsPlugin)
  .use(taskListsPlugin)

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event))
})

function resJSON(json, status = Status.success, headers = new Headers()) {
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(json), { status, headers })
}
function resHTML(html, status = Status.success, headers = new Headers()) {
  headers.set('content-type', 'text/html;charset=utf-8')
  headers.set(...HeaderPresets.ContentSecurityPolicy.ExternalImagesAndMedia)
  return new Response(html, { status, headers })
}
function resPlainText(html, status = Status.success, headers = new Headers()) {
  headers.set('content-type', 'text/plain;charset=utf-8')
  return new Response(html, { status, headers })
}

/**
 *
 * @param {string} ownerName
 * @param {string} repoName
 * @param {string} tag
 * @param {string} path
 * @returns {Promise<string>}
 */
async function fetchGitHubRepoFile(
  ownerName,
  repoName,
  tag,
  path,
  transformRes = res => res.text(),
) {
  const sourceURL = `https://cdn.jsdelivr.net/gh/${ownerName}/${repoName}@${tag}/${path}`
  const sourceRes = await fetch(sourceURL)
  if (sourceRes.status >= 400) {
    throw resJSON({ sourceURL, error: true }, sourceRes.status)
  }

  return transformRes(sourceRes)
}

/**
 *
 * @param {string} ownerName
 * @param {string} repoName
 * @param {string} tag
 * @param {string} path
 * @returns {Promise<string[]>}
 */
async function listGitHubRepoFiles(ownerName, repoName, tag, path) {
  const sourceURL = `https://cdn.jsdelivr.net/gh/${ownerName}/${repoName}@${tag}/${path}`
  const sourceRes = await fetch(sourceURL)
  if (sourceRes.status >= 400) {
    throw resJSON({ sourceURL, error: true }, sourceRes.status)
  }

  const foundLinks = []
  const transformedRes = new HTMLRewriter()
    .on('tr td.name a', {
      element(el) {
        let path = el.getAttribute('href')
        if (path.startsWith('.')) return
        path = path.replace(/^\/gh\//, '')
        foundLinks.push(path)
      },
    })
    .transform(sourceRes)

  await transformedRes.text()

  return foundLinks
}

/**
 *
 * @param {string} ownerName
 * @param {string} repoName
 * @returns {Promise<Array<string>>}
 */
async function fetchGitHubRepoRefs(ownerName, repoName) {
  // See: https://github.com/isomorphic-git/isomorphic-git/blob/52b87bb05f6041f0a372ceab24bc55ee6c23d374/src/models/GitPktLine.js
  // See: https://github.com/isomorphic-git/isomorphic-git/blob/52b87bb05f6041f0a372ceab24bc55ee6c23d374/src/api/listServerRefs.js
  const url = `https://github.com/${ownerName}/${repoName}.git/info/refs?service=git-upload-pack`
  const res = await fetch(url)
  const arrayBuffer = await res.arrayBuffer()
  return function* decodePktLine() {
    let current = 0
    linesLoop: while (true) {
      const utf8Decoder = new TextDecoder('utf-8')
      const lengthHex = utf8Decoder.decode(
        arrayBuffer.slice(current, current + 4),
      )
      current += 4
      const length = parseInt(lengthHex, '16')
      if (length <= 1) {
        continue linesLoop
      }

      const bytes = arrayBuffer.slice(current, current + length - 4)
      if (bytes.byteLength === 0) break linesLoop
      current += length - 4

      const line = utf8Decoder.decode(bytes).trimEnd()
      const [oid, refRaw, ...attrs] = line.split(' ')
      if (oid === '#') {
        continue linesLoop
      }

      const [ref] = refRaw.split('\u0000')

      const r = { ref, oid }
      // r.attrs = attrs;
      for (const attr of attrs) {
        const [name, value] = attr.split(':')
        if (name === 'symref-target') {
          r.target = value
        } else if (name === 'peeled') {
          r.peeled = value
        } else if (name === 'symref=HEAD') {
          r.HEADRef = value
        } else if (name === 'object-format') {
          r.objectFormat = value
        } else if (name === 'agent') {
          r.agent = value
        }
      }
      yield Object.freeze(r)
    }
  }
}

function findHEADInRefs(refsIterable) {
  for (const line of refsIterable) {
    if (line.HEADRef) {
      return { sha: line.oid, HEADRef: line.HEADRef }
    }
    break
  }
  return null
}

function findBranchInRefs(refsIterable, branch) {
  for (const line of refsIterable) {
    if (line.ref === `refs/heads/${branch}`) {
      return { sha: line.oid }
    }
  }
  return null
}

/**
 *
 * @param {string} ownerName
 * @param {string} gistID
 * @param {string} path
 * @returns {Promise<string>}
 */
async function fetchGitHubGistFile(ownerName, gistID, path = '') {
  const sourceURL = `https://gist.githubusercontent.com/${ownerName}/${gistID}/raw/${path}`
  const sourceRes = await fetch(sourceURL)
  if (sourceRes.status >= 400) {
    throw resJSON({ sourceURL, error: true }, sourceRes.status)
  }

  return await sourceRes.text()
}

function renderStyledHTML(...contentHTML) {
  return [
    `<!doctype html>`,
    `<html lang=en>`,
    `<meta charset=utf-8>`,
    `<meta name=viewport content="width=device-width, initial-scale=1.0">`,
    // '<link href="https://unpkg.com/tailwindcss@^2/dist/tailwind.min.css" rel="stylesheet">',
    '<link href="https://unpkg.com/tailwindcss@^2/dist/base.min.css" rel="stylesheet">',
    '<link href="https://unpkg.com/highlight.js@11.2.0/styles/night-owl.css" rel="stylesheet">',
    `<style>
    body { max-width: 50rem; margin: auto; padding: 3rem 1rem; }
    a { color: #0060F2; }
    a:hover { text-decoration: underline; }
    p, ul, ol, pre, hr, blockquote, h1, h2, h3, h4, h5, h6 { margin-bottom: 1rem; }
    h1 { font-size: 2em; font-weight: 600; }
    h2 { font-size: 1.5em; font-weight: 600; }
    h3 { font-size: 1.25em; font-weight: 600; }
    h4 { font-size: 1em; font-weight: 600; }
    h5 { font-size: .875em; font-weight: 600; }
    h6 { font-size: .85em; font-weight: 600; }
    img { display: inline-block; }
    article ul { list-style: inside; }
    nav ul { display: flex; flex-wrap: wrap; }
    nav a { display: inline-block; padding: 0.5em; background: #f5f5f5; }
    nav a { border: 1px solid #e5e5e5; }
    nav li:not(:first-child) a { border-left: none; }
    nav a:hover { background: #e9e9e9; border-color: #ddd; }
    </style>`,
    ...contentHTML,
  ].join('\n')
}

/**
 *
 * @param {string} markdown
 * @param {string} path
 * @param {undefined | URLSearchParams | Map} options
 * @returns {string}
 */
function renderMarkdown(markdown, path, options) {
  const [, extension] = /.+[.]([a-z\d]+)$/.exec(path) || []
  if (extension && extension !== 'md') {
    markdown = [`~~~~~~~~~~~~${extension}`, markdown, '~~~~~~~~~~~~'].join('\n')
  }

  let html = md.render(markdown)
  
  if (options && options.has('theme')) {
    html = `<article>${html}</article>`
    html = renderStyledHTML(html)
  }

  return html
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
    const html = renderMarkdown(sourceText, 'readme.md', searchParams)
    return resHTML(html)
  }
}

function* GetHome() {
  yield '/'
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

    const sourceText = await fetchGitHubRepoFile(
      'RoyalIcing',
      'collected-press',
      HEAD.sha,
      'README.md',
    )
    const params = new Map([['theme', '']])
    const html = renderMarkdown(sourceText, 'readme.md', params)

    return resHTML(html)
  }
}

function* GetDoc() {
  yield '/docs/'
  const name = yield 'stream-what-is-known-upfront'
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
    const html = renderMarkdown(sourceText, path, params)

    return resHTML(html)
  }
}

const githubOwnerNameRegex = /^[-_a-z\d]+/i
const githubRepoNameRegex = /^[-_.a-z\d]+/i

let extensionToMimeType = null
function mimeTypeForPath(path) {
  if (!extensionToMimeType) {
    extensionToMimeType = new Map(
      bitsy(function*([mimeType, info]) {
        if (!Array.isArray(info.extensions)) return

        for (const extension of info.extensions) {
          yield [extension, mimeType]
        }
      }).iterate(Object.entries(mimeDB)),
    )
  }

  const [extension] = path.split('.').reverse()
  return extensionToMimeType.get(extension)
}

let textExtensions = null
function pathIsText(path) {
  if (!textExtensions) {
    textExtensions = new Set(
      bitsy(function*([mimeType, info]) {
        if (
          mimeType.startsWith('text/') ||
          mimeType === 'application/json' ||
          mimeType === 'application/javascript' ||
          mimeType.endsWith('+json') ||
          mimeType.endsWith('+xml') ||
          'charset' in info
        )
          if (info.extensions) {
            yield* info.extensions
          }
      }).iterate(Object.entries(mimeDB)),
    )
  }

  const [extension] = path.split('.').reverse()
  return textExtensions.has(extension)
}

function* RawGitHubRepoFile() {
  yield '/1/github/'
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
  yield '/1/github/'
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

function* renderGitHubBreadcrumbs(ownerName, repoName, sha, path) {
  yield `<nav><ul>`
  yield `<li><a href="/view/1/github/${ownerName}/${repoName}@${sha}/"><code>${'/'}</code></a>`
  yield* path
    .replace(/\//g, () => '/\u0000')
    .split('\u0000')
    .filter(s => s.length !== 0)
    .map(
      (component, index, components) =>
        `<li><a href="/view/1/github/${ownerName}/${repoName}@${sha}/${components
          .slice(0, index + 1)
          .join('')}"><code>${component}</code></a>`,
    )
  yield '</ul></nav>'
}

function* GetViewFile() {
  yield '/view'
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

  return async () => {
    if (fetchText) {
      const sourceText = await fetchText()
      // const params = new Map([['theme', '']])
      const html = renderStyledHTML(
        ...(ownerName !== undefined
          ? renderGitHubBreadcrumbs(ownerName, repoName, sha, path)
          : []),
        renderMarkdown(sourceText, path, new Map()),
      )
      return resHTML(html)
    } else if (fetchJSON) {
      const filePaths = await fetchJSON()
      const prefix = `${ownerName}/${repoName}@${sha}/`
      const html = renderStyledHTML(
        ...renderGitHubBreadcrumbs(ownerName, repoName, sha, path),
        '<article><ul>',
        ...filePaths.map(
          path =>
            `<li><a href="/view/1/github/${path}">${
              path.startsWith(prefix) ? path.slice(prefix.length) : path
            }</a>`,
        ),
        '</ul></article>',
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

function* GetViewRepo() {
  yield '/github/'
  const [ownerName] = yield githubOwnerNameRegex
  yield '/'
  const [repoName] = yield githubRepoNameRegex
  yield mustEnd

  return async ({ searchParams }) => {
    const refsGenerator = await fetchGitHubRepoRefs(ownerName, repoName)
    const headRef = findHEADInRefs(refsGenerator())
    const tagRefs = Array.from(
      bitsy(function*(ref) {
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

function* GetGitHubRepoFile() {
  const { fetchText, path } = yield RawGitHubRepoFile

  return async ({ searchParams }) => {
    const sourceText = await fetchText()
    const html = renderMarkdown(sourceText, path, searchParams)
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
      bitsy(function*(line) {
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
    const html = renderMarkdown(sourceText, '', searchParams)
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
    const html = renderMarkdown(sourceText, path, searchParams)
    return resHTML(html)
  }
}

const routes = [
  GetHealth,
  GetHome,
  GetDoc,
  GetGitHubGistFile,
  GetGitHubGist,
  GetGitHubRepoFile,
  GetViewFile,
  GetViewRepo,
  GetGitHubRepoRefs,
  GetGitHubRepoHEADRef,
  GetGitHubRepoHeadsRef,
  GetGitHubRepoTagRefs,
  GetGitHubRepoListFiles,
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
  const route = parse(url.pathname, Router())

  if (route.success) {
    return route.result(url).catch(error => {
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
