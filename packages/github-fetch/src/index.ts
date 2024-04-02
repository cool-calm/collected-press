function resJSON(
  json: {} | ReadonlyArray<{} | string>,
  status = 200,
  headers = new Headers(),
) {
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(json), { status, headers })
}

/**
 * A git ref, parsed from performing a git fetch.
 */
export interface RefItem {
  ref: string
  oid: string
  target?: string
  peeled?: string
  HEADRef?: string
  objectFormat?: string
  agent?: string
}

// export const githubOwnerNameRegex = /^[-_a-z\d]+/i
// export const githubRepoNameRegex = /^[-_.a-z\d]+/i

/**
 *
 * @param ownerName The GitHub account (user or org).
 * @param repoName The GitHub repo under the owner.
 * @param tag The tag or SHA.
 * @param path The workspace file path to load.
 * @returns A `Response` with HTTP status and body. Use `.text()` to grab the text content.
 */
export async function fetchGitHubRepoContent(
  ownerName: string,
  repoName: string,
  tag: string,
  path: string,
): Promise<Response> {
  const sourceURL = `https://raw.githubusercontent.com/${ownerName}/${repoName}/${tag}/${path}`
  // console.log(sourceURL)
  const sourceRes = await fetch(sourceURL)
  if (sourceRes.status >= 400) {
    throw resJSON(
      {
        sourceURL,
        error: `fetch github repo content ${sourceRes.status} ${tag} ${path}`,
      },
      sourceRes.status,
    )
  }

  let newContentType: string | undefined

  if (path.endsWith('.css')) {
    // GitHub sends back a content-type of text/plain.
    newContentType = 'text/css;charset=utf-8'
  } else if (path.endsWith('.pdf')) {
    // GitHub sends back a content-type of application/octet-stream.
    newContentType = 'application/pdf'
  }

  if (newContentType) {
    const headers = new Headers(sourceRes.headers)
    headers.set('content-type', newContentType)
    return new Response(await sourceRes.arrayBuffer(), {
      status: sourceRes.status,
      headers,
    })
  }

  return sourceRes
}

// async function fetchGitHubRepoFileFromJsdelivr(
//   ownerName: string,
//   repoName: string,
//   tag: string,
//   path: string,
// ): Promise<Response> {
//   const sourceURL = `https://cdn.jsdelivr.net/gh/${ownerName}/${repoName}@${tag}/${path}`
//   const sourceRes = await fetch(sourceURL)
//   if (sourceRes.status >= 400) {
//     throw resJSON(
//       {
//         sourceURL,
//         error: `fetch github repo file response ${sourceRes.status} ${tag} ${path}`,
//       },
//       sourceRes.status,
//     )
//   }

//   return sourceRes
// }

// This is a hack
// export async function listGitHubRepoFiles(
//   ownerName: string,
//   repoName: string,
//   sha: string,
//   path: string,
// ): Promise<ReadonlyArray<string>> {
//   const sourceURL = `https://cdn.jsdelivr.net/gh/${ownerName}/${repoName}@${sha}/${path}`
//   const sourceRes = await fetch(sourceURL)
//   if (sourceRes.status >= 400) {
//     throw resJSON(
//       { sourceURL, error: `listGitHubRepoFiles ${sha} ${path}` },
//       sourceRes.status,
//     )
//   }

//   const foundLinks: Array<string> = []
//   const absolutePrefix = `${ownerName}/${repoName}@${sha}/`
//   const transformedRes = new HTMLRewriter()
//     .on('tr td.name a', {
//       element(el) {
//         let path = el.getAttribute('href')
//         if (path.startsWith('.')) return
//         path = path.replace(/^\/gh\//, '')
//         path = path.replace(absolutePrefix, '')
//         foundLinks.push(path)
//       },
//     })
//     .transform(sourceRes)

//   await transformedRes.text()

//   return Object.freeze(foundLinks)
// }

/**
 * Does the equivalent of a `git fetch` to load all the branches from a GitHub repo, including the current HEAD.
 * @param ownerName The GitHub account (user or org).
 * @param repoName The GitHub repo under the owner.
 * @returns A promise resolving to a generator function with each parsed ref.
 */
export async function fetchGitHubRepoRefs(
  ownerName: string,
  repoName: string,
): Promise<() => Generator<Readonly<RefItem>, void, unknown>> {
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

/**
 * Looks up the HEAD ref from an iterable of refs. This lets you retrieve the most up-to-date SHA.
 * @param refsIterable Usually from calling the result of `fetchGitHubRepoRefs()`
 * @returns The SHA and branch name of the current HEAD, or `null` if not found.
 */
export function findHEADInRefs(
  refsIterable: Iterable<RefItem>,
): null | Readonly<{ sha: string; HEADRef: string; branch: string }> {
  for (const line of refsIterable) {
    if (line.HEADRef) {
      const branch = line.HEADRef.split('/').at(-1)
      if (!branch) return null
      return {
        sha: line.oid,
        HEADRef: line.HEADRef,
        branch,
      }
    }
    break
  }
  return null
}

/**
 * Looks up a branch from an iterable of refs. This lets you retrieve the branch’s most up-to-date SHA.
 * @param refsIterable Usually from calling the result of `fetchGitHubRepoRefs()`
 * @param branch The name of the branch to look up.
 * @returns The SHA of the branch, or `null` if not found.
 */
export function findBranchInRefs(
  refsIterable: Iterable<RefItem>,
  branch: string,
): null | Readonly<{ sha: string }> {
  const expectedRef = `refs/heads/${branch}`

  for (const line of refsIterable) {
    if (line.ref === expectedRef) {
      return { sha: line.oid }
    }
  }

  return null
}

/**
 * Load the latest content from a GitHub Gist.
 * @param ownerName The GitHub account (user or org).
 * @param gistID The ID of the Gist.
 * @param path The path within the Gist, useful for when it contains multiple files.
 * @returns The content text.
 */
export async function fetchGitHubGistContent(
  ownerName: string,
  gistID: string,
  path = '',
): Promise<string> {
  const sourceURL = `https://gist.githubusercontent.com/${ownerName}/${gistID}/raw/${path}`
  const sourceRes = await fetch(sourceURL)
  if (sourceRes.status >= 400) {
    throw resJSON({ sourceURL, error: true }, sourceRes.status)
  }

  return await sourceRes.text()
}
