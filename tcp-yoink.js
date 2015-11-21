#!/usr/bin/env node
var path = require("path"),
    fs = require("fs"),
    net = require("net"),
    tls;

function usage() {
    process.stdout.write(
        "Usage: " + process.argv[0] + " " + path.basename(process.argv[1]) + " "
            + "[OPTIONS] [FRONT_HOST:]FRONT_PORT [BACK_HOST:]BACK_PORT\n"
        + "A logging TCP proxy. Proxies from the front endpoint to the back endpoint,\n"
        + "displaying and optionally saving the captured traffic.\n"
        + "\n"
        + "Options:\n"
        + "  -o, --out FILENAME     Saves the captured traffic into FILENAME.\n"
        + "  -n, --newlines         Show newline characters in output.\n"
        + "  -c, --color            Colorful output.\n"
        + "  -q, --quiet            Don't show any output.\n"
        + "  -t, --tls-in           Use TLS for front the (server) endpoint.\n"
        + "  -T, --tls-out          Use TLS for back the (client) endpoint.\n"
        + "\n"
        + "TLS server options:\n"
        + "  --tls-cert FILENAME    Path to the PEM certificate file to use. [required]\n"
        + "  --tls-key FILENAME     Path to the PEM private key file to use. [required]\n"
        + "  --tls-ca FILENAME      Path to a PEM CA certificate to use.\n"
        + "                         Can be specified multiple times to use a chain.\n"
        + "\n"
        + "TLS client options:\n"
        + "  --tls-accept-all       Accepts untrusted certificates.\n"
        + "  --tls-protocol METHOD  TLS secureprotocol setting.\n"
        + "  --tls-servername HOST  Server name to use for TLS SNI.\n"
        + "  --tls-npn PROTOCOLS    Comma separated list of protocols for TLS NPN.\n"
        + "\n");
}

function parseEndpoint(endpoint, defaultHost) {
    var m = endpoint.match(/^(?:(.+):)?(\d+)$/),
        ep = m && {
            host: m[1] || defaultHost,
            port: parseInt(m[2], 10)
        };

    if (!ep || isNaN(ep.port))
        throw new Error("Invalid endpoint: " + endpoint);

    return ep;
}

function parseOptions(argv) {
    var opts = { tls: { ciphers: "ALL", ca: [ ] } }, positional;

    loop:
    for (var i = 2; i < argv.length; i++) {
        switch (argv[i]) {
            case "-h": case "--help":
                usage();
                process.exit(0);
                break;

            case "-o": case "--out":
                if (i == argv.length - 1)
                    throw new Error("Missing argument FILENAME for --out");

                opts.outFilename = argv[++i];
                break;

            case "-n": case "--newlines":
                opts.showNewlines = true;
                break;

            case "-c": case "--color":
                opts.color = true;
                break;

            case "-q": case "--quiet":
                opts.quiet = true;
                break;

            case "-t": case "--tls-in":
                opts.tlsIn = true;
                break;

            case "-T": case "--tls-out":
                opts.tlsOut = true;
                break;

            case "--tls-cert":
                if (i == argv.length - 1)
                    throw new Error("Missing argument FILENAME for --tls-cert");

                opts.tls.cert = fs.readFileSync(argv[++i]);
                break;

            case "--tls-key":
                if (i == argv.length - 1)
                    throw new Error("Missing argument FILENAME for --tls-key");

                opts.tls.key = fs.readFileSync(argv[++i]);
                break;

            case "--tls-ca":
                if (i == argv.length - 1)
                    throw new Error("Missing argument FILENAME for --tls-ca");

                opts.tls.ca.push(fs.readFileSync(argv[++i]));
                break;

            case "--tls-servername":
                if (i == argv.length - 1)
                    throw new Error("Missing argument HOST for --tls-servername");

                opts.tlsServername = argv[++i];
                break;

            case "--tls-accept-all":
                opts.tlsAcceptAll = true;
                break;

            case "--tls-protocol":
                if (i == argv.length - 1)
                    throw new Error("Missing argument METHOD for --tls-protocol");

                opts.tlsSecureProtocol = argv[++i];
                break;

            case "--tls-npn":
                if (i == argv.length - 1)
                    throw new Error("Missing argument PROTOCOLS for --tls-npn");

                opts.tlsNPNProtocols = argv[++i].split(/,/g);
                break;

            default:
                if (argv[i].substring(0, 1) == "-")
                    throw new Error("Unknown argument: " + argv[i]);
                break loop;
        }
    }

    positional = argv.slice(i);

    if (positional.length != 2)
        throw new Error("Missing front and back endpoints");

    opts.front = parseEndpoint(positional[0], undefined);
    opts.back = parseEndpoint(positional[1], "localhost");

    return opts;
}

var opts;
try {
    opts = parseOptions(process.argv);
} catch(e) {
    process.stdout.write("Error: " + e.message + "\n\n");
    usage();
    process.exit(1);
}

if (opts.tlsIn || opts.tlsOut)
    tls = require("tls");

var server,
    nextIndex = 1,
    outFile;

