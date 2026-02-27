#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Simple CSS minifier that:
 * 1. Removes comments (/* ... * /)
 * 2. Removes extra whitespace (but preserves spaces needed for CSS syntax)
 * 3. Preserves CSS variable definitions and calc()
 */
function minifyCSS(css) {
  // Remove comments (both /* ... */ and // comments)
  let result = css.replace(/\/\*[\s\S]*?\*\//g, '');
  result = result.replace(/\/\/.*$/gm, '');

  // Remove unnecessary whitespace
  // Collapse multiple spaces/tabs/newlines to a single space
  result = result.replace(/\s+/g, ' ');

  // Remove spaces around colons, semicolons, commas, braces, parentheses
  result = result.replace(/\s*([{}:;,])\s*/g, '$1');

  // Remove spaces before !important
  result = result.replace(/\s*!\s*important/g, '!important');

  // Preserve spaces in calc() and var()
  // This is a simple approach - may need refinement for complex CSS
  // Remove spaces around operators but keep inside parentheses
  result = result.replace(/calc\(([^)]+)\)/g, (match, inner) => {
    // Remove spaces around + - * / but keep within parentheses
    const cleaned = inner.replace(/\s*([+\-*/])\s*/g, '$1');
    return `calc(${cleaned})`;
  });

  // Trim leading/trailing spaces
  result = result.trim();

  return result;
}

// Main execution
if (require.main === module) {
  const cssDir = path.join(__dirname, 'public', 'css');
  const outputPath = path.join(__dirname, 'public', 'styles-modern.min.css');

  try {
    const cssFiles = fs.readdirSync(cssDir)
      .filter(f => f.endsWith('.css'))
      .sort()
      .map(f => path.join(cssDir, f));

    console.log(`   Reading ${cssFiles.length} CSS files from public/css/`);

    const css = cssFiles
      .map(f => fs.readFileSync(f, 'utf8'))
      .join('\n');

    const minified = minifyCSS(css);

    fs.writeFileSync(outputPath, minified);

    const originalSize = Buffer.from(css).length;
    const minifiedSize = Buffer.from(minified).length;
    const reduction = ((originalSize - minifiedSize) / originalSize * 100).toFixed(2);

    console.log(`✅ CSS minified successfully!`);
    console.log(`   Original: ${originalSize} bytes`);
    console.log(`   Minified: ${minifiedSize} bytes`);
    console.log(`   Reduction: ${reduction}%`);
    console.log(`   Saved to: ${outputPath}`);
  } catch (error) {
    console.error('❌ CSS minification failed:', error.message);
    process.exit(1);
  }
}

module.exports = { minifyCSS };