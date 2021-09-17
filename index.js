import markdownIt from 'markdown-it'
import highlightjsPlugin from 'markdown-it-highlightjs'
import taskListsPlugin from 'markdown-it-task-lists'
import { parse, mustEnd } from 'yieldparser'
import { bitsy } from 'itsybitsy'

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
async function fetchGitHubRepoFile(ownerName, repoName, tag, path) {
  const sourceURL = `https://cdn.jsdelivr.net/gh/${ownerName}/${repoName}@${tag}/${path}`
  const sourceRes = await fetch(sourceURL)
  if (sourceRes.status >= 400) {
    throw resJSON({ sourceURL, error: true }, sourceRes.status)
  }

  return await sourceRes.text()
}

/**
 *
 * @param {string} ownerName
 * @param {string} repoName
 * @returns {Promise<Array<string>>}
 */
async function fetchGitHubRepoRefs(ownerName, repoName) {
  const url = `https://github.com/${ownerName}/${repoName}.git/info/refs?service=git-upload-pack`
  const res = await fetch(url)
  const arrayBuffer = await res.arrayBuffer()
  return function* decodePktLine() {
    let current = 0
    while (true) {
      const utf8Decoder = new TextDecoder('utf-8')
      const lengthHex = utf8Decoder.decode(
        arrayBuffer.slice(current, current + 4),
      )
      current += 4
      const length = parseInt(lengthHex, '16')
      if (length <= 1) continue

      const bytes = arrayBuffer.slice(current, current + length - 4)
      if (bytes.byteLength === 0) break
      const line = utf8Decoder.decode(bytes).trimEnd()
      const [oid, ref, ...attrs] = line.split(' ')
      const r = { ref, oid }
      for (const attr of attrs) {
        const [name, value] = attr.split(':')
        if (name === 'symref-target') {
          r.target = value
        } else if (name === 'peeled') {
          r.peeled = value
        }
      }
      yield Object.freeze(r)

      current += length - 4
    }
  }
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
    markdown = [
      `\`${path}\``,
      `~~~~~~~~~~~~${extension}`,
      markdown,
      '~~~~~~~~~~~~',
    ].join('\n')
  }

  let html = md.render(markdown)

  if (options && options.has('theme')) {
    html = [
      `<!doctype html>`,
      `<html lang=en>`,
      `<meta charset=utf-8>`,
      `<meta name=viewport content="width=device-width, initial-scale=1.0">`,
      // '<link href="https://unpkg.com/tailwindcss@^2/dist/tailwind.min.css" rel="stylesheet">',
      '<link href="https://unpkg.com/tailwindcss@^2/dist/base.min.css" rel="stylesheet">',
      '<link href="https://unpkg.com/highlight.js@11.2.0/styles/night-owl.css" rel="stylesheet">',
      `<style>
      body { max-width: 50rem; margin: auto; padding: 3rem 1rem; }
      p, ul, ol, pre, hr, blockquote, h1, h2, h3, h4, h5, h6 { margin-bottom: 1rem; }
      h1 { font-size: 2em; font-weight: 600; }
      h2 { font-size: 1.5em; font-weight: 600; }
      h3 { font-size: 1.25em; font-weight: 600; }
      h4 { font-size: 1em; font-weight: 600; }
      h5 { font-size: .875em; font-weight: 600; }
      h6 { font-size: .85em; font-weight: 600; }
      a { color: #0060F2; }
      a:hover { text-decoration: underline; }
      img { display: inline-block; }
      </style>`,
      html,
    ].join('\n')
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

const githubRepoNameRegex = /^[-_.a-z\d]+/i

function* RawGitHubRepoFile() {
  yield '/1/github/'
  const [ownerName] = yield /^[-_a-z\d]+/i
  yield '/'
  const [repoName] = yield githubRepoNameRegex
  yield '@'
  const [sha] = yield /^[a-z\d]{40}/i
  yield '/'
  const [path] = yield /^.+$/

  async function fetchText() {
    return await fetchGitHubRepoFile(ownerName, repoName, sha, path)
  }

  return { fetchText, path }
}

function* RawGitHubRepoRefs() {
  yield '/1/github/'
  const [ownerName] = yield /^[-_a-z\d]+/i
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
  const [ownerName] = yield /^[-_a-z\d]+/i
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

function* GetViewFile() {
  yield '/view'
  // yield write('addMarkdownCodeWrapper', true)
  const { fetchText, path } = yield [RawGitHubRepoFile, RawGitHubGistFile]

  return async () => {
    const sourceText = await fetchText()
    const params = new Map([['theme', '']])
    const html = renderMarkdown(sourceText, path, params)
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

function* GetGitHubRepoHeadRef() {
  const { fetchJSONIterable } = yield RawGitHubRepoRefs
  yield '/heads/'
  const branch = yield ['master', 'main']
  yield mustEnd

  return async ({ searchParams }) => {
    const jsonGenerator = await fetchJSONIterable()
    for (const line of jsonGenerator()) {
      if (line.ref === `refs/heads/${branch}`) {
        return resJSON({ sha: line.oid })
      }
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
    const json = Array.from(bitsy(function*(line) {
      if (line.ref.startsWith(`refs/tags/`)) {
        yield line
      }
    }).iterate(jsonGenerator()))
    
    return resJSON(json)
  }
}

function* GetGitHubGist() {
  yield '/1/github/gist/'
  const [ownerName] = yield /^[-_a-z\d]+/i
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
  const [ownerName] = yield /^[-_a-z\d]+/i
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
  GetGitHubGistFile,
  GetGitHubGist,
  GetGitHubRepoFile,
  GetViewFile,
  GetGitHubRepoRefs,
  GetGitHubRepoHeadRef,
  GetGitHubRepoTagRefs,
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
