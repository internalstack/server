# InternalStack Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Finternalstack%2Fserver.svg?type=shield&issueType=license)](https://app.fossa.com/projects/git%2Bgithub.com%2Finternalstack%2Fserver?ref=badge_shield&issueType=license)

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Finternalstack%2Fserver.svg?type=shield&issueType=security)](https://app.fossa.com/projects/git%2Bgithub.com%2Finternalstack%2Fserver?ref=badge_shield&issueType=security)

InternalStack Server empowers you to build internal applications for your team using only backend TypeScript/JavaScript code. With a declarative API, streamline your development by focusing on business logic instead of things like CORS troubleshooting.

```typescript
import { internalStack } from '@internalstack/server';

const server = await internalStack('live_psk_5b2d902f24a057349d9f2d1c385fef7c59');

server.statefulSession(async (io, { user }) => {
  const note = await io.input.text('Note');
  console.log(user, 'says: ', note);
  // e.g. e.ripley@internalstack.com says: Hello World!
});
```

InternalStack Server is free, open-source software designed to run on-premise.

## 🌟 Quickstart

For a fast setup, please refer to our [Quickstart Guide](https://internalstack.com/docs/quickstart).

## 📦 Installation

```sh
# Using pnpm
pnpm i @internalstack/server

# Using npm
npm i @internalstack/server

# Using bun
bun add @internalstack/server

# Using yarn
yarn add @internalstack/server
```

## 🚀 Deployment

To ensure robust operation, we recommend using a process manager like [PM2](https://github.com/Unitech/pm2), which will automatically restart your server as needed.

### Steps to Deploy

1. **Install PM2**

   ```sh
   npm install pm2 -g
   ```

2. **Start Your Application**

   You can start your server with TypeScript or JavaScript:

   ```sh
   pm2 start server.ts
   # or
   pm2 start server.js
   ```

## ☁️ InternalStack Cloud

Explore our free-forever tier for smaller teams at [InternalStack Cloud](https://internalstack.com).

Note: InternalStack Cloud is a premium, closed-source solution offering advanced functionalities such as:

- Single Sign-On (SSO)
- Authorization
- Socket proxying
- Enhanced rendering capabilities

Sign up for a free account at [InternalStack Cloud](https://internalstack.com). (No credit card required!)

## 🕮 Open Source Longevity

Should InternalStack Cloud discontinue, all closed-source components (rendering, authorization, SSO, socket proxying) will be publicly available and re-licensed under the MIT license, ensuring ongoing accessibility and community contributions.

---

We take pride in making development breezy and efficient. Contributions and feedback are welcome. Let's build something amazing together! 🚀


## Alternatives
Looking for a fully self-hostable solution? Maybe check out [Interval](https://github.com/interval/server)!

## Inspiration and credit
The developer-facing API design was heavily inspired by the landing demos on [Interval](https://interval.com)