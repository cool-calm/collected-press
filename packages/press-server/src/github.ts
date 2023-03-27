import { resJSON } from './http'

interface RefItem {
  ref: string
  oid: string
  target?: string
  peeled?: string
  HEADRef?: string
  objectFormat?: string
  agent?: string
}

export const githubOwnerNameRegex = /^[-_a-z\d]+/i
export const githubRepoNameRegex = /^[-_.a-z\d]+/i

export async function fetchGitHubRepoFileResponse(
  ownerName: string,
  repoName: string,
  tag: string,
  path: string
): Promise<Response> {
  return fetchGitHubRepoFileFromGitHubUserContent(ownerName, repoName, tag, path)
}

async function fetchGitHubRepoFileFromGitHubUserContent(
  ownerName: string,
  repoName: string,
  tag: string,
  path: string
): Promise<Response> {
  const sourceURL = `https://raw.githubusercontent.com/${ownerName}/${repoName}/${tag}/${path}`
  // console.log(sourceURL)
  const sourceRes = await fetch(sourceURL)
  if (sourceRes.status >= 400) {
    throw resJSON({ sourceURL, error: `fetch github repo file response ${sourceRes.status} ${tag} ${path}` }, sourceRes.status)
  }

  if (path.endsWith('.css')) {
    // GitHub sends back a content-type of text/plain, so we change to text/css.
    const headers = new Headers(sourceRes.headers);
    headers.set('content-type', 'text/css;charset=utf-8')
    return new Response(await sourceRes.text(), {
      status: sourceRes.status,
      headers
    })
  }

  return sourceRes
}

async function fetchGitHubRepoFileFromJsdelivr(
  ownerName: string,
  repoName: string,
  tag: string,
  path: string
): Promise<Response> {
  const sourceURL = `https://cdn.jsdelivr.net/gh/${ownerName}/${repoName}@${tag}/${path}`
  const sourceRes = await fetch(sourceURL)
  if (sourceRes.status >= 400) {
    throw resJSON({ sourceURL, error: `fetch github repo file response ${sourceRes.status} ${tag} ${path}` }, sourceRes.status)
  }

  return sourceRes
}

export async function listGitHubRepoFiles(ownerName: string, repoName: string, tag: string, path: string): Promise<ReadonlyArray<string>> {
  const sourceURL = `https://cdn.jsdelivr.net/gh/${ownerName}/${repoName}@${tag}/${path}`
  const sourceRes = await fetch(sourceURL)
  if (sourceRes.status >= 400) {
    throw resJSON({ sourceURL, error: `listGitHubRepoFiles ${tag} ${path}` }, sourceRes.status)
  }

  const foundLinks: Array<string> = []
  const transformedRes = new HTMLRewriter()
    .on('tr td.name a', {
      element(el) {
        let path = el.getAttribute('href')
        if (path.startsWith('.')) return
        path = path.replace(/^\/gh\//, '')
        foundLinks.push(path)
      },
    })
    .transform(sourceRes)

  await transformedRes.text()

  return Object.freeze(foundLinks)
}

export async function fetchGitHubRepoRefs(ownerName: string, repoName: string): Promise<() => Generator<Readonly<RefItem>, void, unknown>> {
  // See: https://github.com/isomorphic-git/isomorphic-git/blob/52b87bb05f6041f0a372ceab24bc55ee6c23d374/src/models/GitPktLine.js
  // See: https://github.com/isomorphic-git/isomorphic-git/blob/52b87bb05f6041f0a372ceab24bc55ee6c23d374/src/api/listServerRefs.js
  const url = `https://github.com/${ownerName}/${repoName}.git/info/refs?service=git-upload-pack`
  const res = await fetch(url)
  const arrayBuffer = await res.arrayBuffer()
  return function* decodePktLine() {
    let current = 0
    linesLoop: while (true) {
      const utf8Decoder = new TextDecoder('utf-8')
      const lengthHex = utf8Decoder.decode(
        arrayBuffer.slice(current, current + 4),
      )
      current += 4
      const length = parseInt(lengthHex, 16)
      if (length <= 1) {
        continue linesLoop
      }

      const bytes = arrayBuffer.slice(current, current + length - 4)
      if (bytes.byteLength === 0) break linesLoop
      current += length - 4

      const line = utf8Decoder.decode(bytes).trimEnd()
      const [oid, refRaw, ...attrs] = line.split(' ')
      if (oid === '#') {
        continue linesLoop
      }

      const [ref] = refRaw.split('\u0000')

      const r: RefItem = { ref, oid }
      // r.attrs = attrs;
      for (const attr of attrs) {
        const [name, value] = attr.split(':')
        if (name === 'symref-target') {
          r.target = value
        } else if (name === 'peeled') {
          r.peeled = value
        } else if (name === 'symref=HEAD') {
          r.HEADRef = value
        } else if (name === 'object-format') {
          r.objectFormat = value
        } else if (name === 'agent') {
          r.agent = value
        }
      }
      yield Object.freeze(r)
    }
  }
}

export function findHEADInRefs(refsIterable: Iterable<RefItem>): null | Readonly<{ sha: string; HEADRef: string; branch: string }> {
  for (const line of refsIterable) {
    if (line.HEADRef) {
      return { sha: line.oid, HEADRef: line.HEADRef, branch: line.HEADRef.split('/').at(-1) }
    }
    break
  }
  return null
}

export function findBranchInRefs(refsIterable: Iterable<RefItem>, branch: string): null | Readonly<{ sha: string }> {
  for (const line of refsIterable) {
    if (line.ref === `refs/heads/${branch}`) {
      return { sha: line.oid }
    }
  }
  return null
}

export async function fetchGitHubGistFile(ownerName: string, gistID: string, path = ''): Promise<string> {
  const sourceURL = `https://gist.githubusercontent.com/${ownerName}/${gistID}/raw/${path}`
  const sourceRes = await fetch(sourceURL)
  if (sourceRes.status >= 400) {
    throw resJSON({ sourceURL, error: true }, sourceRes.status)
  }

  return await sourceRes.text()
}
