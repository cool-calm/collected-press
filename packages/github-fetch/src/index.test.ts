import {
  fetchGitHubRepoContent,
  fetchGitHubRepoRefs,
  findHEADInRefs,
} from './index'

const owner = 'cool-calm'
const repo = 'collected-press'

test('fetchGitHubRepoRefs', async () => {
  const refsGen = await fetchGitHubRepoRefs(owner, repo)
  const refsArray = Array.from(refsGen())
  expect(refsArray[0].ref).toEqual('HEAD')
  expect(refsArray[0].HEADRef).toEqual('refs/heads/main')

  const headRef = findHEADInRefs(refsArray)
  expect(headRef.HEADRef).toEqual('refs/heads/main')
  expect(headRef.branch).toEqual('main')
})

test('fetchGitHubRepoContent', async () => {
  const refsGen = await fetchGitHubRepoRefs(owner, repo)
  const refsArray = Array.from(refsGen())
  const headRef = findHEADInRefs(refsArray)
  if (!headRef) throw Error('No HEAD to be found.')

  const { sha } = headRef
  const homeRes = await fetchGitHubRepoContent(owner, repo, sha, 'README.md')
  expect(homeRes).toBeInstanceOf(Response)
  expect(homeRes.status).toBe(200)

  const html = await homeRes.text()
  expect(html).toContain('# Collected Press')
})
