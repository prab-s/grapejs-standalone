import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';

import presetWebpage from 'grapesjs-preset-webpage';
import blocksBasic from 'grapesjs-blocks-basic';
import pluginExport from 'grapesjs-plugin-export';

import './style.css';

let editor = null;
let currentOriginalCss = '';

function getTemplatePaths() {
  const folder = document
    .getElementById('template-folder')
    .value
    .replace(/^\/+|\/+$/g, '');

  const htmlFile = document.getElementById('template-html-file').value.trim();
  const cssFile = document.getElementById('template-css-file').value.trim();

  return {
    folder,
    htmlFile,
    cssFile,
    htmlPath: `/${folder}/${htmlFile}`,
    cssPath: `/${folder}/${cssFile}`,
  };
}

async function loadTemplate() {
  const {
    folder,
    htmlFile,
    cssFile,
    htmlPath,
    cssPath,
  } = getTemplatePaths();

  const [htmlRes, cssRes] = await Promise.all([
    fetch(htmlPath),
    fetch(cssPath),
  ]);

  if (!htmlRes.ok) {
    alert(`Could not load HTML file: ${htmlPath}`);
    return;
  }

  if (!cssRes.ok) {
    alert(`Could not load CSS file: ${cssPath}`);
    return;
  }

  let html = await htmlRes.text();

  html = html.replace(
    /src="\.\/([^"]+)"/g,
    `src="/${folder}/$1" data-save-src="./$1"`
  );

  html = html.replace(
    /src='\.\/([^']+)'/g,
    `src='/${folder}/$1' data-save-src='./$1'`
  );

  html = html.replace(
    /href="\.\/([^"]+)"/g,
    `href="/${folder}/$1" data-save-href="./$1"`
  );

  html = html.replace(
    /href='\.\/([^']+)'/g,
    `href='/${folder}/$1' data-save-href='./$1'`
  );

  currentOriginalCss = await cssRes.text();

  if (editor) {
    editor.destroy();
    editor = null;
  }

  editor = grapesjs.init({
    container: '#gjs',
    height: '100%',
    width: '100%',
    fromElement: false,
    storageManager: false,
    components: html,
    style: currentOriginalCss,

    canvas: {
      styles: [cssPath],
    },

    plugins: [
      presetWebpage,
      blocksBasic,
      pluginExport,
    ],
  });

  editor.BlockManager.add('pdf-page-break', {
    label: 'Page Break',
    category: 'PDF',
    content: '<div class="pdf-page-break">PDF PAGE BREAK</div>',
  });

  editor.BlockManager.add('pdf-no-break', {
    label: 'No Page Split',
    category: 'PDF',
    content: '<div class="pdf-avoid-break">Content here</div>',
  });

  editor.StyleManager.addSector('html-attributes', {
    name: 'HTML Attributes',
    open: true,
    properties: [
      {
        name: 'Selected element',
        property: 'data-gjs-attr-editor-placeholder',
        type: 'text',
        defaults: '',
        full: true,
      },
    ],
  });

  function chooseFileAsDataUrl(accept = 'image/*') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;

      input.addEventListener('change', () => {
        const file = input.files?.[0];

        if (!file) {
          resolve(null);
          return;
        }

        const reader = new FileReader();

        reader.onload = () => {
          resolve({
            file,
            dataUrl: reader.result,
          });
        };

        reader.readAsDataURL(file);
      });

      input.click();
    });
  }

  async function uploadAssetToTemplateFolder(file, dataUrl) {
    const res = await fetch('/upload-template-asset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder,
        filename: file.name,
        base64: dataUrl,
      }),
    });

    if (!res.ok) {
      alert('Asset upload failed');
      return null;
    }

    return await res.json();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  function findHtmlAttributesSector() {
    return [...document.querySelectorAll('.gjs-sm-sector')]
      .find((el) => el.textContent.includes('HTML Attributes'))
      ?.querySelector('.gjs-sm-properties');
  }

  function injectHtmlAttributeEditor() {
    const sector = findHtmlAttributesSector();
    const selected = editor.getSelected();

    if (!sector || !selected) return;

    const existing = sector.querySelector('[data-html-attribute-editor]');
    if (existing) existing.remove();

    const attrs = selected.getAttributes();
    const tagName = selected.get('tagName') || '';

    const builder = document.createElement('div');
    builder.setAttribute('data-html-attribute-editor', 'true');
    builder.style.padding = '8px';
    builder.style.width = '100%';
    builder.style.boxSizing = 'border-box';

    builder.innerHTML = `
      <label>Tag</label>
      <input readonly value="${escapeHtml(tagName)}" style="width:100%; margin-bottom:6px;">

      <label>src</label>
      <input data-attr-field="src" value="${escapeHtml(attrs.src || '')}" style="width:100%; margin-bottom:6px;">

      <button type="button" data-attr-upload-src style="width:100%; padding:6px; margin-bottom:8px; cursor:pointer;">
        Choose Image File
      </button>

      <label>href</label>
      <input data-attr-field="href" value="${escapeHtml(attrs.href || '')}" style="width:100%; margin-bottom:6px;">

      <label>alt</label>
      <input data-attr-field="alt" value="${escapeHtml(attrs.alt || '')}" style="width:100%; margin-bottom:6px;">

      <label>title</label>
      <input data-attr-field="title" value="${escapeHtml(attrs.title || '')}" style="width:100%; margin-bottom:6px;">

      <label>target</label>
      <select data-attr-field="target" style="width:100%; margin-bottom:8px;">
        <option value="">Same tab</option>
        <option value="_blank">New tab</option>
      </select>

      <button type="button" data-attr-apply style="width:100%; padding:6px; cursor:pointer;">
        Apply HTML Attributes
      </button>
    `;

    sector.appendChild(builder);

    const targetField = builder.querySelector('[data-attr-field="target"]');
    if (targetField) targetField.value = attrs.target || '';

    builder.querySelector('[data-attr-apply]').addEventListener('click', () => {
      const liveSelected = editor.getSelected();

      if (!liveSelected) {
        alert('Select an element first.');
        return;
      }

      const newAttrs = {};

      builder.querySelectorAll('[data-attr-field]').forEach((field) => {
        const name = field.getAttribute('data-attr-field');
        const value = field.value.trim();

        if (!value) return;

        if ((name === 'src' || name === 'href') && value.startsWith('./')) {
          newAttrs[name] = `/${folder}/${value.replace('./', '')}`;
          newAttrs[`data-save-${name}`] = value;
        } else {
          newAttrs[name] = value;
        }
      });

      liveSelected.addAttributes(newAttrs);

      editor.select(liveSelected);
      editor.refresh();
      injectHtmlAttributeEditor();
    });

    const uploadSrcButton = builder.querySelector('[data-attr-upload-src]');

    if (uploadSrcButton) {
      uploadSrcButton.addEventListener('click', async () => {
        const picked = await chooseFileAsDataUrl('image/*');

        if (!picked) return;

        const uploaded = await uploadAssetToTemplateFolder(picked.file, picked.dataUrl);

        if (!uploaded?.ok) {
          alert('Image upload failed');
          return;
        }

        const srcField = builder.querySelector('[data-attr-field="src"]');
        if (srcField) {
          srcField.value = uploaded.relativePath;
        }

        const liveSelected = editor.getSelected();

        if (liveSelected) {
          liveSelected.addAttributes({
            src: uploaded.publicPath,
            'data-save-src': uploaded.relativePath,
          });

          editor.select(liveSelected);
          editor.refresh();
        }

        editor.refresh();

        alert(`Uploaded and applied: ${uploaded.relativePath}`);
      });
    }
  }

  editor.on('component:selected', () => {
    setTimeout(injectHtmlAttributeEditor, 100);
  });

  editor.on('style:target', () => {
    setTimeout(injectHtmlAttributeEditor, 100);
  });

  editor.on('load', () => {
    setTimeout(injectHtmlAttributeEditor, 300);
  });

  function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (Number.isNaN(num)) return fallback;
    return Math.max(min, Math.min(max, num));
  }

  function hexToRgba(hex, opacityPercent) {
    const cleanHex = hex.replace('#', '');
    const expandedHex = cleanHex.length === 3
      ? cleanHex.split('').map((c) => c + c).join('')
      : cleanHex;

    const alpha = clampNumber(opacityPercent, 0, 100, 100) / 100;
    const bigint = parseInt(expandedHex, 16);

    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function rgbToHex(r, g, b) {
    return `#${[r, g, b]
      .map((value) => Number(value).toString(16).padStart(2, '0'))
      .join('')}`;
  }

  function getGradientValueFromInputs() {
    const type = document.querySelector('[data-gradient-field="type"]')?.value || 'linear';
    const angle = document.querySelector('[data-gradient-field="angle"]')?.value || '135';
    const direction = document.querySelector('[data-gradient-field="direction"]')?.value || '';
    const radialShape = document.querySelector('[data-gradient-field="radialShape"]')?.value || 'circle';
    const radialPosition = document.querySelector('[data-gradient-field="radialPosition"]')?.value || 'center';

    const colour1Hex = document.querySelector('[data-gradient-field="colour1"]')?.value || '#ffffff';
    const opacity1 = document.querySelector('[data-gradient-field="opacity1"]')?.value || '100';
    const stop1 = document.querySelector('[data-gradient-field="stop1"]')?.value || '0';

    const colour2Hex = document.querySelector('[data-gradient-field="colour2"]')?.value || '#000000';
    const opacity2 = document.querySelector('[data-gradient-field="opacity2"]')?.value || '100';
    const stop2 = document.querySelector('[data-gradient-field="stop2"]')?.value || '100';

    const colour1 = hexToRgba(colour1Hex, opacity1);
    const colour2 = hexToRgba(colour2Hex, opacity2);

    if (type === 'radial') {
      return `radial-gradient(${radialShape} at ${radialPosition}, ${colour1} ${stop1}%, ${colour2} ${stop2}%)`;
    }

    const linearDirection = direction || `${angle}deg`;
    return `linear-gradient(${linearDirection}, ${colour1} ${stop1}%, ${colour2} ${stop2}%)`;
  }

  function updateGradientReadout() {
    const output = document.querySelector('[data-gradient-output]');
    if (output) {
      output.value = getGradientValueFromInputs();
    }
  }

  function applyGradientToSelected() {
    const selected = editor.getSelected();

    if (!selected) {
      alert('Select an element first.');
      return;
    }

    const gradient = getGradientValueFromInputs();

    selected.addStyle({
      'background-image': gradient,
    });

    const cssInput = document.querySelector('[data-gradient-css]');
    if (cssInput) {
      cssInput.value = gradient;
    }

    editor.StyleManager.render();
    editor.refresh();
    updateGradientReadout();
  }

  function setGradientField(name, value) {
    const field = document.querySelector(`[data-gradient-field="${name}"]`);
    if (field && value !== undefined && value !== null) {
      field.value = value;
    }
  }

  function parseColourStop(colourValue, stopValue, colourField, opacityField, stopField) {
    const rgbaMatch = colourValue.match(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)/
    );

    if (rgbaMatch) {
      const r = rgbaMatch[1];
      const g = rgbaMatch[2];
      const b = rgbaMatch[3];
      const alpha = rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) : 1;

      setGradientField(colourField, rgbToHex(r, g, b));
      setGradientField(opacityField, Math.round(alpha * 100));
      setGradientField(stopField, stopValue);
      return;
    }

    const hexMatch = colourValue.match(/#[0-9a-fA-F]{3,8}/);

    if (hexMatch) {
      setGradientField(colourField, hexMatch[0]);
      setGradientField(opacityField, 100);
      setGradientField(stopField, stopValue);
    }
  }

  function syncInputsFromGradient(gradient) {
    if (!gradient) return;

    const colourStopPattern = '(rgba?\\([^)]*\\)|#[0-9a-fA-F]{3,8})\\s+(\\d+)%';

    const linearRegex = new RegExp(
      `linear-gradient\\((.*?),\\s*${colourStopPattern}\\s*,\\s*${colourStopPattern}\\s*\\)`
    );

    const linearMatch = gradient.match(linearRegex);

    if (linearMatch) {
      const directionOrAngle = linearMatch[1];

      setGradientField('type', 'linear');

      if (directionOrAngle.endsWith('deg')) {
        setGradientField('direction', '');
        setGradientField('angle', directionOrAngle.replace('deg', ''));
      } else {
        setGradientField('direction', directionOrAngle);
      }

      parseColourStop(linearMatch[2], linearMatch[3], 'colour1', 'opacity1', 'stop1');
      parseColourStop(linearMatch[4], linearMatch[5], 'colour2', 'opacity2', 'stop2');
      return;
    }

    const radialRegex = new RegExp(
      `radial-gradient\\((circle|ellipse)\\s+at\\s+(.*?),\\s*${colourStopPattern}\\s*,\\s*${colourStopPattern}\\s*\\)`
    );

    const radialMatch = gradient.match(radialRegex);

    if (radialMatch) {
      setGradientField('type', 'radial');
      setGradientField('radialShape', radialMatch[1]);
      setGradientField('radialPosition', radialMatch[2]);

      parseColourStop(radialMatch[3], radialMatch[4], 'colour1', 'opacity1', 'stop1');
      parseColourStop(radialMatch[5], radialMatch[6], 'colour2', 'opacity2', 'stop2');
    }
  }

  function syncGradientBuilderFromSelected() {
    const selected = editor.getSelected();
    if (!selected) return;

    const style = selected.getStyle();

    let backgroundImage = style['background-image'] || '';

    if (!backgroundImage) {
      const selectedEl = selected.getEl();

      if (selectedEl) {
        backgroundImage = editor.Canvas.getWindow()
          .getComputedStyle(selectedEl)
          .getPropertyValue('background-image');
      }

      if (backgroundImage === 'none') {
        backgroundImage = '';
      }
    }

    const cssInput = document.querySelector('[data-gradient-css]');
    const output = document.querySelector('[data-gradient-output]');

    if (backgroundImage) {
      syncInputsFromGradient(backgroundImage);
    }

    if (cssInput) {
      cssInput.value = backgroundImage;
    }

    if (output) {
      output.value = backgroundImage || getGradientValueFromInputs();
    }
  }

  function findAdvancedGradientSector() {
    return [...document.querySelectorAll('.gjs-sm-sector')]
      .find((el) => el.textContent.includes('Advanced Gradient'))
      ?.querySelector('.gjs-sm-properties');
  }

  function injectGradientBuilder() {
    const sector = findAdvancedGradientSector();

    if (!sector) return;

    const placeholder = sector.querySelector('[data-sm-property="data-gradient-sector-placeholder"]');
    if (placeholder) {
      placeholder.style.display = 'none';
    }

    if (sector.querySelector('[data-gradient-builder]')) {
      syncGradientBuilderFromSelected();
      return;
    }

    const builder = document.createElement('div');
    builder.setAttribute('data-gradient-builder', 'true');
    builder.style.padding = '8px';
    builder.style.width = '100%';
    builder.style.boxSizing = 'border-box';

    builder.innerHTML = `
      <label>Type</label>
      <select data-gradient-field="type" style="width:100%; margin-bottom:6px;">
        <option value="linear">Linear</option>
        <option value="radial">Radial</option>
      </select>

      <label>Linear angle</label>
      <input data-gradient-field="angle" type="number" min="0" max="360" value="135" style="width:100%; margin-bottom:6px;">

      <label>Linear direction</label>
      <select data-gradient-field="direction" style="width:100%; margin-bottom:6px;">
        <option value="">Use angle</option>
        <option value="to right">Left → Right</option>
        <option value="to left">Right → Left</option>
        <option value="to bottom">Top → Bottom</option>
        <option value="to top">Bottom → Top</option>
        <option value="to bottom right">Top Left → Bottom Right</option>
        <option value="to bottom left">Top Right → Bottom Left</option>
      </select>

      <label>Radial shape</label>
      <select data-gradient-field="radialShape" style="width:100%; margin-bottom:6px;">
        <option value="circle">Circle</option>
        <option value="ellipse">Ellipse</option>
      </select>

      <label>Radial position</label>
      <select data-gradient-field="radialPosition" style="width:100%; margin-bottom:6px;">
        <option value="center">Centre</option>
        <option value="top">Top</option>
        <option value="bottom">Bottom</option>
        <option value="left">Left</option>
        <option value="right">Right</option>
        <option value="top left">Top left</option>
        <option value="top right">Top right</option>
        <option value="bottom left">Bottom left</option>
        <option value="bottom right">Bottom right</option>
      </select>

      <label>Colour 1</label>
      <input data-gradient-field="colour1" type="color" value="#ffffff" style="width:100%; margin-bottom:6px;">

      <label>Colour 1 opacity (%)</label>
      <input data-gradient-field="opacity1" type="number" min="0" max="100" value="100" style="width:100%; margin-bottom:6px;">

      <label>Stop 1 (%)</label>
      <input data-gradient-field="stop1" type="number" min="0" max="100" value="0" style="width:100%; margin-bottom:6px;">

      <label>Colour 2</label>
      <input data-gradient-field="colour2" type="color" value="#000000" style="width:100%; margin-bottom:6px;">

      <label>Colour 2 opacity (%)</label>
      <input data-gradient-field="opacity2" type="number" min="0" max="100" value="100" style="width:100%; margin-bottom:6px;">

      <label>Stop 2 (%)</label>
      <input data-gradient-field="stop2" type="number" min="0" max="100" value="100" style="width:100%; margin-bottom:6px;">

      <label>Generated CSS</label>
      <textarea data-gradient-output readonly style="width:100%; min-height:70px; margin-bottom:8px;"></textarea>

      <button type="button" data-gradient-apply style="width:100%; padding:6px; cursor:pointer;">
        Apply Gradient
      </button>
    `;

    sector.appendChild(builder);

    builder.querySelectorAll('input, select').forEach((input) => {
      input.addEventListener('input', updateGradientReadout);
      input.addEventListener('change', updateGradientReadout);
    });

    builder.querySelector('[data-gradient-apply]').addEventListener('click', applyGradientToSelected);

    updateGradientReadout();
    syncGradientBuilderFromSelected();
  }

  editor.StyleManager.addSector('advanced-gradient', {
    name: 'Advanced Gradient',
    open: true,
    properties: [
      {
        name: '',
        property: 'data-gradient-sector-placeholder',
        type: 'text',
        defaults: '',
        full: true,
      },
    ],
  });

  editor.on('style:target', () => {
    setTimeout(injectGradientBuilder, 100);
  });

  editor.on('component:selected', () => {
    setTimeout(injectGradientBuilder, 100);
  });

  editor.on('load', () => {
    setTimeout(injectGradientBuilder, 300);
  });

  editor.Panels.addButton('options', {
    id: 'save-files',
    className: 'fa fa-save',
    command: 'save-files',
    attributes: { title: 'Overwrite selected HTML and CSS files' },
  });

  editor.Commands.add('save-files', {
    async run(editor) {

      let html = editor.getHtml();

      html = html.replace(
        /src="\/([^"]+)"\s+data-save-src="([^"]+)"/g,
        'src="$2"'
      );

      html = html.replace(
        /data-save-src="([^"]+)"\s+src="\/([^"]+)"/g,
        'src="$1"'
      );

      html = html.replace(
        /href="\/([^"]+)"\s+data-save-href="([^"]+)"/g,
        'href="$2"'
      );

      html = html.replace(
        /data-save-href="([^"]+)"\s+href="\/([^"]+)"/g,
        'href="$1"'
      );

      const grapesCss = editor.getCss();

      const res = await fetch('/save-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder,
          htmlFile,
          cssFile,
          html,
          css: currentOriginalCss
            .replace(/\/\* === GRAPESJS MANAGED CSS START === \*\/[\s\S]*?\/\* === GRAPESJS MANAGED CSS END === \*\//g, '')
            .trim()
            + '\n\n/* === GRAPESJS MANAGED CSS START === */\n'
            + grapesCss
            + '\n/* === GRAPESJS MANAGED CSS END === */\n',
          originalCss: currentOriginalCss,
        }),
      });

      if (!res.ok) {
        alert('Save failed');
        return;
      }

      alert(`Saved ${folder}/${htmlFile} and ${folder}/${cssFile}`);
    },
  });
}

document.getElementById('load-template').addEventListener('click', loadTemplate);

loadTemplate();