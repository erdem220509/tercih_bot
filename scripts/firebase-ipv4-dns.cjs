const dns = require('node:dns')
const net = require('node:net')

const systemLookup = dns.lookup
const resolver = new dns.Resolver()
resolver.setServers(['8.8.8.8'])

dns.lookup = (hostname, options, callback) => {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }

  if (net.isIP(hostname) || hostname === 'localhost') {
    return systemLookup(hostname, options, callback)
  }

  resolver.resolve4(hostname, (error, addresses) => {
    if (error || !addresses.length) {
      return systemLookup(hostname, options, callback)
    }

    if (options?.all) {
      callback(null, addresses.map((address) => ({ address, family: 4 })))
      return
    }

    callback(null, addresses[0], 4)
  })
}
