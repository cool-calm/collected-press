import { mustEnd } from 'yieldparser'
import {
  githubOwnerNameRegex,
  githubRepoNameRegex,
  fetchGitHubRepoFile,
  listGitHubRepoFiles,
  fetchGitHubRepoRefs,
  findHEADInRefs
} from '../github'
import {
  md, renderStyledHTML
} from '../html'
import { resHTML } from '../http'

class RepoSource {
  constructor(ownerName, repoName) {
    this.ownerName = ownerName
    this.repoName = repoName
  }

  get profilePictureURL() {
    return new URL(`${this.ownerName}.png`, "https://github.com/")
  }
}

class GitHubSiteURLBuilder {
  static asRoot = Symbol();
  static asSubpath = Symbol();

  constructor(basePath) {
    this._basePath = basePath
  }

  static direct(ownerName, repoName) {
    return new GitHubSiteURLBuilder(`/github-site/${ownerName}/${repoName}/`)
  }

  static proxied(ownerName, repoName) {
    return new GitHubSiteURLBuilder("/")
  }

  buildPath(suffix) {
    return new URL(suffix, new URL(this._basePath, "https://example.org")).pathname;
  }

  home() {
    return this.buildPath("");
  }

  article(slug) {
    return this.buildPath(`./${slug}`);
  }

  async adjustHTML(html) {
    const res = new HTMLRewriter().on('a[href]', {
      element: (element) => {
        const rel = element.getAttribute('rel') || ''
        element.setAttribute('rel', `${rel} noopener`.trim())

        const href = element.getAttribute('href')


        let url = null;
        try {
          url = new URL(href)
          if (url.protocol) {
            return
          }
        }
        catch { }


        let newHref = this.buildPath(href);
        if (href === '/') {
          newHref = this.home();
        }

        element.setAttribute('href', newHref)

      }
    }).transform(resHTML(html));
    return await res.text();
  }
}

/**
 * Render Markdown page content
 * @param {string} markdown
 * @returns {Promise<string>}
 */
async function renderMarkdownStandalonePage(markdown, path, repoSource) {
  let html = md.render(markdown)
  const res = new HTMLRewriter().on('h1', {
    element(element) {}
  }).transform(resHTML(html));
  return '<article>' + await res.text() + '</article>';
}

/**
 * Render Markdown page content
 * @param {string} markdown
 * @returns {Promise<string>}
 */
async function renderMarkdownPrimaryArticle(markdown, path, repoSource) {
  let html = md.render(markdown)
  const res = new HTMLRewriter().on('h1', {
    element(element) {
      element.tagName = 'a';
      element.setAttribute('href', path)
      element.before('<h1>', { html: true })
      
      element.after(`<div style="margin-bottom: 3rem"><img src="${repoSource.profilePictureURL}" style="border-radius: 9999px; width: 36px; height: 36px; margin-right: 0.5em">Patrick Smith</div>`, { html: true })
      element.after('</h1>', { html: true })
    }
  }).transform(resHTML(html));
  return '<article>' + await res.text() + '</article>';
}

/**
 * Render Markdown page content, with top-level heading changed to an <h2>
 * @param {string} markdown
 * @returns {Promise<string>}
 */
async function renderMarkdownSecondaryArticle(markdown, path, repoSource) {
  let html = md.render(markdown)
  const res = new HTMLRewriter().on('h1', {
    element(element) {
      element.tagName = 'a';
      element.setAttribute('href', path)
      element.before('<h2>', { html: true })
      element.after('</h2>', { html: true })
    }
  }).transform(resHTML(html));

  return '<article>' + await res.text() + '</article>';
}

