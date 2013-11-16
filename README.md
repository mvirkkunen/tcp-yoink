tcp-yoink
=========

A logging TCP proxy. Proxies from a front endpoint to a back endpoint, displaying and optionally saving the proxied traffic. Includes TLS support for both endpoints.

I wrote this to capture and reverse engineer TLS-based protocols that don't properly check server identities, so that is probably what this would be most useful for. You can use either DNS or iptables to redirect anything to the proxy. The available options are also heavily tailored for this, but it's easy to add more.

The current log format is a totally non-standard text-based, binary safe format which can be viewed in a text editor or parsed easily with anything, but it's not supported by any existing tools.

No dependencies besides node.js itself.

Example session
---------------

Below, curl believes it's talking to www.openssl.org via SSL.

![Screenshot](http://i.imgur.com/Q3QHeFl.png)

Ideas for features
------------------

* Hex dump display mode for binary protocols.
* Support saving in a commonly supported format like libpcap. 

