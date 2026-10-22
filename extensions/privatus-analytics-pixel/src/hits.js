// Privatus Analytics web pixel: turns a Shopify customer event into the same
// short-key JSON that pa.js sends to /api/event. MIT License.
//
// What a hit holds: the site id, the event name, the page URL (query
// parameters removed except campaign ones, checkout and order addresses
// reduced to fixed paths), the referrer's origin and path, the browser
// language and the screen width. A Purchase adds the order total and its
// currency. Nothing about the customer is read or sent: no email, name,
// phone, address, order id, checkout token, client id, IP or User-Agent.

export const API = 'https://privatusstats.com'
export const ENDPOINT = API + '/api/event'

const SITE_ID = /^pa_[A-Za-z0-9]+$/
const KEEP_PARAM = /^(utm_|ref$|via$|source$|gclid|gbraid|wbraid|msclkid|fbclid|ttclid)/
const NAMES = {
  product_added_to_cart: 'Add to Cart',
  checkout_started: 'Checkout Started',
  checkout_completed: 'Purchase'
}
// The events the pixel subscribes to. Storefront pageviews are counted by the
// theme app embed (pa.js), so page_viewed is never one of them.
export const EVENTS = Object.keys(NAMES)

// Keeps campaign query parameters only, drops the hash, and reduces
// addresses that include checkout tokens or order ids to fixed paths.
export function cleanUrl (href, fixedPath) {
  try {
    const url = new URL(href)
    if (fixedPath) {
      url.pathname = fixedPath
    } else if (/^\/checkouts?\//.test(url.pathname)) {
      url.pathname = '/checkout'
    } else if (/^\/account\/orders\//.test(url.pathname)) {
      url.pathname = '/account/orders/:id'
    } else if (/^\/[^/]+\/orders\/[^/]+/.test(url.pathname)) {
      url.pathname = '/orders/:id'
    }
    const kept = new URLSearchParams()
    url.searchParams.forEach((value, key) => { if (KEEP_PARAM.test(key)) kept.append(key, value) })
    url.search = kept.toString()
    url.hash = ''
    return url.href
  } catch (e) {
    return null
  }
}

function cleanReferrer (referrer) {
  if (!referrer) return undefined
  try {
    const url = new URL(referrer)
    return url.origin + url.pathname
  } catch (e) {
    return undefined
  }
}

function number (value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

const FIXED_PATHS = { checkout_started: '/checkout', checkout_completed: '/checkout/thank-you' }

// The hit for one customer event, or null when the pixel sends nothing.
export function hitFor (name, event, siteId) {
  if (!NAMES[name] || !SITE_ID.test(siteId || '')) return null
  const ctx = (event && event.context) || {}
  const doc = ctx.document || {}
  const url = cleanUrl(doc.location && doc.location.href, FIXED_PATHS[name])
  if (!url) return null

  const hit = { s: siteId, t: 'event', n: NAMES[name], u: url }
  const referrer = cleanReferrer(doc.referrer)
  if (referrer) hit.r = referrer
  const language = ctx.navigator && ctx.navigator.language
  if (language) hit.l = String(language).slice(0, 35)
  const width = number(ctx.window && ctx.window.screen && ctx.window.screen.width)
  if (width) hit.w = width

  if (name === 'checkout_completed') {
    const checkout = (event.data && event.data.checkout) || {}
    const total = checkout.totalPrice || {}
    const amount = number(total.amount)
    const currency = total.currencyCode || checkout.currencyCode
    // Major units, as pa.js sends revenue. The server stores minor units.
    if (amount !== undefined) hit.rv = amount
    if (currency) hit.cu = String(currency).slice(0, 3)
  }
  return hit
}

// True when the merchant switched on "Respect the store's cookie consent".
export function consentRequired (settings) {
  return !!settings && settings.respect_consent === 'true'
}
