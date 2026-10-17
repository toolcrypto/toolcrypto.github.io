import * as qr from '@toolcrypto/crypto-qr'
import { logoFor } from '@toolcrypto/crypto-qr/logos'

/** The sentence of each warning of the library. One that has none here shows by its name. */
const WARNINGS = {
  'token-not-encoded': 'The code does not carry the token: the payer chooses it.',
  'uri-support-varies':
    'Wallets of this chain do not all read payment links. An address alone always works.',
  'erc20-uri-risk':
    'A scanner that does not understand this link may take the token contract for the payee.',
  'no-checksum': 'Single-case address: a typo cannot be detected.',
  'off-curve': 'Not a wallet key: a program account, or a typo.',
  'legacy-format': 'Superseded address form.',
}

/** Width and height of a downloaded PNG, in pixels. */
const PNG_SIZE = 1024

const form = document.forms.request
const fields = form.elements
const code = document.getElementById('code')
const result = document.getElementById('result')
const standard = document.getElementById('standard')
const text = document.getElementById('text')
const warnings = document.getElementById('warnings')
const link = document.getElementById('link')

/** Where the API is: the link of the page says it. */
const api = new URL(link.href).origin

/** The code on the page, as the SVG file the library wrote. */
let drawing

/** A new element with the properties it is given. */
function element(tag, properties) {
  return Object.assign(document.createElement(tag), properties)
}

/** The chain chosen in the form. */
function selected() {
  return qr.chains.find((chain) => chain.id === fields.chain.value)
}

/** Lists what the chosen chain can be paid in: its coin, then its tokens, if it has any. */
function listAssets() {
  const { symbol, tokens } = selected()
  const tickers = Object.keys(tokens).map((ticker) => new Option(ticker))
  fields.token.replaceChildren(new Option(symbol, ''), ...tickers)
  fields.token.parentElement.hidden = tickers.length === 0
}

/** Moves the form to a chain, as choosing it in the list does. */
function choose(chain) {
  fields.chain.value = chain.id
  listAssets()
  render()
}

/**
 * Tells whether the code of a request has a place for an amount or a memo.
 * It depends on the chain and, on some, on the address.
 */
function carries(field, { chain, address, token }) {
  try {
    const payment = qr.buildPayment({ chain, address, token, [field]: '1' })
    return !payment.warnings.includes(`${field}-not-encoded`)
  } catch {
    // A request the library refuses has no code to carry anything.
    return false
  }
}

/** Takes away what the last request left on the page. */
function clear() {
  for (const field of form.querySelectorAll('[aria-invalid]')) {
    field.removeAttribute('aria-invalid')
  }
  fields.status.replaceChildren()
  code.replaceChildren()
  result.hidden = true
}

/** Writes the address of the same code on the API. */
function showLink(request) {
  const query = new URLSearchParams({ chain: request.chain.id, address: request.address })
  for (const name of ['token', 'amount', 'memo']) {
    if (request[name]) query.set(name, request[name])
  }
  if (fields.shape.value !== 'square') query.set('shape', fields.shape.value)
  if (fields.logo.checked) query.set('logo', 'true')
  const url = `${api}/svg?${query}`
  link.href = url
  link.textContent = url
}

/** Shows the code of a request, with the text it holds and what to know of it. */
function draw(request) {
  const { svg, payment } = qr.paymentQr(request, {
    logo: fields.logo.checked ? logoFor(request) : undefined,
    shape: fields.shape.value,
    alt: `${request.chain.name} payment code`,
  })
  drawing = new Blob([svg], { type: 'image/svg+xml' })
  // The library's own markup. It holds nothing that was typed: the request is in the modules.
  code.innerHTML = svg
  standard.textContent = payment.standard ?? 'Address alone'
  text.textContent = payment.text
  const said = payment.warnings.map((warning) => WARNINGS[warning] ?? warning)
  warnings.replaceChildren(...said.map((textContent) => element('li', { textContent })))
  result.hidden = false
  showLink({ ...request, address: payment.address })
}

/** Names the chains an address belongs to, when the chosen one is not among them. */
function suggest(address) {
  const others = qr.detectChains(address, qr.chains)
  if (others.length === 0 || others.includes(selected())) return
  const buttons = others.map((chain) => {
    const button = element('button', { type: 'button', textContent: chain.name })
    button.addEventListener('click', () => choose(chain))
    return button
  })
  fields.status.append(' It is an address of: ', ...buttons)
}

/** Says why there is no code, on the field at fault when the library names one. */
function report(error, address) {
  fields.status.textContent = error.message
  if (!(error instanceof qr.PaymentError)) return
  fields[error.field].setAttribute('aria-invalid', 'true')
  if (error.field === 'address') suggest(address)
}

/** Shows what the form asks for: the fields that apply, then the code or why there is none. */
function render() {
  const request = { chain: selected(), address: fields.address.value, token: fields.token.value }
  // A field shows when the code can carry what goes in it, and counts only then.
  for (const name of ['amount', 'memo']) {
    const field = fields[name].parentElement
    field.hidden = !carries(name, request)
    if (!field.hidden) request[name] = fields[name].value
  }

  clear()
  if (!request.address.trim()) return
  try {
    draw(request)
  } catch (error) {
    // The library refuses a payment with a PaymentError, a text too long with a RangeError.
    if (!(error instanceof qr.PaymentError || error instanceof RangeError)) throw error
    report(error, request.address)
  }
}

/** Draws an SVG file on a canvas, for a PNG that looks like what the page shows. */
async function rasterize(file) {
  const image = new Image()
  image.src = URL.createObjectURL(file)
  try {
    await image.decode()
  } finally {
    URL.revokeObjectURL(image.src)
  }
  const canvas = new OffscreenCanvas(PNG_SIZE, PNG_SIZE)
  canvas.getContext('2d').drawImage(image, 0, 0, PNG_SIZE, PNG_SIZE)
  return canvas.convertToBlob()
}

/** Hands a file to the browser's downloads, named after the chain. */
function save(file, extension) {
  const download = element('a', {
    href: URL.createObjectURL(file),
    download: `${fields.chain.value}-payment.${extension}`,
  })
  download.click()
  URL.revokeObjectURL(download.href)
}

listAssets()

form.addEventListener('input', (event) => {
  if (event.target === fields.chain) listAssets()
  render()
})
fields.svg.addEventListener('click', () => save(drawing, 'svg'))
fields.png.addEventListener('click', async () => save(await rasterize(drawing), 'png'))
