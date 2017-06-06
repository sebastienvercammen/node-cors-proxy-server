# Node.js CORS proxy server

A simple CORS proxy server that supports HTTP(S) request proxying.

## Getting Started

These instructions will help you deploy the project on a live system.

**Important:** The default configuration example file `.env.example` overwrites the `NODE_ENV` environment variable to `production` for security purposes.

### Prerequisites

- [Node.js v6.10.3 or higher](https://nodejs.org/en/)
- npm v4.6.0 or higher

```
To update npm:
npm install -g npm
```

### Installing

Make sure node.js and npm are properly installed:

```
node -v
npm -v
```

Clone the project:

```
git clone http://USERNAME@gitlab.sebastienvercammen.be/devkat/node-cors-proxy-server.git
```

Make sure you are in the project directory with your terminal, and install the dependencies:

```
npm install
```

Copy the example configuration file `.env.example` to `.env`:

```
Linux:
cp .env.example .env

Windows:
copy .env.example .env
```

And presto, you're ready to configure.

After configuring, start the server with:

```
node index.js
```

### Configuration

#### Settings you must review

```
# Enable or disable verbose console logging:
DEBUG=true

# Webserver host IP to bind to. 0.0.0.0 binds to all interfaces.
WEB_HOST=0.0.0.0

# Webserver port.
WEB_PORT=8080
```

#### Enabling proxies

```
ENABLE_PROXIES=true
PROXY_LIST_PATH=/my/proxy/path/proxies.txt
```

The proxy list should be formatted as one proxy per line, in a complete format (e.g. `http://user:pass@host.com`).

#### Enabling the HTTPS webserver

```
ENABLE_HTTPS=true

WEB_SSL_PORT=8081

SSL_KEY_PATH=/etc/ssl/self-signed/server.key
SSL_CERT_PATH=/etc/ssl/self-signed/server.crt
```

## License

This project is licensed under the AGPLv3 license - see the <LICENSE> file for details.
