# Third-Party Notices and Licenses

This project vendors or self-hosts the following third-party open-source components.

---

## 1. Self-Hosted Web Fonts (`fonts/`)

The application self-hosts web fonts to enable complete offline functionality without external CDN dependencies.

### Cairo Font Family
- **Component**: Cairo (`Cairo-Regular`, `Cairo-SemiBold`, `Cairo-Bold`, `Cairo-ExtraBold`)
- **Files**: `fonts/font_1.woff2`, `fonts/font_2.woff2`, `fonts/font_3.woff2`, `fonts/fonts.css`
- **License Identifier**: SIL Open Font License 1.1 (OFL-1.1) — *Note: verify against upstream source as binary .woff2 headers do not contain license text.*
- **Upstream Source**: https://github.com/Gue3bara/Cairo / https://fonts.google.com/specimen/Cairo
- **Full License Text**: full license text: to be added by the owner from the upstream source

### Space Grotesk Font Family
- **Component**: Space Grotesk (`SpaceGrotesk-Medium`, `SpaceGrotesk-Bold`)
- **Files**: `fonts/font_4.woff2`, `fonts/font_5.woff2`, `fonts/font_6.woff2`, `fonts/fonts.css`
- **License Identifier**: SIL Open Font License 1.1 (OFL-1.1) — *Note: verify against upstream source as binary .woff2 headers do not contain license text.*
- **Upstream Source**: https://github.com/floriankarsten/space-grotesk / https://fonts.google.com/specimen/Space+Grotesk
- **Full License Text**: full license text: to be added by the owner from the upstream source

---

## 2. Bundled Firebase JavaScript SDK (`vendor/firebase-sync.bundle.js`)

The application bundles Firebase Auth and Firestore for optional cloud sync.

- **Component**: Firebase JS SDK (`firebase/app`, `firebase/auth`, `firebase/firestore`)
- **File**: `vendor/firebase-sync.bundle.js`
- **Version**: 12.19.0 (as specified in `package.json` and `package-lock.json`)
- **License Identifier**: Apache-2.0
- **Upstream Source**: https://github.com/firebase/firebase-js-sdk
- **Full License Text**: full license text: to be added by the owner from the upstream source
