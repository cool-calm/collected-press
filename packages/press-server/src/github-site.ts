import { parse as parseYAML } from 'yaml'
import { parseISO, format as formatDate } from 'date-fns'
import h from 'vhtml'
import {
  fetchGitHubRepoFile,
  listGitHubRepoFiles,
  fetchGitHubRepoRefs,
  findHEADInRefs,
} from './github'
import {
  md,
  renderStyledHTML,
  setFrontMatterCallback,
} from './html'
import { resCSSCached, resHTML, resPlainText, Status } from './http'
import { loadAssets, lookupAsset } from './assets'

class RepoSource {
  constructor(public ownerName: string, public repoName: string) { }

  get profilePictureURL() {
    return new URL(`${this.ownerName}.png`, 'https://github.com/')
  }
}

async function adjustHTML(html: string) {
  const res = new HTMLRewriter()
    .on('a[href]', {
      element: (element) => {
        const rel = element.getAttribute('rel') || ''
        element.setAttribute('rel', `${rel} noopener`.trim())
      },
    })
    .transform(resHTML(html))
  return await res.text()
}

/**
 * Render Markdown page content
 * @param {string} markdown
 * @returns {Promise<string>}
 */
async function renderMarkdownStandalonePage(markdown, path, repoSource) {
  let html = md.render(markdown)
  const res = new HTMLRewriter()
    .on('h1', {
      element(element) { },
    })
    .transform(resHTML(html))
  return '<article>' + (await res.text()) + '</article>'
}

/**
 * Render Markdown page content
 * @param {string} markdown
 * @param {string} path
 * @param {RepoSource} repoSource
 * @returns {Promise<string>}
 */
async function renderMarkdownPrimaryArticle(markdown, path, repoSource) {
  let html = md.render(markdown)
  const res = new HTMLRewriter()
    .on('h1', {
      element(element) {
        element.tagName = 'a'
        element.setAttribute('href', path)
        element.before('<h1>', { html: true })

        if (repoSource.ownerName === 'RoyalIcing') {
          element.after(
            `<div style="margin-bottom: 3rem"><img src="${repoSource.profilePictureURL}" style="border-radius: 9999px; width: 36px; height: 36px; margin-right: 0.5em">Patrick Smith</div>`,
            { html: true },
          )
        }
        element.after('</h1>', { html: true })
      },
    })
    .transform(resHTML(html))
  return '<article>' + (await res.text()) + '</article>'
}

async function extractMarkdownMetadata(markdown) {
  let frontmatterSource = ''
  setFrontMatterCallback((receivedFrontmatter) => {
    frontmatterSource = receivedFrontmatter
  })
  // TODO: extract front-matter without having to parse the entire file as Markdown
  const html = md.render(markdown)
  let frontmatter: { title?: string; date?: string } = {}
  try {
    frontmatter = parseYAML(frontmatterSource) ?? {}
  } catch { }

  let title: string | null = null
  let date: Date | null = null

  if (typeof frontmatter.title === 'string') {
    title = frontmatter.title
  }

  if (typeof frontmatter.date === 'string') {
    try {
      date = parseISO(frontmatter.date)
    } catch { }
  }

  if (title === null) {
    let foundTitle = ''
    const res = new HTMLRewriter()
      .on('h1', {
        text(chunk) {
          foundTitle += chunk.text
        },
      })
      .transform(resHTML(html))
    await res.text()

    title = foundTitle.trim()
  }

  return {
    title,
    date,
  }
}

export async function serveRequest(ownerName: string, repoName: string, url: URL) {
  return await handleRequest(ownerName, repoName, url.pathname).catch(
    (err) => {
      if (err instanceof Response) {
        return err;
      }
      throw err;
    }
  );
}