String.prototype.pad = function(len, char) {
    for (var r = this; r.length < len; )
        r = (char || "0") + r;

    return r;
};

var colors = {
    black: 0,
    red: 1,
    green: 2,
    yellow: 3,
    blue: 4,
    magenta: 5,
    cyan: 6,
    white: 7
};

function maybeColor(str, fg, bg) {
    if (!opts.color)
        return str;

    if (fg)
        str = "\x1b[3" + colors[fg] + "m" + str;

    if (bg)
        str = "\x1b[4" + colors[bg] + "m" + str;

    return "\x1b[1m" + str + "\x1b[m";
}

String.prototype.makePrintable = function() {
    return this.replace(/[\u0000-\u001F]/g, function(c) {
        var code = c.charCodeAt(0);

        return maybeColor("<" + code.toString(16).pad(2) + ">", "black", "white");
    });
}

function maybeDisplay(buffer, index, out) {
    if (opts.quiet)
        return;

    var prefix = maybeColor(
        index.toString().pad(3) + (out ? "→" : "←") + " ",
        out ? "yellow" : "blue");

    buffer
        .toString("utf-8")
        .match(/[^\n]+(?:\r?\n|$)/mg)
        .forEach(function(line) {
            if (!opts.showNewlines)
                line = line.replace(/\r?\n$/, "");

            process.stdout.write(prefix + line.makePrintable() + "\n");
        });
}

function maybeLog(msg) {
    if (opts.quiet)
        return;

    process.stdout.write(msg);
}

function maybeSave(header, data) {
    if (!outFile)
        return;

    if (data)
        header += " " + data.length;

    fs.writeSync(outFile, "# " + header + "\n");

    if (data) {
        fs.writeSync(outFile, data, 0, data.length);
        fs.writeSync(outFile, "\n");
    }
}

function handleFrontConnection(front) {
    var back,
        index = nextIndex++,
        prefix = index.toString().pad(3);

    maybeLog(maybeColor(prefix + "★ new client from "
        + front.remoteAddress + ":" + front.remotePort + "\n",
        "green"));

    maybeSave(index + " CONNECT " + front.remoteAddress + ":" + front.remotePort);

    function handleClientConnected() {
        maybeLog(maybeColor(prefix + "✓ connected to backend\n",
            "green"));

        maybeSave(index + " BCONNECT");

        front.on("data", function(data) {
            maybeDisplay(data, index, true);
            maybeSave(index + " OUT", data);

            back.write(data);
        });

        front.on("close", function() {
            maybeLog(maybeColor(prefix + "× frontend closed\n",
                "red"));
            maybeSave(index + " DISCONNECT");

            back.end();
        });

        front.on("error", function(ex) {
            maybeLog(maybeColor(
                prefix + "× frontend error: " + ex.message + "\n",
                "red"));

            maybeSave(index + " ERROR");
        });

        back.on("data", function(data) {
            maybeDisplay(data, index, false);
            maybeSave(index + " IN", data);

            front.write(data);
        });

        back.on("close", function() {
            maybeLog(maybeColor(prefix + "× backend closed\n",
                "red"));
            maybeSave(index + " BDISCONNECT");

            front.end();
        });
    }

    if (opts.tlsOut) {
        back = tls.connect(opts.back.port, opts.back.host, {
            rejectUnauthorized: !opts.tlsAcceptAll,
            secureProtocol: opts.tlsSecureProtocol,
            NPNProtocols: opts.tlsNPNProtocols,
            servername: opts.tlsServername
        }, handleClientConnected);
    } else {
        back = net.connect(opts.back, handleClientConnected);
    }

    front.on("error", function(ex) {
        maybeLog(maybeColor(
            prefix + "× frontend connection error: " + ex.message + "\n",
            "red"));

        maybeSave(index + " FRONTERROR");

        front.end();
        back.end();
    });

    back.on("error", function(ex) {
        maybeLog(maybeColor(
            prefix + "× backend connection error: " + ex.message + "\n",
            "red"));

        maybeSave(index + " BCONNECTERROR");

        front.end();
    });
}

if (opts.outFilename)
    outFile = fs.openSync(opts.outFilename, "w");

if (opts.tlsIn) {
    server = tls.createServer(opts.tls, handleFrontConnection)

    server.on("clientError", function(ex, pair) {
        var front = pair.cleartext,
            addr = (front
                ? front.remoteAddress + ":" + front.remotePort
                : "unknown:unknown");

        maybeLog(maybeColor("   × TLS client error from "
            + addr + ": " + ex.message + "\n",
            "red"));

        maybeSave("0 TLSERROR " + addr);
    });
} else {
    server = net.createServer(handleFrontConnection);
}

server.on("error", function(ex) {
    maybeLog(maybeColor("   × server error: " + ex.message + "\n", "red"));

    maybeSave("0 SERVERERROR");
});

server.listen(opts.front.port, opts.front.host, function() {
    maybeLog(maybeColor("   ★ listening on " + opts.front.host + ":" + opts.front.port + "\n"));

    maybeSave("0 START " + new Date().toISOString());
});
