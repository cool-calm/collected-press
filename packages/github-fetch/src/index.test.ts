import {
  fetchGitHubRepoContent,
  fetchGitHubRepoRefs,
  findHEADInRefs,
} from './index'

test('fetchGitHubRepoRefs', async () => {
  const refsGen = await fetchGitHubRepoRefs('RoyalIcing', 'RoyalIcing')
  const refsArray = Array.from(refsGen())
  expect(refsArray[0].ref).toEqual('HEAD')
  expect(refsArray[0].HEADRef).toEqual('refs/heads/master')

  const headRef = findHEADInRefs(refsArray)
  expect(headRef.HEADRef).toEqual('refs/heads/master')
  expect(headRef.branch).toEqual('master')
})

test('fetchGitHubRepoContent', async () => {
  const refsGen = await fetchGitHubRepoRefs('RoyalIcing', 'RoyalIcing')
  const refsArray = Array.from(refsGen())
  const headRef = findHEADInRefs(refsArray)
  if (!headRef) throw Error('No HEAD to be found.')

  const { sha } = headRef
  const homeRes = await fetchGitHubRepoContent(
    'RoyalIcing',
    'RoyalIcing',
    sha,
    'README.md',
  )
  expect(homeRes).toBeInstanceOf(Response)
  expect(homeRes.status).toBe(200)

  const html = await homeRes.text()
  expect(html).toContain('# Patrick Smith')
})
