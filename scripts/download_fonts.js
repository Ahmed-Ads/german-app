const fs = require('fs');
const https = require('https');
const path = require('path');

const fontsDir = path.resolve(__dirname, '..', 'fonts');
if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  const cssUrl = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap';
  
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  };

  https.get(cssUrl, options, (res) => {
    let rawCss = '';
    res.on('data', chunk => rawCss += chunk);
    res.on('end', async () => {
      let localCss = rawCss;
      const urlRegex = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g;
      let match;
      const downloads = [];
      let idx = 0;
      const urlMap = new Map();

      while ((match = urlRegex.exec(rawCss)) !== null) {
        const url = match[1];
        if (!urlMap.has(url)) {
          const ext = path.extname(url.split('?')[0]) || '.woff2';
          const filename = `font_${++idx}${ext}`;
          urlMap.set(url, filename);
          downloads.push({ url, filename });
        }
      }

      console.log(`Found ${downloads.length} unique font files to download.`);
      for (const item of downloads) {
        const dest = path.join(fontsDir, item.filename);
        if (!fs.existsSync(dest)) {
          console.log(`Downloading ${item.filename}...`);
          await download(item.url, dest);
        }
      }

      for (const [url, filename] of urlMap.entries()) {
        localCss = localCss.split(url).join(`./fonts/${filename}`);
      }

      fs.writeFileSync(path.join(fontsDir, 'fonts.css'), localCss, 'utf8');
      console.log('Successfully created fonts/fonts.css and saved all woff2 font files!');
    });
  });
}

main().catch(console.error);
