#!/usr/bin/env node
// Generates icon16.png, icon48.png, icon128.png using the @napi-rs/canvas package.
// Run: npm install @napi-rs/canvas  then  node generate.js
// If you don't want to install the package, open generate-icons.html in a browser instead.

const { createCanvas } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");

function makeIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const r = size / 2;

  // Background
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fillStyle = "#4f46e5";
  ctx.fill();

  // Mic body (rounded rect)
  const mw = size * 0.22;
  const mh = size * 0.34;
  const mx = r - mw / 2;
  const my = size * 0.18;
  const cr = mw / 2;
  ctx.beginPath();
  ctx.roundRect(mx, my, mw, mh, cr);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // Arc
  const arcR = size * 0.22;
  ctx.beginPath();
  ctx.arc(r, size * 0.5, arcR, Math.PI, 0, false);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = size * 0.07;
  ctx.lineCap = "round";
  ctx.stroke();

  // Stem
  ctx.beginPath();
  ctx.moveTo(r, size * 0.5 + arcR);
  ctx.lineTo(r, size * 0.72);
  ctx.stroke();

  // Base
  ctx.beginPath();
  ctx.moveTo(r - arcR * 0.7, size * 0.72);
  ctx.lineTo(r + arcR * 0.7, size * 0.72);
  ctx.stroke();

  const outPath = path.join(__dirname, `icon${size}.png`);
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`Written: ${outPath}`);
}

[16, 48, 128].forEach(makeIcon);
