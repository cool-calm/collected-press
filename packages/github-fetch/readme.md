# Collected GitHub Fetch

## Install

```console
npm add @collected/github-fetch
```

```ts
import {
  fetchGitHubRepoRefs,
  findHEADInRefs,
  fetchGitHubRepoContent,
} from '@collected/github-fetch'

const gitHubOwner = 'cool-calm'
const repoName = 'collected-press'

const refsGenerator = fetchGitHubRepoRefs(gitHubOwner, repoName)
const head = findHEADInRefs(refsGenerator())
if (!head) {
  throw Error('No HEAD ref')
}

const response: Response = await fetchGitHubRepoContent(
  gitHubOwner,
  repoName,
  head.sha,
  'README.md',
)

// Use response:
// e.g. forward from your own server
// e.g. await response.text()
// e.g. markdownToHTML(await response.text())
```
