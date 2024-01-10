import { fetchGitHubRepoRefs } from './index'

test('fetchGitHubRepoRefs', async () => {
  const refsGen = await fetchGitHubRepoRefs('RoyalIcing', 'RoyalIcing')
  const refsArray = Array.from(refsGen())
  expect(refsArray[0].ref).toEqual('HEAD')
  expect(refsArray[0].HEADRef).toEqual('refs/heads/master')
})
