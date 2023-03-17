import { parseISO } from 'date-fns'
import h from 'vhtml'
import {
  fetchGitHubRepoFileResponse,
  fetchGitHubRepoTextFile,
  listGitHubRepoFiles,
  fetchGitHubRepoRefs,
  findHEADInRefs,
} from './github'
import {
  defaultHTMLHead,
  FrontmatterProperties,
  md,
  renderMarkdown,
} from './html'
import { resCSSCached, resHTML, resPlainText, Status } from './http'
import { loadAssetsIfNeeded, lookupAsset } from './assets'

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
async function renderMarkdownStandalonePage(markdown: string, path: string, repoSource: RepoSource) {
  let html = md.render(markdown)
  const res = new HTMLRewriter()
    .on('h1', {
      element(element) { },
    })
    .transform(resHTML(html))
  return '<article>' + (await res.text()) + '</article>'
}

async function renderPrimaryArticle(html: string, path: string, repoSource: RepoSource, frontMatter: FrontmatterProperties): Promise<string> {
  const res = new HTMLRewriter()
    .on('h1', {
      element(element) {
        element.tagName = 'a'
        element.setAttribute('href', path)
        element.before('<h1>', { html: true })

        if (typeof frontMatter.date === "string") {
          const date = parseISO(frontMatter.date)
          element.after(
            h(
              'time',
              { 'datetime': frontMatter.date },
              date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            ),
            { html: true },
          )
        }

        if (false && repoSource.ownerName === 'RoyalIcing') {
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

async function extractMarkdownMetadata(markdown: string) {
  const { html, frontMatter } = renderMarkdown(markdown)

  let title: string | null = null
  let date: Date | null = null
  let dateString: string | null = null

  if (typeof frontMatter.title === 'string') {
    title = frontMatter.title
  }

  if (typeof frontMatter.date === 'string') {
    dateString = frontMatter.date
    try {
      date = parseISO(frontMatter.date)
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
    dateString,
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

const staticFileExtensions = [
  'css',
  'svg',
  'avif',
  'webp',
  'png',
  'apng',
  'jpg',
  'jpeg',
  'gif',
  'ico',
  'eot'
]

export async function handleRequest(
  ownerName: string,
  repoName: string,
  path: string,
) {
  await loadAssetsIfNeeded()

  if (path.startsWith('/__assets/')) {
    const name = path.replace("/__assets/", "").split('/')[0];
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

  function loadMarkdownPartial(path: string): Promise<string | null> {
    const type: 'html' | 'markdown' = path.endsWith(".html") ? 'html' : 'markdown'

    return fetchGitHubRepoTextFile(
      ownerName,
      repoName,
      headSHA,
      path,
    )
      .then((source) => type === "markdown" ? md.render(source) : source)
      .then((html) => adjustHTML(html))
      .catch(() => null)
  }

  async function getSHA() {
    const refsGenerator = await fetchGitHubRepoRefs(ownerName, repoName)
    const head = findHEADInRefs(refsGenerator())
    if (head == null) {
      throw new Response("GitHub Repo does not have HEAD branch.", { status: 404 });
    }
    return head.sha
  }
  const headSHA = await getSHA()

  if (staticFileExtensions.some(extension => path.endsWith(`.${extension}`))) {
    return fetchGitHubRepoFileResponse(
      ownerName,
      repoName,
      headSHA,
      path
    ).then(res => res.clone())
  }

  const htmlHeadPromise = loadMarkdownPartial('_html-head.html').then(html => html ?? loadMarkdownPartial('_head.html'))
  const navPromise = loadMarkdownPartial('_header.md').then(html => html ?? loadMarkdownPartial('_nav.md'))
  const contentinfoPromise = loadMarkdownPartial('_contentinfo.md')

  async function getMainHTML() {
    if (path === '' || path === '/') {
      return await fetchGitHubRepoTextFile(
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
      (await fetchGitHubRepoTextFile(
        ownerName,
        repoName,
        headSHA,
        `${path}/README.md`,
      ).catch(() => null)) ||
      (await fetchGitHubRepoTextFile(
        ownerName,
        repoName,
        headSHA,
        `${path}.md`,
      ).catch(() => null))

    let paths = [path]

    if (typeof content === 'string') {
      const { html, frontMatter } = renderMarkdown(content)
      if (Array.isArray(frontMatter.includes)) {
        paths = frontMatter.includes
      } else {
        return await renderPrimaryArticle(html, path, repoSource, frontMatter)
      }
    }

    type FileInfo = { filePath: string; urlPath: string }
    const allFiles: ReadonlyArray<FileInfo> = await Promise.all(Array.from(
      function* () {
        for (const lookupPath of paths) {
          yield listGitHubRepoFiles(
            ownerName,
            repoName,
            sha,
            lookupPath + '/',
          )
          .then(absolutePaths => {
            const absolutePrefix = `${ownerName}/${repoName}@${sha}/`
            return absolutePaths.map(absolutePath => {
              const filePath = absolutePath.replace(absolutePrefix, "");
              return {
                filePath,
                urlPath: filePath.replace(/\.md$/, '')
              }
            }) as ReadonlyArray<FileInfo>
          })
          .catch(() => [] as ReadonlyArray<FileInfo>)
        }
      }.call(undefined)
    )).then((a: any) => a.flat())

    // const allFiles: ReadonlyArray<string> = await listGitHubRepoFiles(
    //   ownerName,
    //   repoName,
    //   sha,
    //   path + '/',
    // ).catch(() => null)
    // if (allFiles === null) {
    //   return `Not found. path: ${path} repo: ${ownerName}/${repoName}@${sha}`
    // }

    // There’s been an issue where we hit a CPU limit when trying to render dozens of posts at once.
    // TODO: could fetch myself to render every article in parallel each with their own time limit.

    const limit = 500
    let files = allFiles.slice(0, limit)

    files.reverse()

    const articlesHTML = (
      await Promise.all(
        Array.from(
          function* () {
            for (const { filePath } of files) {
              if (!filePath.endsWith('.md')) {
                continue;
              }
              
              const urlPath = filePath.replace(/\.md$/, '')
              yield fetchGitHubRepoTextFile(
                ownerName,
                repoName,
                sha,
                filePath
              )
                .then((markdown) => extractMarkdownMetadata(markdown))
                .then(({ title, date, dateString }) => ({
                  sortKey: date instanceof Date ? date.valueOf() : title,
                  html: h(
                    'li',
                    {},
                    date instanceof Date
                      ? h(
                        'time',
                        { 'datetime': dateString },
                        date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                      )
                      : '',
                    h('a', { href: urlPath }, title),
                  )
                }))
            }
          }.call(undefined),
        ),
      )
    ).sort((a: any, b: any) => {
      if (typeof a.sortKey === "number" && typeof b.sortKey === "number") {
        return b.sortKey - a.sortKey
      } else {
        return `${b.sortKey}`.localeCompare(`${a.sortKey}`)
      }
    }).map((a: any) => a.html).join('\n')
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
  const htmlHead = (await htmlHeadPromise) || defaultHTMLHead()
  // const headerHTML = (await headerPromise) || `<nav>${md.render(navSource)}</nav>`
  const headerHTML = `<nav>${(await navPromise) || md.render(navSource)
    }</nav>`
  // const footerHTML = `<footer>${navigator?.userAgent}</footer>`
  const footerHTML = (await contentinfoPromise) || ''

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
  ].join("\n")

  return resHTML(html)
}

function getRequestIsDirect(request) {
  return request.headers.get('host') === 'collected.press'
}
