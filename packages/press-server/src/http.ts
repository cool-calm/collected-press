import { pair, into } from './data'

export const Status = {
  success: 200,
  created: 201,
  accepted: 202,
  noContent: 204,
  movedPermanently: 301,
  // Don’t use 302: https://stackoverflow.com/a/4764473/652615
  seeOther: 303,
  notModified: 304,
  temporaryRedirect: 307,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  methodNotAllowed: 405,
  requestTimeout: 408,
  conflict: 409,
  unprocessableEntity: 422, // Validation failed
  tooManyRequests: 429,
}

const secureHTMLHeaders = Object.freeze([
  pair('strict-transport-security', 'max-age=63072000'),
  pair('x-content-type-options', 'nosniff'),
  pair('x-frame-options', 'DENY'),
  /* pair('x-xss-protection', '1; mode=block'), */
]);

const contentSecurityPolicyHeaders = Object.freeze([
  pair(
    'content-security-policy',
    "default-src 'self'; img-src *; media-src *; style-src 'self' 'unsafe-hashes' 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'self' https://cdn.usefathom.com"
  ),
]);

const linkHeaders = Object.freeze([
  // pair('link', '<https://cdn.jsdelivr.net>; rel="preconnect"'),
]);

export function resJSON(json, status = Status.success, headers = new Headers()) {
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(json), { status, headers })
}
export function resHTML(html, status = Status.success, headers = new Headers()) {
  // assignEntries(headers, pair('content-type', 'text/html;charset=utf-8'), ...secureHTMLHeaders, ...contentSecurityPolicyHeaders)
  // assigning(pair('content-type', 'text/html;charset=utf-8'), ...secureHTMLHeaders, ...contentSecurityPolicyHeaders)(headers)
  // assign(headers, [pair('content-type', 'text/html;charset=utf-8')], secureHTMLHeaders, contentSecurityPolicyHeaders)

  headers.set('content-type', 'text/html;charset=utf-8')
  into(headers, secureHTMLHeaders)
  into(headers, contentSecurityPolicyHeaders)
  into(headers, linkHeaders)
  return new Response(html, { status, headers })
}
export function resPlainText(text, status = Status.success, headers = new Headers()) {
  headers.set('content-type', 'text/plain;charset=utf-8')
  return new Response(text, { status, headers })
}
export function resCSSCached(text, status = Status.success, headers = new Headers()) {
  headers.set('content-type', 'text/css;charset=utf-8')
  headers.set('cache-control', 'public, max-age=604800, s-maxage=43200')
  return new Response(text, { status, headers })
}
export function resRedirect(location, status = Status.seeOther, headers = new Headers()) {
  headers.set('location', location.toString())
  return new Response(undefined, { status, headers })
}