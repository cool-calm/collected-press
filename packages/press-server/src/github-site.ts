import { parseISO } from 'date-fns'
import h from 'vhtml'
import {
  fetchGitHubRepoFileResponse,
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
import { resHTML, Status } from './http'

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

async function renderMarkdownStandalonePage(markdown: string) {
  let html = md.render(markdown)
  const res = new HTMLRewriter()
    .on('h1', {
      element(element) {},
    })
    .transform(resHTML(html))
  return '<article>' + (await res.text()) + '</article>'
}

function gitHubProfilePictureURL(ownerName: string) {
  return new URL(`${ownerName}.png`, 'https://github.com/')
}

async function renderPrimaryArticle(
  html: string,
  path: string,
  repoSource: GitHubRepoSource,
  frontMatter: FrontmatterProperties,
): Promise<string> {
  const res = new HTMLRewriter()
    .on('h1', {
      element(element) {
        element.tagName = 'a'
        element.setAttribute('href', `/${path}`)
        element.before('<h1>', { html: true })

        if (typeof frontMatter.date === 'string') {
          const date = parseISO(frontMatter.date)
          element.after(
            h(
              'time',
              { datetime: frontMatter.date },
              date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }),
            ),
            { html: true },
          )
        }

        if (false && repoSource.ownerName === 'RoyalIcing') {
          element.after(
            `<div style="margin-bottom: 3rem"><img src="${gitHubProfilePictureURL(
              repoSource.ownerName,
            )}" style="border-radius: 9999px; width: 36px; height: 36px; margin-right: 0.5em">Patrick Smith</div>`,
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
    } catch {}
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

    foundTitle = foundTitle.replace("&amp;", "&")
    title = foundTitle.trim()
  }

  return {
    title,
    date,
    dateString,
  }
}

export interface ServeRequestOptions {
  commitSHA?: string
  treatAsStatic?: boolean
  htmlHeaders?: Headers
  fetchRepoContent?: (
    ownerName: string,
    repoName: string,
    tag: string,
    path: string,
  ) => Promise<Response>
}

export interface GitHubRepoSource {
  readonly ownerName: string
  readonly repoName: string
  pathAppearsStatic(path: string): boolean
  expectedMimeTypeForPath(path: string): string | undefined
  fetchHeadSHA(): Promise<null | string>
  serveURL(url: URL, options?: ServeRequestOptions): Promise<Response>
}

function getPathFileExtension(path: string): string | undefined {
  return path.match(/\.([0-9a-z]+)$/)?.at(1)
}

export function sourceFromGitHubRepo(
  ownerName: string,
  repoName: string,
): GitHubRepoSource {
  return Object.freeze({
    ownerName: ownerName,
    repoName: repoName,
    pathAppearsStatic(path: string) {
      const extension = getPathFileExtension(path)
      return fileExtensionsToMimeTypes.has(extension)
    },
    expectedMimeTypeForPath(path: string): string | undefined {
      const extension = getPathFileExtension(path)
      if (extension == undefined) {
        return 'text/html;charset=utf-8'
      }
      return fileExtensionsToMimeTypes.get(extension)
    },
    async fetchHeadSHA() {
      const refsGenerator = await fetchGitHubRepoRefs(ownerName, repoName)
      const head = findHEADInRefs(refsGenerator())
      return head === null ? null : head.sha
    },
    async serveURL(url: URL, options: ServeRequestOptions): Promise<Response> {
      return await handleRequest(this, url.pathname, options ?? {}).catch(
        (err) => {
          if (err instanceof Response) {
            return err
          }
          throw err
        },
      )
    },
  })
}

export async function serveRequest(
  ownerName: string,
  repoName: string,
  url: URL,
  options?: ServeRequestOptions,
) {
  return sourceFromGitHubRepo(ownerName, repoName).serveURL(url, options)
}

const fileExtensionsToMimeTypes = new Map([
  ['txt', 'text/plain;charset=utf-8'],
  ['css', 'text/css;charset=utf-8'],
  ['svg', 'image/svg+xml'],
  ['avif', 'image/avif'],
  ['webp', 'image/webp'],
  ['png', 'image/png'],
  ['apng', 'image/apng'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['ico', 'image/x-icon'],
  ['eot', 'application/vnd.ms-fontobject'],
])

export async function handleRequest(
  repoSource: GitHubRepoSource,
  path: string,
  options: ServeRequestOptions,
) {
  if (path.startsWith('/')) {
    path = path.substring(1)
  }

  const { ownerName, repoName } = repoSource
  const sha = await (options.commitSHA ?? repoSource.fetchHeadSHA())

  const fetchRepoContent =
    options.fetchRepoContent ?? fetchGitHubRepoFileResponse

  const treatAsStatic =
    options.treatAsStatic ?? repoSource.pathAppearsStatic(path)
  if (treatAsStatic) {
    return fetchRepoContent(ownerName, repoName, sha, path).then((res) =>
      res.clone(),
    )
  }

  function fetchRepoTextFile(path: string): Promise<string> {
    return fetchRepoContent(ownerName, repoName, sha, path).then((res) =>
      res.text(),
    )
  }

  function loadPartial(path: string): Promise<string | null> {
    const type: 'html' | 'markdown' = path.endsWith('.html')
      ? 'html'
      : 'markdown'

    return fetchRepoTextFile(path)
      .then((source) => (type === 'markdown' ? md.render(source) : source))
      .then((html) => adjustHTML(html))
      .catch(() => null)
  }

  const htmlHeadPromise = loadPartial('_head.html')
  const navPromise = loadPartial('_nav.md')
  const contentinfoPromise = loadPartial('_contentinfo.md')

  async function getMainHTML() {
    if (path === '' || path === '/') {
      return await fetchRepoTextFile('README.md')
        .catch(
          () => 'Add a `README.md` file to your repo to create a home page.',
        )
        .then(renderMarkdownStandalonePage)
    }

    // TODO: we don’t warn when both these files exist.
    const content: null | string = await Promise.any([
      fetchRepoTextFile(`${path}/README.md`),
      fetchRepoTextFile(`${path}.md`),
    ]).catch(() => null)

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
    const allFiles: ReadonlyArray<FileInfo> = await Promise.all(
      Array.from(
        function* () {
          for (const lookupPath of paths) {
            yield listGitHubRepoFiles(
              ownerName,
              repoName,
              sha,
              lookupPath + '/',
            )
              .then((absolutePaths) => {
                const absolutePrefix = `${ownerName}/${repoName}@${sha}/`
                return absolutePaths.map((absolutePath) => {
                  const filePath = absolutePath.replace(absolutePrefix, '')
                  return {
                    filePath,
                    urlPath: filePath.replace(/\.md$/, ''),
                  }
                }) as ReadonlyArray<FileInfo>
              })
              .catch(() => [] as ReadonlyArray<FileInfo>)
          }
        }.call(undefined),
      ),
    ).then((a: any) => a.flat())

    const limit = 500
    let files = allFiles.slice(0, limit)

    files.reverse()

    const articlesHTML = (
      await Promise.all(
        Array.from(
          function* () {
            for (const { filePath } of files) {
              if (!filePath.endsWith('.md')) {
                continue
              }

              const urlPath = filePath.replace(/\.md$/, '')
              yield fetchRepoTextFile(filePath)
                .then((markdown) => extractMarkdownMetadata(markdown))
                .then(({ title, date, dateString }) => ({
                  sortKey: date instanceof Date ? date.valueOf() : title,
                  html: h(
                    'li',
                    {},
                    date instanceof Date
                      ? h(
                          'time',
                          { datetime: dateString },
                          date.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          }),
                        )
                      : '',
                    h('a', { href: urlPath }, title),
                  ),
                }))
            }
          }.call(undefined),
        ),
      )
    )
      .sort((a: any, b: any) => {
        if (typeof a.sortKey === 'number' && typeof b.sortKey === 'number') {
          return b.sortKey - a.sortKey
        } else {
          return `${b.sortKey}`.localeCompare(`${a.sortKey}`)
        }
      })
      .map((a: any) => a.html)
      .join('\n')
    return `<h1>Articles</h1>\n<nav><ul>${articlesHTML}</ul></nav>`
  }

  // There is no test coverage for this.
  // I‘m not sure if it’s the experience I want either.
  async function fallbackNav() {
    const files = await listGitHubRepoFiles(
      ownerName,
      repoName,
      sha,
      path === '' ? '' : path + '/',
    ).catch(() => [])

    const filenamePrefix = `${ownerName}/${repoName}@${sha}/`
    return Array.from(
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
  }

  const mainHTML = await getMainHTML()
  const htmlHead = (await htmlHeadPromise) || defaultHTMLHead()
  // const headerHTML = (await headerPromise) || `<nav>${md.render(navSource)}</nav>`
  const headerHTML = `<nav>${
    (await navPromise) || md.render(await fallbackNav())
  }</nav>`
  // const footerHTML = `<footer>${navigator?.userAgent}</footer>`
  const footerHTML = `<footer role="contentinfo">${
    (await contentinfoPromise) || ''
  }</footer>`

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
  ].join('\n')

  return resHTML(html, Status.success, options.htmlHeaders)
}
