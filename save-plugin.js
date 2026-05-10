import fs from 'fs';
import path from 'path';

const START = '/* === GRAPESJS MANAGED CSS START === */';
const END = '/* === GRAPESJS MANAGED CSS END === */';

function removeManagedCss(css) {
  const pattern = new RegExp(`${START}[\\s\\S]*?${END}`, 'g');
  return css.replace(pattern, '').trim();
}

export default function savePlugin() {
  return {
    name: 'save-template-plugin',

    configureServer(server) {
      server.middlewares.use('/save-template', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        let body = '';

        req.on('data', chunk => {
          body += chunk;
        });

        req.on('end', () => {
          try {
            const data = JSON.parse(body);

            const folder = data.folder.replace(/^\/+|\/+$/g, '');
            const htmlFile = data.htmlFile;
            const cssFile = data.cssFile;

            const existingHtmlPath = path.resolve('public', folder, htmlFile);
            const existingCssPath = path.resolve('public', folder, cssFile);

            const existingCss = fs.existsSync(existingCssPath)
              ? fs.readFileSync(existingCssPath, 'utf8')
              : data.originalCss || '';

            const preservedCss = removeManagedCss(existingCss);

            const finalCss = `${preservedCss}

${START}
${data.css}
${END}
`;

            fs.writeFileSync(existingHtmlPath, data.html, 'utf8');
            fs.writeFileSync(existingCssPath, finalCss, 'utf8');

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              ok: false,
              error: error.message,
            }));
          }
        });
      });
      server.middlewares.use('/upload-template-asset', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        let body = '';

        req.on('data', chunk => {
          body += chunk;
        });

        req.on('end', () => {
          try {
            const data = JSON.parse(body);

            const folder = data.folder.replace(/^\/+|\/+$/g, '');
            const filename = path.basename(data.filename);
            const base64 = data.base64.split(',').pop();

            const assetPath = path.resolve('public', folder, filename);

            fs.writeFileSync(assetPath, Buffer.from(base64, 'base64'));

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              ok: true,
              filename,
              relativePath: `./${filename}`,
              publicPath: `/${folder}/${filename}`,
            }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              ok: false,
              error: error.message,
            }));
          }
        });
      });
    },
  };
}