tcp-yoink
=========

A logging TCP proxy. Proxies from a front endpoint to a back endpoint, displaying and optionally saving the proxied traffic. Includes TLS support for both endpoints.

I wrote this to capture and reverse engineer TLS-based protocols that don't properly check server identities, so that is probably what this would be most useful for. You can use either DNS or iptables to redirect anything to the proxy.

No dependencies besides node.js itself.

Possible future features
------------------------

* Hex dump display mode for binary protocols.
* Support saving in a commonly supported format like libpcap. The current format is a totally non-standard simple text-based, binary safe format which can be viewed in a text editor or parsed easily with anything, but it's not supported by any existing tools.
