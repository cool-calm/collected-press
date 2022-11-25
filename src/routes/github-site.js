import { mustEnd } from "yieldparser"
import {
  githubOwnerNameRegex,
  githubRepoNameRegex,
} from '../../packages/press-server/src/github.js'
import {
  serveRequest
} from '../../packages/press-server/src/github-site.js'

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
    return serveRequest(ownerName, repoName, '', urlBuilder, 100)
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
    const limit = parseInt(searchParams.get('limit') || '100')

    const isDirect = getRequestIsDirect(request)
    const urlBuilder = isDirect ? GitHubSiteURLBuilder.direct(ownerName, repoName) : GitHubSiteURLBuilder.proxied();
    return serveRequest(ownerName, repoName, path, urlBuilder, limit)
  }
}

export function* RoutesGitHubSite() {
  return yield [GetGitHubSiteHome, GetGitHubSiteSubpath]
}