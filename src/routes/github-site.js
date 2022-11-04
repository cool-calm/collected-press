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

/**
 * Render Markdown page content
 * @param {string} markdown
 * @returns {Promise<string>}
 */
async function renderMarkdownContent(markdown) {
  let html = md.render(markdown)
  const res = new HTMLRewriter().on('div', new ElementHandler()).transform(resHTML(html));
  return await res.text();
}

/**
 * Render Markdown page content
 * @param {string} markdown
 * @returns {Promise<string>}
 */
async function renderMarkdownPrimaryArticle(markdown) {
  let html = md.render(markdown)
  const res = new HTMLRewriter().on('h1', {
    element(element) {
      element.tagName = 'a';
      element.setAttribute('href', '#hello')
      element.before('<h1>', { html: true })
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
async function renderMarkdownSecondaryArticle(markdown) {
  let html = md.render(markdown)
  const res = new HTMLRewriter().on('h1', {
    element(element) {
      element.tagName = 'a';
      element.setAttribute('href', '#hello')
      element.before('<h2>', { html: true })
      element.after('</h2>', { html: true })
    }
  }).transform(resHTML(html));
  return '<article>' + await res.text() + '</article>';
}

async function serveRequest(ownerName, repoName, path) {
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

  async function getMainHTML() {
    console.log("getMarkdownSource", path)
    if (path === '') {
      return await fetchGitHubRepoFile(
        ownerName,
        repoName,
        headSHA,
        'README.md',
      ).catch(() => 'Add a `README.md` file to your repo to create a home page.')
        .then(renderMarkdownPrimaryArticle)
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
      return await renderMarkdownPrimaryArticle(content)
    }

    const files = await listGitHubRepoFiles(ownerName, repoName, sha, path + '/').catch(() => [])
    console.log(files)
    const filenamePrefix = `${ownerName}/${repoName}@${sha}/${path}/`
    const navSource = (await Promise.all(Array.from(function* () {
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
          if (true) {
            const name = file.slice(filenamePrefix.length)
            yield fetchGitHubRepoFile(ownerName, repoName, sha, path + '/' + name)
              .then(renderMarkdownSecondaryArticle)
          } else {
            const name = file.slice(filenamePrefix.length).replace(/\.md$/, '')
            yield `- [${name}](/github-site/${ownerName}/${repoName}/${path}/${name})`
          }
        }
      }
    }.call()))).join('\n')
    return navSource
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

  const html = renderStyledHTML('<header role=banner><nav>', md.render(navSource), '</nav></header>', '<main><article>', typeof mainHTML === 'string' ? mainHTML : 'Not found', '</article></main>')

  return resHTML(html)
}

function* GetGitHubSiteHome() {
  yield '/github-site/'
  const [ownerName] = yield githubOwnerNameRegex
  yield '/'
  const [repoName] = yield githubRepoNameRegex
  yield [/^\/$/, mustEnd]

  return async ({ searchParams }, request, event) => {
    return serveRequest(ownerName, repoName, '')
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
    return serveRequest(ownerName, repoName, path)
  }
}

export function* RoutesGitHubSite() {
  return yield [GetGitHubSiteHome, GetGitHubSiteSubpath]
}