async function serveRequest(ownerName, repoName, path, urlBuilder, limit) {
  const repoSource = new RepoSource(ownerName, repoName)

  async function getSHA() {
    const refsGenerator = await fetchGitHubRepoRefs(
      ownerName,
      repoName,
    )
    const head = findHEADInRefs(refsGenerator())
    if (head == null) {
      throw Error("500 Content not found");
    }
    return head.sha;
  }
  const headSHA = await getSHA()

  const headerPromise = fetchGitHubRepoFile(
    ownerName,
    repoName,
    headSHA,
    `_header.md`,
  )
    .then(markdown => md.render(markdown))
    .then(html => urlBuilder.adjustHTML(html))
    .catch(() => null)

  async function getMainHTML() {
    console.log("getMarkdownSource", path)
    if (path === '') {
      return await fetchGitHubRepoFile(
        ownerName,
        repoName,
        headSHA,
        'README.md',
      ).catch(() => 'Add a `README.md` file to your repo to create a home page.')
        .then(markdown => renderMarkdownStandalonePage(markdown, urlBuilder.home(), repoSource))
    }

    const content = await fetchGitHubRepoFile(
      ownerName,
      repoName,
      headSHA,
      `${path}/README.md`,
    ).catch(() => null) || await fetchGitHubRepoFile(
      ownerName,
      repoName,
      headSHA,
      `${path}.md`,
    ).catch(() => null)

    if (typeof content === 'string') {
      return await renderMarkdownPrimaryArticle(content, path, repoSource)
    }

    const allFiles = await listGitHubRepoFiles(ownerName, repoName, sha, path + '/').catch(() => null)
    if (allFiles === null) {
      return `Not found. path: ${path} repo: ${ownerName}/${repoName}@${sha}`
    }

    console.log(allFiles)

    // There been as issue where we hit a CPU limit when trying to render dozens of posts at once.
    // TODO: could fetch myself to render every article in parallel each with their own time limit.

    const files = allFiles.slice(0, limit)

    const filenamePrefix = `${ownerName}/${repoName}@${sha}/${path}/`
    const articlesHTML = (await Promise.all(Array.from(function* () {
      for (const file of files) {
        if (file.endsWith('/')) {
          const name = file.slice(filenamePrefix.length, -1)
          if (path === '') {
            // FIXME: we should link to the site’s URL structure, not collected.press’s
            yield `- [${name}](/github-site/${ownerName}/${repoName}/${name})`
          } else {
            // FIXME: we should link to the site’s URL structure, not collected.press’s
            yield `- [${name}](/github-site/${ownerName}/${repoName}/${path}/${name})`
          }
        } else {
          const name = file.slice(filenamePrefix.length)
          const urlPath = (path + '/' + name).replace(/\.md$/, '')
          yield fetchGitHubRepoFile(ownerName, repoName, sha, path + '/' + name)
            .then(markdown => renderMarkdownSecondaryArticle(markdown, urlPath, repoSource))
        }
      }
    }.call()))).join('\n')
    return articlesHTML
  }

  const sha = headSHA
  const files = await listGitHubRepoFiles(ownerName, repoName, sha, path === '' ? '' : path + '/').catch(() => [])

  const filenamePrefix = `${ownerName}/${repoName}@${sha}/`
  const navSource = Array.from(function* () {
    for (const file of files) {
      const name = file.slice(filenamePrefix.length, -1)
      if (file.endsWith('/')) {
        if (path === '') {
          // FIXME: we should allow the site to specify the basename
          yield `- [${name}](/github-site/${ownerName}/${repoName}/${name})`
        } else {
          // FIXME: we should allow the site to specify the basename
          yield `- [${name}](/github-site/${ownerName}/${repoName}/${path}/${name})`
        }
      }
    }
  }.call()).join('\n')

  const mainHTML = await getMainHTML()
  // const headerHTML = (await headerPromise) || `<nav>${md.render(navSource)}</nav>`
  const headerHTML = `<nav>${await headerPromise || md.render(navSource)}</nav>`

  const html = renderStyledHTML(
    '<header role=banner>',
    headerHTML,
    '</header>',
    '<main>',
    typeof mainHTML === 'string' ? mainHTML : 'Not found',
    '</main>'
  )

  return resHTML(html)
}

function getRequestIsDirect(request) {
  return request.headers.get('host') === 'collected.press'
}

function* GetGitHubSiteHome() {
  yield '/github-site/'
  const [ownerName] = yield githubOwnerNameRegex
  yield '/'
  const [repoName] = yield githubRepoNameRegex
  yield [/^\/$/, mustEnd]

  return async ({ searchParams }, request, event) => {
    const isDirect = getRequestIsDirect(request)
    const urlBuilder = isDirect ? GitHubSiteURLBuilder.direct(ownerName, repoName) : GitHubSiteURLBuilder.proxied();
    return serveRequest(ownerName, repoName, '', urlBuilder, 10)
  }
}

function* GetGitHubSiteSubpath() {
  yield '/github-site/'
  const [ownerName] = yield githubOwnerNameRegex
  yield '/'
  const [repoName] = yield githubRepoNameRegex
  // const repoName = ownerName
  yield '/'
  const [path] = yield /^.*[^\/]$/
  yield mustEnd

  return async ({ searchParams }, request, event) => {
    const limit = parseInt(searchParams.get('limit') || '10')

    const isDirect = getRequestIsDirect(request)
    const urlBuilder = isDirect ? GitHubSiteURLBuilder.direct(ownerName, repoName) : GitHubSiteURLBuilder.proxied();
    return serveRequest(ownerName, repoName, path, urlBuilder, limit)
  }
}

export function* RoutesGitHubSite() {
  return yield [GetGitHubSiteHome, GetGitHubSiteSubpath]
}