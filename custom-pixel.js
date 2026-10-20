// Privatus Analytics — Shopify Customer Events custom pixel.
// Paste into Shopify admin → Settings → Customer events → Add custom pixel.
//
// Custom pixels run in a strict sandbox where <script> tags can't be loaded, so this pixel sends
// browser-style hits directly to {API}/api/event (the same endpoint pa.js uses).
// Privacy: no cookies, no storage writes, no customer data. Only anonymous product attributes and
// order totals are sent. Checkout/order URLs are reduced to fixed paths so tokens and order ids never leave.
// MIT License — Copyright (c) 2026 Privatus Analytics

// ---- Configuration ---------------------------------------------------------------------------------
const SITE_ID = 'pa_XXXX' // your public site id
const API = 'https://privatusanalytics.com' // change only for a self-hosted instance
// Cookieless analytics generally needs no consent. Set to true to only send when Shopify's customer
// privacy API reports that analytics processing is allowed (e.g. if your legal team requires it).
const RESPECT_CONSENT = false
// Set to false when the theme app embed (pa.js) already counts storefront pageviews: the pixel then only
// counts checkout pages, which themes cannot reach.
const STOREFRONT_PAGEVIEWS = true
const DEBUG = false // true = log hits to the console instead of sending
// ----------------------------------------------------------------------------------------------------

const ENDPOINT = API.replace(/\/+$/, '') + '/api/event'
const KEEP_PARAM = /^(utm_|ref$|via$|source$|gclid|gbraid|wbraid|msclkid|fbclid|ttclid)/

let analyticsAllowed = !RESPECT_CONSENT ||
  !!(init && init.customerPrivacy && init.customerPrivacy.analyticsProcessingAllowed)

if (RESPECT_CONSENT && typeof customerPrivacy !== 'undefined' && customerPrivacy.subscribe) {
  customerPrivacy.subscribe('visitorConsentCollected', (event) => {
    analyticsAllowed = !!(event && event.customerPrivacy && event.customerPrivacy.analyticsProcessingAllowed)
  })
}

// Strip query parameters except campaign ones, drop the hash, and collapse URLs that contain
// checkout tokens or order ids into fixed paths.
function cleanUrl(href, fixedPath) {
  try {
    const url = new URL(href)
    if (fixedPath) {
      url.pathname = fixedPath
    } else if (/^\/checkouts?\//.test(url.pathname)) {
      url.pathname = '/checkout'
    } else if (/^\/account\/orders\//.test(url.pathname)) {
      url.pathname = '/account/orders/:id'
    } else if (/^\/[^/]+\/orders\/[^/]+/.test(url.pathname)) {
      url.pathname = '/orders/:id' // legacy order status page: /<shop-id>/orders/<token>
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

function cleanReferrer(referrer) {
  if (!referrer) return undefined
  try {
    const url = new URL(referrer)
    return url.origin + url.pathname // no query strings from external referrers
  } catch (e) {
    return undefined
  }
}

async function optedOut() {
  try {
    return (await browser.localStorage.getItem('privatus_optout')) === '1'
  } catch (e) {
    return false
  }
}

async function send(event, hit) {
  if (!analyticsAllowed || (await optedOut())) return
  const ctx = (event && event.context) || {}
  const doc = ctx.document || {}
  const body = Object.assign({
    s: SITE_ID,
    u: cleanUrl(doc.location && doc.location.href),
    l: ctx.navigator && ctx.navigator.language,
    w: ctx.window && ctx.window.screen && ctx.window.screen.width
  }, hit)
  if (!body.u) return
  if (!body.r) {
    const referrer = cleanReferrer(doc.referrer)
    if (referrer) body.r = referrer
  }
  if (DEBUG) { console.log('[privatus]', body); return }
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'text/plain' },
      credentials: 'omit',
      keepalive: true
    })
  } catch (e) { /* best effort */ }
}

function number(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function compact(obj) {
  const out = {}
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (value !== undefined && value !== null && value !== '') out[key] = typeof value === 'string' ? value.slice(0, 500) : value
  }
  return out
}

analytics.subscribe('page_viewed', (event) => {
  if (!STOREFRONT_PAGEVIEWS) {
    const href = event.context && event.context.document && event.context.document.location &&
      event.context.document.location.href
    let path = ''
    try { path = new URL(href).pathname } catch (e) { /* ignore */ }
    if (!/^\/checkouts?\//.test(path)) return
  }
  send(event, { t: 'pageview' })
})

analytics.subscribe('product_added_to_cart', (event) => {
  const line = (event.data && event.data.cartLine) || {}
  const merchandise = line.merchandise || {}
  const product = merchandise.product || {}
  send(event, {
    t: 'event',
    n: 'Add to Cart',
    p: compact({
      product_type: product.type,
      vendor: product.vendor,
      quantity: number(line.quantity),
      price: merchandise.price ? number(merchandise.price.amount) : undefined,
      currency: merchandise.price ? merchandise.price.currencyCode : undefined
    })
  })
})

analytics.subscribe('checkout_completed', (event) => {
  const checkout = (event.data && event.data.checkout) || {}
  const total = checkout.totalPrice || {}
  const lines = checkout.lineItems || []
  const href = event.context && event.context.document && event.context.document.location &&
    event.context.document.location.href
  send(event, {
    t: 'event',
    n: 'Purchase',
    u: cleanUrl(href, '/checkout/thank-you'),
    rv: number(total.amount),
    cu: total.currencyCode || checkout.currencyCode,
    p: compact({
      items: lines.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
      coupon_used: Array.isArray(checkout.discountApplications) && checkout.discountApplications.length > 0
    })
  })
})
