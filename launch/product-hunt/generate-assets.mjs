import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const root = path.resolve(import.meta.dirname, "../..");
const outputDir = path.resolve(import.meta.dirname, "assets");
const sourceDir = path.resolve(import.meta.dirname, "source");
const iconPath = path.join(root, "icons/icon-128.png");
const popupPath = path.join(sourceDir, "popup-0.1.3.png");

await fs.mkdir(outputDir, { recursive: true });

const palette = {
  cream: "#f1ebe7",
  cream2: "#e7dfda",
  ink: "#0b0b0b",
  orange: "#ff752f",
  blue: "#50699c",
  blueDark: "#314873",
  white: "#ffffff",
  muted: "#556075",
};

function esc(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function line(text, x, y, size, color = palette.ink, weight = 700) {
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(text)}</text>`;
}

function pill(text, x, y, width, fill = palette.orange, color = palette.ink) {
  return `
    <rect x="${x}" y="${y}" width="${width}" height="42" rx="21" fill="${fill}"/>
    ${line(text, x + 20, y + 28, 18, color, 700)}
  `;
}

function baseSvg(content, eyebrow) {
  return Buffer.from(`
    <svg width="1270" height="760" viewBox="0 0 1270 760" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000000" flood-opacity="0.18"/>
        </filter>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette.cream}"/>
          <stop offset="100%" stop-color="${palette.cream2}"/>
        </linearGradient>
      </defs>
      <rect width="1270" height="760" fill="url(#bg)"/>
      <circle cx="1185" cy="72" r="168" fill="${palette.orange}" opacity="0.12"/>
      <circle cx="86" cy="736" r="190" fill="${palette.blue}" opacity="0.10"/>
      ${line(eyebrow.toUpperCase(), 70, 72, 18, palette.blueDark, 800)}
      ${content}
    </svg>
  `);
}

async function popupComposite({ left = 880, top = 48, width = 285, height = 665 } = {}) {
  const image = await sharp(popupPath)
    .resize({ width, height, fit: "cover", position: "top" })
    .png()
    .toBuffer();

  const frame = Buffer.from(`
    <svg width="${width + 30}" height="${height + 30}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width + 30}" height="${height + 30}" rx="26" fill="#111111" filter="url(#shadow)"/>
    </svg>
  `);

  return [
    { input: frame, left: left - 15, top: top - 15 },
    { input: image, left, top },
  ];
}

async function render(name, svg, composites = []) {
  await sharp(svg)
    .composite(composites)
    .png()
    .toFile(path.join(outputDir, name));
}

const icon88 = await sharp(iconPath).resize(88, 88).png().toBuffer();
const icon240 = await sharp(iconPath)
  .resize(240, 240, { kernel: sharp.kernel.nearest })
  .png()
  .toBuffer();

await fs.writeFile(path.join(outputDir, "thumbnail-240.png"), icon240);

await render(
  "gallery-01-hero.png",
  baseSvg(
    `
      ${line("A safer, more", 70, 170, 64)}
      ${line("satisfying way", 70, 238, 64)}
      ${line("to close tabs.", 70, 306, 64)}
      ${line("Review what goes.", 72, 382, 28, palette.blueDark, 600)}
      ${line("Watch every cleanup add up.", 72, 420, 28, palette.blueDark, 600)}
      ${pill("FREE CHROME EXTENSION", 70, 480, 286)}
      <rect x="70" y="558" width="675" height="118" rx="22" fill="${palette.ink}"/>
      ${line("Safe enough to trust.", 100, 608, 26, palette.white, 700)}
      ${line("Rewarding enough to repeat.", 100, 648, 26, palette.orange, 700)}
    `,
    "Tab Crushr"
  ),
  [
    ...(await popupComposite()),
  ]
);

await render(
  "gallery-02-review.png",
  baseSvg(
    `
      ${line("See exactly what", 70, 165, 58)}
      ${line("you’re crushing.", 70, 228, 58)}
      ${line("Tab Crushr finds the likely clutter.", 72, 292, 27, palette.blueDark, 600)}
      ${line("You make the final call.", 72, 330, 27, palette.blueDark, 600)}

      <rect x="70" y="386" width="680" height="82" rx="18" fill="${palette.white}"/>
      <circle cx="112" cy="427" r="18" fill="${palette.orange}"/>
      ${line("Duplicate Tabs", 148, 437, 26)}

      <rect x="70" y="486" width="680" height="82" rx="18" fill="${palette.white}"/>
      <circle cx="112" cy="527" r="18" fill="${palette.blue}"/>
      ${line("Old Tabs", 148, 537, 26)}

      <rect x="70" y="586" width="680" height="82" rx="18" fill="${palette.white}"/>
      <circle cx="112" cy="627" r="18" fill="${palette.ink}"/>
      ${line("All Tabs", 148, 637, 26)}
    `,
    "Review first"
  ),
  await popupComposite({ left: 878, top: 50, width: 288, height: 670 })
);

const progressCrop = await sharp(popupPath)
  .extract({ left: 0, top: 0, width: 460, height: 390 })
  .resize({ width: 520 })
  .png()
  .toBuffer();

await render(
  "gallery-03-progress.png",
  baseSvg(
    `
      ${line("Cleanup that", 70, 168, 62)}
      ${line("feels like progress.", 70, 235, 62)}
      ${line("Small sessions become visible momentum.", 72, 300, 27, palette.blueDark, 600)}

      <rect x="70" y="380" width="310" height="190" rx="24" fill="${palette.ink}"/>
      ${line("128", 100, 468, 62, palette.orange, 800)}
      ${line("tabs crushed", 102, 508, 22, palette.white, 600)}

      <rect x="402" y="380" width="350" height="190" rx="24" fill="${palette.blue}"/>
      ${line("15.0 GB", 432, 468, 58, palette.white, 800)}
      ${line("estimated RAM reclaimed", 434, 508, 20, palette.white, 600)}

      ${pill("MILESTONES + POST-CRUSH PAYOFF", 70, 612, 420)}
    `,
    "Visible momentum"
  ),
  [
    {
      input: Buffer.from(`<svg width="576" height="508" xmlns="http://www.w3.org/2000/svg"><rect width="576" height="508" rx="28" fill="${palette.ink}"/></svg>`),
      left: 804,
      top: 150,
    },
    { input: progressCrop, left: 832, top: 178 },
  ]
);

await render(
  "gallery-04-local.png",
  baseSvg(
    `
      ${line("Control stays", 70, 170, 62)}
      ${line("with you.", 70, 237, 62)}
      ${line("Useful automation without silent decisions.", 72, 302, 27, palette.blueDark, 600)}

      <rect x="70" y="380" width="530" height="112" rx="22" fill="${palette.white}"/>
      ${line("LOCAL BY DESIGN", 102, 424, 19, palette.blueDark, 800)}
      ${line("Cleanup data stays in your browser.", 102, 462, 24)}

      <rect x="625" y="380" width="555" height="112" rx="22" fill="${palette.white}"/>
      ${line("PROTECTED BY DEFAULT", 657, 424, 19, palette.blueDark, 800)}
      ${line("Active, pinned, and audible tabs are spared.", 657, 462, 22)}

      <rect x="70" y="518" width="530" height="112" rx="22" fill="${palette.white}"/>
      ${line("DISCARD MODE", 102, 562, 19, palette.blueDark, 800)}
      ${line("Free memory without closing the tab.", 102, 600, 24)}

      <rect x="625" y="518" width="555" height="112" rx="22" fill="${palette.white}"/>
      ${line("SAVE FOR LATER", 657, 562, 19, palette.blueDark, 800)}
      ${line("Keep a page without another bookmark.", 657, 600, 23)}

      ${pill("REVIEW. SAVE. CRUSH.", 70, 666, 278)}
    `,
    "Local and deliberate"
  ),
  [{ input: icon88, left: 1092, top: 650 }]
);

console.log(`Generated Product Hunt assets in ${outputDir}`);