export async function handleRequest(
  ownerName: string,
  repoName: string,
  path: string,
) {
  await loadAssets()

  if (path.startsWith('/assets/')) {
    const name = path.replace("/assets/", "").split('/')[0];
    const asset = lookupAsset(name);
    if (asset) {
      return resCSSCached(asset.source)
    } else {
      return resPlainText("Asset not found: " + path, Status.notFound)
    }
  }


  if (path.startsWith('/')) {
    path = path.substring(1);
  }

  const repoSource = new RepoSource(ownerName, repoName)

  async function getSHA() {
    const refsGenerator = await fetchGitHubRepoRefs(ownerName, repoName)
    const head = findHEADInRefs(refsGenerator())
    if (head == null) {
      throw Error('500 Content not found')
    }
    return head.sha
  }
  const headSHA = await getSHA()

  const headerPromise = fetchGitHubRepoFile(
    ownerName,
    repoName,
    headSHA,
    `_header.md`,
  )
    .then((markdown) => md.render(markdown))
    .then((html) => adjustHTML(html))
    .catch(() => null)

  async function getMainHTML() {
    if (path === '' || path === '/') {
      return await fetchGitHubRepoFile(
        ownerName,
        repoName,
        headSHA,
        'README.md',
      )
        .catch(
          () => 'Add a `README.md` file to your repo to create a home page.',
        )
        .then((markdown) =>
          renderMarkdownStandalonePage(markdown, "/", repoSource),
        )
    }

    const content =
      (await fetchGitHubRepoFile(
        ownerName,
        repoName,
        headSHA,
        `${path}/README.md`,
      ).catch(() => null)) ||
      (await fetchGitHubRepoFile(
        ownerName,
        repoName,
        headSHA,
        `${path}.md`,
      ).catch(() => null))

    if (typeof content === 'string') {
      return await renderMarkdownPrimaryArticle(content, path, repoSource)
    }

    const allFiles = await listGitHubRepoFiles(
      ownerName,
      repoName,
      sha,
      path + '/',
    ).catch(() => null)
    if (allFiles === null) {
      return `Not found. path: ${path} repo: ${ownerName}/${repoName}@${sha}`
    }

    allFiles.reverse()

    // There been as issue where we hit a CPU limit when trying to render dozens of posts at once.
    // TODO: could fetch myself to render every article in parallel each with their own time limit.

    const limit = 500
    const files = allFiles.slice(0, limit)

    const filenamePrefix = `${ownerName}/${repoName}@${sha}/${path}/`
    const articlesHTML = (
      await Promise.all(
        Array.from(
          function* () {
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
                // yield fetchGitHubRepoFile(ownerName, repoName, sha, path + '/' + name)
                //   .then(markdown => renderMarkdownSecondaryArticle(markdown, urlPath, repoSource))
                yield fetchGitHubRepoFile(
                  ownerName,
                  repoName,
                  sha,
                  path + '/' + name,
                )
                  .then((markdown) => extractMarkdownMetadata(markdown))
                  .then(({ title, date }) =>
                    h(
                      'li',
                      {},
                      date instanceof Date
                        ? h(
                          'span',
                          { 'data-date': true },
                          formatDate(date, 'MMMM dd, yyyy'),
                        )
                        : '',
                      h('a', { href: urlPath }, title),
                    ),
                  )
              }
            }
          }.call(void 0),
        ),
      )
    ).join('\n')
    return `<h1>Articles</h1>\n<nav><ul>${articlesHTML}</ul></nav>`
  }

  const sha = headSHA
  const files = await listGitHubRepoFiles(
    ownerName,
    repoName,
    sha,
    path === '' ? '' : path + '/',
  ).catch(() => [])

  const filenamePrefix = `${ownerName}/${repoName}@${sha}/`
  const navSource = Array.from(
    function* () {
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
    }.call(void 0),
  ).join('\n')

  const mainHTML = await getMainHTML()
  // const headerHTML = (await headerPromise) || `<nav>${md.render(navSource)}</nav>`
  const headerHTML = `<nav>${(await headerPromise) || md.render(navSource)
    }</nav>`
  // const footerHTML = `<footer>${navigator?.userAgent}</footer>`
  const footerHTML = ``

  const html = renderStyledHTML(
    '<header role=banner>',
    headerHTML,
    '</header>',
    '<main>',
    typeof mainHTML === 'string' ? mainHTML : 'Not found',
    '</main>',
    footerHTML,
  )

  return resHTML(html)
}

function getRequestIsDirect(request) {
  return request.headers.get('host') === 'collected.press'
}
