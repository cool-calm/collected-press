import markdownIt from 'markdown-it'
import highlightjsPlugin from 'markdown-it-highlightjs'
import { parse, mustEnd, optional } from 'yieldparser'

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

const md = markdownIt({ html: true, linkify: true }).use(highlightjsPlugin)

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event))
})

function resJSON(json, status = Status.success, headers = new Headers()) {
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(json), { status, headers })
}
function resHTML(html, status = Status.success, headers = new Headers()) {
  headers.set('content-type', 'text/html;charset=utf-8')
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
 * @param {string} gistID
 * @returns {Promise<string>}
 */
async function fetchGitHubGistFile(ownerName, gistID) {
  const sourceURL = `https://gist.githubusercontent.com/${ownerName}/${gistID}/raw/`
  const sourceRes = await fetch(sourceURL)
  if (sourceRes.status >= 400) {
    throw resJSON({ sourceURL, error: true }, sourceRes.status)
  }

  return await sourceRes.text()
}

/**
 *
 * @param {string} markdown
 * @param {undefined | URLSearchParams} options
 * @returns {string}
 */
function renderMarkdown(markdown, options) {
  let html = md.render(markdown)

  if (options && options.has('theme')) {
    html = [
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
      a { color: #29f; }
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
    const html = renderMarkdown(sourceText, searchParams)
    return resHTML(html)
  }
}

function* GetGitHubFile() {
  yield '/1/github/'
  const [ownerName] = yield /^[-_a-z\d]+/i
  yield '/'
  const [repoName] = yield /^[-_a-z\d]+/i
  yield '@'
  const [sha] = yield /^[a-z\d]{40}/i
  yield '/'
  const [path] = yield /^.+$/

  return async ({ searchParams }) => {
    const sourceText = await fetchGitHubRepoFile(ownerName, repoName, sha, path)
    const html = renderMarkdown(sourceText, searchParams)
    return resHTML(html)
  }
}

function* GetGitHubGistFile() {
  yield '/1/github/gist/'
  const [ownerName] = yield /^[-_a-z\d]+/i
  yield '/'
  const [gistID] = yield /^[a-z\d]+/i
  yield mustEnd

  return async ({ searchParams }) => {
    // const options = new Map
    const sourceText = await fetchGitHubGistFile(ownerName, gistID)
    const html = renderMarkdown(sourceText, searchParams)
    return resHTML(html)
  }
}

function* Router() {
  return yield [GetHealth, GetGitHubGistFile, GetGitHubFile]
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
