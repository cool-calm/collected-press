import { mustEnd } from 'yieldparser'
import { githubOwnerNameRegex, githubRepoNameRegex } from './github'
import {
  fetchGitHubRepoFile,
  listGitHubRepoFiles,
  fetchGitHubRepoRefs,
  findHEADInRefs
} from '../github'
import {
  md, renderStyledHTML
} from '../html'
import { resHTML } from '../http'

function* GetGitHubSiteHome() {
  yield '/github-site/'
  const [ownerName] = yield githubOwnerNameRegex
  yield '/'
  const [repoName] = yield githubRepoNameRegex
  // const repoName = ownerName
  const path = yield [OptionalPathSuffix, ''];
  yield mustEnd

  function* OptionalPathSuffix() {
    yield '/'
    const [path] = yield /^.*[^\/]$/
    return path
  }

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

  async function getMarkdownSource() {
    const headSHA = await getSHA()

    return await fetchGitHubRepoFile(
      ownerName,
      repoName,
      headSHA,
      'README.md',
    )
  }

  return async ({ searchParams }, request, event) => {
    const headSHA = await getSHA()
    const sha = headSHA
    const files = await listGitHubRepoFiles(ownerName, repoName, sha, path)

    const filenamePrefix = `${ownerName}/${repoName}@${sha}/`
    const navSource = Array.from(function* () {
      for (const file of files) {
        const name = file.slice(filenamePrefix.length, -1)
        if (file.endsWith('/')) {
          // FIXME: we should allow the site to specify the basename
          yield `- [${name}](/github-site/${ownerName}/${repoName}/${path}/${name})`
        }
      }
    }.call()).join('\n')

    const sourceText = await getMarkdownSource()

    const html = renderStyledHTML('<header role=banner><nav>', md.render(navSource), '</nav></header>', '<main><article>', md.render(sourceText), '</article></main>')

    return resHTML(html)
  }
}

export function* RoutesGitHubSite() {
  return yield [GetGitHubSiteHome]
}