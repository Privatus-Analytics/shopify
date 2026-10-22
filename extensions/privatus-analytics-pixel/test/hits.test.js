// Run: node --test test/*.test.js (Node 22, no dependencies)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ENDPOINT, hitFor, cleanUrl, consentRequired } from '../src/hits.js'

const context = {
  document: {
    location: { href: 'https://shop.example/checkouts/cn/abc123/information?utm_source=news&token=secret#x' },
    referrer: 'https://www.google.com/search?q=boots'
  },
  navigator: { language: 'en-GB', userAgent: 'never sent' },
  window: { screen: { width: 1280 } }
}

const customer = {
  email: 'buyer@example.com',
  phone: '+441234567890',
  billingAddress: { firstName: 'Ann', city: 'Leeds' },
  shippingAddress: { lastName: 'Lee' },
  order: { id: 'gid://shopify/Order/1' },
  token: 'checkout-token'
}

test('posts to the tracker host ingest endpoint', () => {
  assert.equal(ENDPOINT, 'https://privatusstats.com/api/event')
})

test('checkout_started is a custom event with no properties', () => {
  const hit = hitFor('checkout_started', { context, data: { checkout: { ...customer, totalPrice: { amount: 10, currencyCode: 'EUR' } } } }, 'pa_ABC')
  assert.deepEqual(hit, {
    s: 'pa_ABC',
    t: 'event',
    n: 'Checkout Started',
    u: 'https://shop.example/checkout?utm_source=news',
    r: 'https://www.google.com/search',
    l: 'en-GB',
    w: 1280
  })
})

test('product_added_to_cart is a custom event with no properties', () => {
  const event = {
    context: { ...context, document: { location: { href: 'https://shop.example/products/boot?variant=1' } } },
    data: { cartLine: { quantity: 2, merchandise: { price: { amount: 50, currencyCode: 'EUR' }, product: { title: 'Boot' } } } }
  }
  const hit = hitFor('product_added_to_cart', event, 'pa_ABC')
  assert.deepEqual(hit, { s: 'pa_ABC', t: 'event', n: 'Add to Cart', u: 'https://shop.example/products/boot', l: 'en-GB', w: 1280 })
})

test('checkout_completed sends only the order total and currency', () => {
  const event = {
    context,
    data: { checkout: { ...customer, totalPrice: { amount: '149.90', currencyCode: 'EUR' }, lineItems: [{ quantity: 3 }] } }
  }
  const hit = hitFor('checkout_completed', event, 'pa_ABC')
  assert.equal(hit.n, 'Purchase')
  assert.equal(hit.u, 'https://shop.example/checkout/thank-you?utm_source=news')
  // Major units, like pa.js: the server stores minor units (Ingest::Payload.revenue_minor).
  assert.equal(hit.rv, 149.9)
  assert.equal(hit.cu, 'EUR')
  assert.equal(hit.p, undefined)
})

test('no hit ever holds customer data or a client id', () => {
  const event = { context, clientId: 'client-123', data: { checkout: { ...customer, totalPrice: { amount: 1, currencyCode: 'USD' } } } }
  for (const name of ['checkout_started', 'checkout_completed', 'product_added_to_cart']) {
    const json = JSON.stringify(hitFor(name, event, 'pa_ABC'))
    for (const value of ['buyer@example.com', '+441234567890', 'Ann', 'Leeds', 'Lee', 'Order/1', 'checkout-token', 'client-123', 'abc123', 'secret', 'never sent']) {
      assert.ok(!json.includes(value), `${name} leaked ${value}`)
    }
  }
})

test('page_viewed and unknown events make no hit', () => {
  assert.equal(hitFor('page_viewed', { context }, 'pa_ABC'), null)
  assert.equal(hitFor('search_submitted', { context }, 'pa_ABC'), null)
})

test('no hit without a valid site id', () => {
  assert.equal(hitFor('checkout_started', { context }, ''), null)
  assert.equal(hitFor('checkout_started', { context }, 'not-a-site'), null)
})

test('order status pages are masked', () => {
  assert.equal(cleanUrl('https://shop.example/account/orders/123?key=x'), 'https://shop.example/account/orders/:id')
  assert.equal(cleanUrl('https://shop.example/123/orders/abcdef'), 'https://shop.example/orders/:id')
})

test('consent is only required when the app setting is on', () => {
  assert.equal(consentRequired({ respect_consent: 'true' }), true)
  assert.equal(consentRequired({ respect_consent: 'false' }), false)
  assert.equal(consentRequired({}), false)
})
